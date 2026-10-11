// electron/ipc/mail-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { getDb, listAccounts, getAccountByEmail, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, saveSentMessage, saveDraftMessage, listAttachments, getAllUnreadCounts } = require('../db.cjs');
const { syncInbox, syncFolder, fetchBody, fetchAttachment, markSeen, markUnseen, createTransporter, buildRaw, sendRaw, appendToSent, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, moveToFolder, batchMoveToFolder, withClient, invalidateClient } = require('../mail.cjs');
const { freshCredentials, withAuthRetry } = require('../token-auth.cjs');
const { markDeleted, isDeleted, clearDeleted, _lastSyncTime, _activeFolderPerAccount, imapLock, SYNC_CONCURRENCY, syncOneInboxWithTimeout, isTimeoutError, runWithConcurrency } = require('../imap-queue.cjs');
const { notifyNewMessages } = require('../notifications.cjs');
const { splitAddresses, buildReply, buildReplyAll, buildForward } = require('../compose.cjs');
const { detectSettings } = require('../providers.cjs');
const { withIpcTimeout, adjustUnread, countUnread, readFolderCache, fetchFoldersFromImap, persistBody, isTrashFolder, getTrashFolder, getSpamFolder, getArchiveFolder, friendlySyncError, emptySpecialFolder, TRASH_PATTERNS, SPAM_PATTERNS, _folderListFetchedAt, FOLDER_LIST_REFRESH_MS } = require('../ipc-helpers.cjs');


// Yanıt/ileri şablonu — mail:reply-template / reply-all-template / forward-template
// handler'larının ortak gövdesi. ipc-helpers'a değil buraya aittir: yalnız
// bu modülün handler'ları kullanır ve bağımlılıkları (compose.cjs) zaten burada.
async function composeTemplate(email, folderPath, uid, mode) {
  const folder = folderPath || 'INBOX';
  const meta = getMessageMeta(email, folder, uid);
  if (!meta) throw new Error('Mesaj bulunamadı.');
  let b = getMessageBody(email, folder, uid);
  if (!(b && (b.body_html || b.body_text))) {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    const fetched = await fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds });
    persistBody(email, folder, uid, fetched);
    b = { body_html: fetched.html, body_text: fetched.text, message_id: fetched.messageId, references: fetched.references };
  }
  const original = {
    from: meta.from_addr,
    to: meta.to_addr,
    cc: meta.cc_addr,
    subject: meta.subject,
    date: meta.date,
    html: b.body_html,
    text: b.body_text,
    messageId: b.message_id,
    references: b.references || [],
  };
  if (mode === 'reply') return buildReply(original);
  if (mode === 'replyAll') return buildReplyAll(original, email);
  return buildForward(original);
}

function register(_deps) {

ipcMain.handle('mail:sync', async (_evt, email) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  try {
    const normEmail = (email || '').toLowerCase().trim();
    // Arka plan turuyla çakışmayı önle: mail:sync-folder ile aynı disiplinde,
    // iş başlamadan ÖNCE damgala (35 sn sürecek bir elle senkron boyunca
    // arka plan turu aynı işi ikinci kez koşmasın).
    _lastSyncTime.set(normEmail, Date.now());
    const res = await withIpcTimeout(
      withAuthRetry(acc, (creds) =>
        imapLock(email, () => syncInbox({
          provider: acc.provider, email: acc.email, db: getDb(), ...creds,
          // Az önce silinen iletilerin geri gelmesini engelle (mail:sync-folder ile aynı davranış)
          skipUid: (uid) => isDeleted(email, 'INBOX', String(uid)),
        }))
      ),
      110000,
      'Eşitleme',
    );
    if (res && res.newMessages && res.newMessages.length > 0) {
      notifyNewMessages(acc.email, res.newMessages);
    }
    return res;
  } catch (e) {
    if (isTimeoutError(e)) { try { invalidateClient(email); } catch {} }
    throw new Error(friendlySyncError(acc.provider, e));
  }
});

ipcMain.handle('mail:folders', async (_evt, email) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');

  // 1. Önbellek yeterince tazeyse ANINDA (0 ms) dön.
  //    `length > 2` eşiği çok gevşekti: 3 klasör kaydedildikten sonra IMAP'e
  //    bir daha hiç gidilmiyordu, böylece web'de oluşturulan yeni klasörler
  //    hiç görünmüyor, sunucuda silinenler kalıcı listeleniyordu.
  //    Artık hem yeterli sayıda klasör olmalı hem de SINIRLI BİR SÜRE boyunca
  //    tazelenmemiş olmalı (periyodik arka plan tazelemesi).
  try {
    const cached = readFolderCache(email);
    if (cached.length >= 3) {
      const stale = Date.now() - (_folderListFetchedAt.get((email || '').toLowerCase().trim()) || 0);
      if (stale < FOLDER_LIST_REFRESH_MS) return cached;
    }
  } catch {}

  // 2. Önbellek boş, eksik veya bayat: IMAP'ten taze listeyi çekip DB'ye yaz
  try {
    await fetchFoldersFromImap(acc);
    const fresh = readFolderCache(email);
    if (fresh.length > 0) return fresh;
  } catch (e) {
    console.warn(`[mail:folders] ${email} taze liste alınamadı, mevcut önbellek kullanılıyor:`, e?.message);
  }
  try {
    return readFolderCache(email);
  } catch {
    return [];
  }
});

ipcMain.handle('mail:folders-refresh', async (_evt, email) => {
  // Önbelleğe bakmadan IMAP'ten zorla tazele (klasör listesi eksikse manuel kurtarma)
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  try {
    await fetchFoldersFromImap(acc);
  } catch (e) {
    throw new Error(friendlySyncError(acc.provider, e));
  }
  return readFolderCache(email);
});

ipcMain.handle('mail:sync-folder', async (_evt, email, folderPath) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  try {
    const normEmail = (email || '').toLowerCase().trim();
    const normFolder = (folderPath || 'INBOX').trim();
    _lastSyncTime.set(normEmail, Date.now());
    _activeFolderPerAccount.set(normEmail, normFolder);

    const res = await withIpcTimeout(
      withAuthRetry(acc, (creds) =>
        imapLock(email, async () => {
          // Kullanıcı bu sırada başka bir klasöre geçtiyse terk edilen klasörü atla (IMAP kilitleme yapma)
          const latest = _activeFolderPerAccount.get(normEmail);
          if (latest && latest.toLowerCase() !== normFolder.toLowerCase()) {
            console.log(`[sync-folder] ${email} '${normFolder}' atlandı; kullanıcı '${latest}' klasörüne geçti.`);
            return { total: 0, synced: 0, skipped: true };
          }
          return syncFolder({
            provider: acc.provider, email: acc.email, folderPath: normFolder, db: getDb(), ...creds,
            skipUid: (uid) => isDeleted(email, normFolder, String(uid)),
          });
        })),
      110000,
      'Klasör eşitleme',
    );
    if (normFolder.toUpperCase() === 'INBOX' && res && res.newMessages && res.newMessages.length > 0) {
      notifyNewMessages(acc.email, res.newMessages);
    }
    return res;
  } catch (e) {
    if (isTimeoutError(e)) { try { invalidateClient(email); } catch {} }
    throw new Error(friendlySyncError(acc.provider, e));
  }
});

ipcMain.handle('mail:list', (_evt, email, folderPath, limit, offset) => {
  return listMessages(email, folderPath || 'INBOX', limit || 50, offset || 0);
});

ipcMain.handle('mail:count', (_evt, email, folderPath) => {
  return countFolderMessages(email, folderPath || 'INBOX');
});

ipcMain.handle('mail:list-unified', (_evt, limit, offset) => {
  return listUnifiedMessages(limit || 50, offset || 0);
});

ipcMain.handle('mail:count-unified', () => {
  return countUnifiedMessages();
});

ipcMain.handle('mail:unread-counts', () => {
  return getAllUnreadCounts();
});

ipcMain.handle('mail:search-unified', (_evt, query) => {
  if (!query || !query.trim()) return [];
  return searchUnifiedMessages(query.trim());
});

ipcMain.handle('mail:sync-all-inboxes', async () => {
  const accs = listAccounts();
  const fulls = [];
  for (const acc of accs) {
    try {
      const full = getAccountByEmail(acc.email);
      if (full) fulls.push(full);
    } catch { /* listeye devam */ }
  }
  // Sınırlı paralellik + hesap başına zaman aşımı: tek yavaş hesap
  // diğer 6 Gmail'i bloklamaz; her hesabın sonucu (başarı/hata) ayrı ayrı döner.
  const outcomes = await runWithConcurrency(fulls, SYNC_CONCURRENCY, (full) => syncOneInboxWithTimeout(full));
  const results = [];
  outcomes.forEach((o, i) => {
    const full = fulls[i];
    if (o.ok) {
      const res = o.value;
      if (res && res.newMessages && res.newMessages.length > 0) {
        notifyNewMessages(full.email, res.newMessages);
      }
      results.push({ email: full.email, ...res });
    } else {
      if (isTimeoutError(o.error)) { try { invalidateClient(full.email); } catch {} }
      const prov = full.provider;
      results.push({ email: full.email, error: friendlySyncError(prov, o.error) });
    }
  });
  return results;
});

ipcMain.handle('mail:sync-more', async (_evt, email, folderPath, beforeUid, limit) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  try {
    return await withIpcTimeout(
      withAuthRetry(acc, (creds) =>
        imapLock(email, () => syncFolder({
          provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX',
          db: getDb(), limit: limit || 50, beforeUid: beforeUid || null,
          ...creds,
          skipUid: (uid) => isDeleted(email, folderPath, String(uid)),
        }))),
      110000,
      'Eski iletiler',
    );
  } catch (e) {
    if (isTimeoutError(e)) { try { invalidateClient(email); } catch {} }
    throw new Error(friendlySyncError(acc.provider, e));
  }
});

ipcMain.handle('mail:search', (_evt, email, folderPath, query) => {
  if (!query || !query.trim()) return [];
  return searchMessages(email, folderPath || 'INBOX', query.trim());
});

ipcMain.handle('mail:thread', (_evt, email, folderPath, messageId) => {
  return getThreadMessages(email, folderPath || 'INBOX', messageId);
});

ipcMain.handle('mail:body', async (_evt, email, folderPath, uid) => {
  const folder = folderPath || 'INBOX';
  const cached = getMessageBody(email, folder, uid);
  if (cached && (cached.body_html || cached.body_text)) {
    return { html: cached.body_html, text: cached.body_text, messageId: cached.message_id || null, references: cached.references || [], cached: true };
  }
  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    return { html: cached?.body_html || null, text: cached?.body_text || null, messageId: null, references: [], cached: true };
  }
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  const creds = await freshCredentials(acc);
  // Mesaj taşındıysa (çöp kutusu vb.) alternatif klasörlerde de dene (sağlayıcıya özel)
  const candidates = [folder];
  if (acc.provider === 'google') {
    candidates.push('[Gmail]/Çöp kutusu', '[Gmail]/Trash');
  } else if (acc.provider === 'microsoft') {
    candidates.push('Deleted Items', 'Trash');
  } else {
    candidates.push('Trash', 'Deleted Items');
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (let i = 0; i < uniqueCandidates.length; i++) {
    const tryFolder = uniqueCandidates[i];
    try {
      const body = await imapLock(email, () =>
        fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...creds })
      );
      persistBody(email, folder, uid, body);
      return { ...body, cached: false };
    } catch (e) {
      const errStr = `${e?.message || ''} ${e?.responseText || ''} ${e?.response || ''}`.toLowerCase();
      
      const isConnError = /connection|socket|econnreset|etimedout|epipe|command failed|wrong_version_number|not connected/i.test(errStr);
      if (isConnError) {
        // Bağlantı/Exchange kilidi durumunda 2.5 saniye bekleyip temiz bağlantıyla bir kez daha dene
        try {
          await new Promise((r) => setTimeout(r, 2500));
          const retryCreds = await freshCredentials(acc);
          const retryBody = await imapLock(email, () =>
            fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...retryCreds })
          );
          persistBody(email, folder, uid, retryBody);
          return { ...retryBody, cached: false };
        } catch {}
      }
      if (isConnError || i === uniqueCandidates.length - 1) {
        console.error(`[body] ${email} uid=${uid} hata:`, e?.message || e);
        throw new Error(`Gövde alınamadı (${e?.message || e})`);
      }
      // Yalnızca ileti orijinal klasörde bulunamadıysa bir sonraki adayı dene
    }
  }
});

ipcMain.handle('mail:mark-read', async (_evt, email, folderPath, uid) => {
  markReadDb(email, folderPath || 'INBOX', uid); // önce yerel
  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    return true;
  }
  // Sunucu bayrığı best-effort ve IMAP kuyruğuna girmeden
  setImmediate(async () => {
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        await imapLock(email, () =>
          markSeen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
        );
      }
    } catch { /* best-effort */ }
  });
  return true;
});

ipcMain.handle('mail:mark-unread', async (_evt, email, folderPath, uid) => {
  markUnreadDb(email, folderPath || 'INBOX', uid); // önce yerel
  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    return true;
  }
  setImmediate(async () => {
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        await imapLock(email, () =>
          markUnseen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
        );
      }
    } catch { /* best-effort */ }
  });
  return true;
});

ipcMain.handle('mail:star', (_evt, email, folderPath, uid) => {
  const next = toggleStarDb(email, folderPath || 'INBOX', uid);
  // Sunucu bayrağı best-effort (okundu işaretindeki desen): önce yerel, IMAP arka planda
  if (!String(uid).startsWith('draft-') && !String(uid).startsWith('local-')) {
    setImmediate(async () => {
      try {
        const acc = getAccountByEmail(email);
        if (!acc) return;
        const creds = await freshCredentials(acc);
        await imapLock(email, () =>
          batchToggleFlag({
            provider: acc.provider, email: acc.email,
            folderPath: folderPath || 'INBOX', uids: [String(uid)],
            isFlagged: !!next, ...creds,
          })
        );
      } catch { /* best-effort */ }
    });
  }
  return next;
});

ipcMain.handle('mail:delete', async (_evt, email, folderPath, uid) => {
  if (!email || !folderPath || !uid) return false;
  const isTrash = isTrashFolder(folderPath);

  // 1. Önce ANINDA yerel DB ve önbellek yönetimi (0ms tepki)
  markDeleted(email, folderPath, String(uid));

  // Yerel taslaklar veya gönderilen kuyruk mesajları IMAP üzerinde aranmaz, doğrudan DB'den silinir
  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    try {
      getDb().prepare(
        `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND uid=?`
      ).run(email, String(uid));
    } catch (err) {
      console.warn('[mail:delete] taslak silme uyarısı:', err?.message);
    }
    return true;
  }

  // Mesajın subject, message_id ve ek bilgilerini yerel DB'den al (IMAP fallback arama ve taşıma için)
  let localMsg = null;
  let localAtts = [];
  try {
    localMsg = getDb().prepare(
      `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
    ).get(email, folderPath, String(uid));
    localAtts = getDb().prepare(
      `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
    ).all(email, folderPath, String(uid));
  } catch {}

  try {
    // 1. ÖNCE sunucu tarafı IMAP işlemini yürüt.
    // Sıralama kritik: yerel kayıt IMAP başarısı olmadan silinirse, deletedUidCache
    // TTL'i (5 dk) dolduğunda ileti bir sonraki senkronda geri yüklenir ve kullanıcı
    // "sildim, geri geldi" diye raporlar. Başarısızlıkta renderer'a fırlatıp
    // iyimser (optimistic) silmeyi geri aldırıyoruz.
    let res = null;
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      res = await imapLock(email, () =>
        moveToTrash({
          provider: acc.provider,
          email: acc.email,
          folderPath,
          uid: String(uid),
          subject: localMsg?.subject,
          messageId: localMsg?.message_id,
          ...creds,
        })
      );
      if (!res) {
        // markDeleted'ı geri al: aksi halde 5 dk boyunca bu UID senkronlanmayacak
        clearDeleted(email, folderPath, String(uid));
        throw new Error('E-posta sunucudan silinemedi. Bağlantınızı kontrol edip tekrar deneyin.');
      }
      console.log('[mail:delete] moveToTrash başarılı:', res.success ? 'ok' : res);
    }

    // 2. IMAP başarılı: yerel kaydı sil.
    // UYARI: Çöp kutusuna eski INBOX UID'si ile geçici kayıt eklemiyoruz!
    // Bu geçersiz UID çöpten silinmeye çalışıldığında bulunamaz ve hortlamaya yol açar.
    getDb().prepare(
      `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
    ).run(email, folderPath, String(uid));
    try {
      getDb().prepare(
        `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
      ).run(email, folderPath, String(uid));
    } catch (attErr) {
      console.warn('[mail:delete] ek temizleme uyarısı:', attErr?.message);
    }

    if (res) {
      if (isTrash) {
        // Çöp kutusunda expunge edilen gerçek UID varsa (eski UID'den farklıysa) onu da önbelleğe al ve DB'den temizle
        if (res.realUid && res.realUid !== String(uid)) {
          markDeleted(email, folderPath, res.realUid);
          try {
            getDb().prepare(
              `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
            ).run(email, folderPath, res.realUid);
            getDb().prepare(
              `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
            ).run(email, folderPath, res.realUid);
          } catch {}
        }
      } else if (res.dest && res.destUid && localMsg) {
        // Normal klasörden çöpe taşındıysa ve sunucu yeni UID döndürdüyse (COPYUID):
        // Çöp kutusuna GERÇEK UID ile ekle! Asla eski/geçersiz INBOX UID'si kullanılmaz.
        const finalDest = res.dest;
        const finalUid = String(res.destUid);
        try {
          const db = getDb();
          const existing = db.prepare(
            `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
          ).get(email, finalDest, finalUid);

          if (!existing) {
            // Çöpe atılan iletiler çöpte okunmuş (is_read=1) sayılır, çöp rozetini şişirmez
            db.prepare(`
              INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              localMsg.account_id,
              finalDest,
              finalUid,
              localMsg.subject,
              localMsg.from_addr,
              localMsg.to_addr,
              localMsg.date,
              localMsg.snippet,
              localMsg.body_html,
              localMsg.body_text,
              1,
              localMsg.message_id,
              localMsg.refs,
              localMsg.starred || 0
            );
          }

          if (localAtts && localAtts.length > 0) {
            const insAtt = db.prepare(`
              INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const att of localAtts) {
              insAtt.run(att.account_id, finalDest, finalUid, att.idx, att.filename, att.content_type, att.size);
            }
          }
        } catch (syncErr) {
          console.warn('[mail:delete] DB hedef UID ekleme hatası:', syncErr?.message);
        }
      }
    }

    // 3. Okunmamış sayacını delta ile güncelle.
    // Yerel alt kümeden yeniden hesaplamak sunucu değerini eziyordu.
    if (localMsg && !localMsg.is_read) adjustUnread(email, folderPath, -1);

    return true;
  } catch (e) {
    // Renderer iyimser (optimistic) silmeyi geri alsın diye FIRLAT.
    // `return false` sessiz kalıyordu: UI iletiyi gizliyor, DB'de de silinmişti,
    // 5 dk sonra deletedUidCache TTL'i dolunca ileti listede geri beliriyordu.
    console.error('[mail:delete] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-posta silinemedi.');
  }
});

ipcMain.handle('mail:batch-delete', async (_evt, email, folderPath, uids) => {
  if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
  const isTrash = isTrashFolder(folderPath);
  for (const uid of uids) {
    markDeleted(email, folderPath, String(uid));
  }

  const localDraftUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));
  const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));

  // Yerel taslakları doğrudan veritabanından sil (sunucuda karşılıkları yok)
  if (localDraftUids.length > 0) {
    try {
      const db = getDb();
      const delStmt = db.prepare(
        `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND uid=?`
      );
      db.transaction((list) => {
        for (const uid of list) delStmt.run(email, String(uid));
      })(localDraftUids);
    } catch (err) {
      console.warn('[mail:batch-delete] yerel taslak silme uyarısı:', err?.message);
    }
  }

  // Sunucu mesajları için: ÖNCE IMAP, SONRA yerel DB.
  // Ters sırada IMAP hatasında yerel kayıtlar silinmiş kalıyor ve
  // deletedUidCache TTL'i (5 dk) dolunca iletiler toplu halde geri yükleniyordu.
  if (serverUids.length > 0) {
    let localMsgs = [];
    let localAtts = [];
    // Okunmamış sayacı için silme ÖNCESİ kaç iletinin okunmamış olduğunu bil
    const removedUnread = countUnread(email, folderPath, serverUids);
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        // Taşıma için gereken yerel metadata'yı SİLME ÖNCESİ oku
        if (!isTrash && serverUids.length > 0) {
          try {
            const db = getDb();
            const placeholders = serverUids.map(() => '?').join(',');
            localMsgs = db.prepare(
              `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid IN (${placeholders})`
            ).all(email, folderPath, ...serverUids.map(String));
            localAtts = db.prepare(
              `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid IN (${placeholders})`
            ).all(email, folderPath, ...serverUids.map(String));
          } catch (readErr) {
            console.warn('[mail:batch-delete] yerel meta okuma uyarısı:', readErr?.message);
          }
        }

        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          batchMoveToTrash({ provider: acc.provider, email: acc.email, folderPath, uids: serverUids, ...creds })
        );
        if (res && res.success === false) {
          for (const uid of serverUids) clearDeleted(email, folderPath, String(uid));
          throw new Error(res.error || 'E-postalar sunucudan silinemedi.');
        }

        // 1. IMAP başarılı: yerel kayıtları sil
        try {
          const db = getDb();
          const stmt = db.prepare(
            `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
          );
          const attStmt = db.prepare(
            `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND msg_uid=?`
          );
          db.transaction((list) => {
            for (const uid of list) {
              stmt.run(email, folderPath, String(uid));
              try { attStmt.run(email, folderPath, String(uid)); } catch {}
            }
          })(serverUids);
        } catch (dbErr) {
          console.warn('[mail:batch-delete] DB uyarısı:', dbErr?.message);
        }

        if (!isTrash && res?.dest && res?.uidMap && localMsgs.length > 0) {
          const finalDest = res.dest;
          const uidMap = res.uidMap || {};
          try {
            const db = getDb();
            const checkStmt = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
            );
            const insMsg = db.prepare(`
              INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insAtt = db.prepare(`
              INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            db.transaction((msgs) => {
              for (const m of msgs) {
                const newUid = uidMap[String(m.uid)];
                if (newUid) {
                  const existing = checkStmt.get(email, finalDest, String(newUid));
                  if (!existing) {
                    insMsg.run(
                      m.account_id,
                      finalDest,
                      String(newUid),
                      m.subject,
                      m.from_addr,
                      m.to_addr,
                      m.date,
                      m.snippet,
                      m.body_html,
                      m.body_text,
                      1,
                      m.message_id,
                      m.refs,
                      m.starred || 0
                    );
                  }
                  const atts = localAtts.filter((a) => String(a.msg_uid) === String(m.uid));
                  for (const a of atts) {
                    try { insAtt.run(a.account_id, finalDest, String(newUid), a.idx, a.filename, a.content_type, a.size); } catch {}
                  }
                }
              }
            })(localMsgs);
          } catch (batchDbErr) {
            console.warn('[mail:batch-delete] DB senkron ekleme uyarısı:', batchDbErr?.message);
          }
        }
      }

      // 3. Okunmamış sayacını delta ile güncelle (silinen okunmamış sayısı kadar azalt)
      if (removedUnread > 0) adjustUnread(email, folderPath, -removedUnread);

      return true;
    } catch (e) {
      // Renderer'ın iyimser toplu silmesini geri aldırmak için fırlat
      console.error('[mail:batch-delete] error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg || 'E-postalar silinemedi.');
    }
  }

  return true;
});

ipcMain.handle('mail:move-to-folder', async (_evt, email, fromFolder, toFolder, uid) => {
  if (!email || !fromFolder || !toFolder || !uid) return false;
  if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

  markDeleted(email, fromFolder, String(uid));

  // Taslak/yerel iletiler sunucuda yok; doğrudan taşı
  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    try {
      getDb().prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
      ).run(toFolder, email, fromFolder, String(uid));
    } catch (e) {
      console.warn('[mail:move-to-folder] DB uyarısı:', e?.message);
    }
    return true;
  }

  // ÖNCE sunucuda taşı, sonra yerel kaydı güncelle. Sunucu başarısız olursa
  // markDeleted geri alınır ve renderer'a fırlatılır (iyimser taşıma geri alınır).
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () =>
        moveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uid: String(uid), ...creds })
      );
      if (!res) {
        clearDeleted(email, fromFolder, String(uid));
        throw new Error('E-posta sunucuda taşınamadı. Bağlantınızı kontrol edip tekrar deneyin.');
      }

      try {
        const db = getDb();
        const finalUid = res.destUid ? String(res.destUid) : String(uid);
        const existing = db.prepare(
          `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
        ).get(email, toFolder, finalUid);
        if (existing) {
          db.prepare(
            `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
          ).run(email, fromFolder, String(uid));
        } else {
          db.prepare(
            `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          ).run(toFolder, finalUid, email, fromFolder, String(uid));
        }
        try {
          db.prepare(
            `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
          ).run(toFolder, finalUid, email, fromFolder, String(uid));
        } catch {}
      } catch (mErr) {
        console.warn('[mail:move-to-folder] UID güncelleme hatası:', mErr?.message);
      }
    }
    return true;
  } catch (e) {
    console.error('[mail:move-to-folder] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-posta taşınamadı.');
  }
});

ipcMain.handle('mail:batch-move-to-folder', async (_evt, email, fromFolder, toFolder, uids) => {
  if (!email || !fromFolder || !toFolder || !Array.isArray(uids) || uids.length === 0) return false;
  if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

  for (const uid of uids) {
    markDeleted(email, fromFolder, String(uid));
  }

  const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
  const localUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));

  // Taslak/yerel iletiler sunucuda yok: doğrudan taşı
  if (localUids.length > 0) {
    try {
      const db = getDb();
      const stmt = db.prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
      );
      db.transaction((list) => {
        for (const uid of list) stmt.run(toFolder, email, fromFolder, String(uid));
      })(localUids);
    } catch (e) {
      console.warn('[mail:batch-move-to-folder] DB uyarısı:', e?.message);
    }
  }
  if (serverUids.length === 0) return true;

  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () =>
        batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uids: serverUids, ...creds })
      );
      if (!res || res.success === false) {
        for (const uid of serverUids) clearDeleted(email, fromFolder, String(uid));
        throw new Error(res?.error || 'E-postalar sunucuda taşınamadı.');
      }

      const uidMap = res.uidMap || {};
      {
        try {
          const db = getDb();
          const updateStmt = db.prepare(
            `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const deleteStmt = db.prepare(
            `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const checkStmt = db.prepare(
            `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const updateAttStmt = db.prepare(
            `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
          );

          db.transaction((list) => {
            for (const oldUid of list) {
              const newUid = uidMap[String(oldUid)];
              if (newUid) {
                const existing = checkStmt.get(email, toFolder, String(newUid));
                if (existing) {
                  deleteStmt.run(email, toFolder, String(oldUid));
                } else {
                  updateStmt.run(toFolder, String(newUid), email, toFolder, String(oldUid));
                }
                try {
                  updateAttStmt.run(toFolder, String(newUid), email, fromFolder, String(oldUid));
                } catch {}
              } else {
                deleteStmt.run(email, toFolder, String(oldUid));
              }
            }
          })(serverUids);
        } catch (bmErr) {
          console.warn('[mail:batch-move-to-folder] UID güncelleme hatası:', bmErr?.message);
        }
      }
    }
    return true;
  } catch (e) {
    console.error('[mail:batch-move-to-folder] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-postalar taşınamadı.');
  }
});

ipcMain.handle('mail:archive', async (_evt, email, folderPath, uid) => {
  if (!email || !folderPath || !uid) return false;
  const targetArchive = getArchiveFolder(email);
  if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

  markDeleted(email, folderPath, String(uid));

  if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
    try {
      getDb().prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
      ).run(targetArchive, email, folderPath, String(uid));
    } catch (e) {
      console.warn('[mail:archive] DB uyarısı:', e?.message);
    }
    return true;
  }

  // Sunucuda taşı başarısız olursa yerel kayıt taşınmış sayılmasın
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () =>
        moveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uid: String(uid), ...creds })
      );
      if (!res) {
        clearDeleted(email, folderPath, String(uid));
        throw new Error('E-posta sunucuda arşivlenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
      }
      try {
        const db = getDb();
        const finalUid = res.destUid ? String(res.destUid) : String(uid);
        db.prepare(
          `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE AND uid=?`
        ).run(targetArchive, finalUid, email, folderPath, String(uid));
        try {
          db.prepare(
            `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
          ).run(targetArchive, finalUid, email, folderPath, String(uid));
        } catch {}
      } catch (aErr) {
        console.warn('[mail:archive] UID güncelleme hatası:', aErr?.message);
      }
    }
    return true;
  } catch (e) {
    console.error('[mail:archive] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-posta arşivlenemedi.');
  }
});

ipcMain.handle('mail:batch-archive', async (_evt, email, folderPath, uids) => {
  if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
  const targetArchive = getArchiveFolder(email);
  if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

  for (const uid of uids) {
    markDeleted(email, folderPath, String(uid));
  }

  const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
  const localUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));
  if (localUids.length > 0) {
    try {
      const db = getDb();
      const stmt = db.prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
      );
      db.transaction((list) => {
        for (const uid of list) stmt.run(targetArchive, email, folderPath, String(uid));
      })(localUids);
    } catch (e) {
      console.warn('[mail:batch-archive] DB uyarısı:', e?.message);
    }
  }
  if (serverUids.length === 0) return true;

  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () =>
        batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uids: serverUids, ...creds })
      );
      if (!res || res.success === false) {
        for (const uid of serverUids) clearDeleted(email, folderPath, String(uid));
        throw new Error(res?.error || 'E-postalar sunucuda arşivlenemedi.');
      }

      const uidMap = res.uidMap || {};
        try {
          const db = getDb();
          const updateStmt = db.prepare(
            `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const deleteStmt = db.prepare(
            `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const checkStmt = db.prepare(
            `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
          );
          const updateAttStmt = db.prepare(
            `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`
          );

          db.transaction((list) => {
            for (const oldUid of list) {
              const newUid = uidMap[String(oldUid)];
              if (newUid) {
                const existing = checkStmt.get(email, targetArchive, String(newUid));
                if (existing) {
                  deleteStmt.run(email, targetArchive, String(oldUid));
                } else {
                  updateStmt.run(targetArchive, String(newUid), email, targetArchive, String(oldUid));
                }
                try {
                  updateAttStmt.run(targetArchive, String(newUid), email, folderPath, String(oldUid));
                } catch {}
              } else {
                deleteStmt.run(email, targetArchive, String(oldUid));
              }
            }
          })(serverUids);
        } catch (baErr) {
          console.warn('[mail:batch-archive] UID güncelleme hatası:', baErr?.message);
        }
    }
    return true;
  } catch (e) {
    console.error('[mail:batch-archive] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || 'E-postalar arşivlenemedi.');
  }
});

ipcMain.handle('mail:batch-mark-read', async (_evt, email, folderPath, uids, isRead = true) => {
  if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
  batchMarkReadDb(email, folderPath, uids, isRead ? 1 : 0);
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      await imapLock(email, () =>
        batchMarkSeen({ provider: acc.provider, email: acc.email, folderPath, uids, isSeen: !!isRead, ...creds })
      );
    }
    return true;
  } catch (e) {
    console.error('[mail:batch-mark-read] error:', e);
    return false;
  }
});

ipcMain.handle('mail:batch-star', async (_evt, email, folderPath, uids, starred = true) => {
  if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
  batchToggleStarDb(email, folderPath, uids, starred ? 1 : 0);
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      await imapLock(email, () =>
        batchToggleFlag({ provider: acc.provider, email: acc.email, folderPath, uids, isFlagged: !!starred, ...creds })
      );
    }
    return true;
  } catch (e) {
    console.error('[mail:batch-star] error:', e);
    return false;
  }
});

ipcMain.handle('mail:save-draft', async (_evt, { email, to, subject, text, html }) => {
  if (!email) return false;
  try {
    return saveDraftMessage(email, { to, subject, text, html });
  } catch (e) {
    console.error('[mail:save-draft] error:', e);
    return false;
  }
});

ipcMain.handle('mail:send', async (_evt, { fromEmail, to, cc, bcc, subject, text, html, inReplyTo, references, attachments }) => {
  const acc = getAccountByEmail(fromEmail);
  if (!acc) throw new Error('Gönderen hesap bulunamadı.');
  const toList = splitAddresses(to);
  if (toList.length === 0) throw new Error('Geçerli bir alıcı girin.');
  if (!text || !text.trim()) throw new Error('İleti boş olamaz.');
  const atts = attachments || [];
  const totalBytes = atts.reduce((n, a) => n + Math.ceil((a.dataBase64 || '').length * 3 / 4), 0);
  if (totalBytes > 20 * 1024 * 1024) throw new Error('Ekler toplam 20MB sınırını aşıyor.');
  const ccList = splitAddresses(cc);
  const bccList = splitAddresses(bcc);
  const raw = await buildRaw({ from: acc.email, to: toList, cc: ccList, subject: subject || '(konusuz)', text, html, inReplyTo, references, attachments: atts });
  const smtpOpts = acc.auth_type === 'password'
    ? { smtpHost: acc.smtp_host, smtpPort: acc.smtp_port, smtpSecure: !!acc.smtp_secure }
    : {};
  let info;
  try {
    // Ölü token durumunda otomatik yenileyip bir kez daha dene
    info = await withAuthRetry(acc, async (creds) => {
      const transporter = createTransporter({ provider: acc.provider, email: acc.email, ...creds, ...smtpOpts });
      return sendRaw(transporter, raw, { from: acc.email, to: [...toList, ...ccList, ...bccList] });
    });
  } catch (e) {
    console.error(`[send] ${fromEmail} hata:`, e?.message || e);
    throw new Error(`Gönderilemedi (${friendlySyncError(acc.provider, e)})`);
  }
  saveSentMessage(acc.email, { to: toList.join(', '), subject, text, html });
  // Sunucudaki Gönderilmiş klasörüne kopya (best-effort)
  try {
    const creds = await freshCredentials(getAccountByEmail(fromEmail) || acc);
    await appendToSent({ provider: acc.provider, email: acc.email, raw, ...creds });
  } catch { /* yerel kayıt esas */ }
  return { messageId: info?.messageId || null };
});

ipcMain.handle('mail:attachments', (_evt, email, folderPath, uid) => {
  const folder = folderPath || 'INBOX';
  return listAttachments(email, folder, uid);
});

ipcMain.handle('mail:attachment-save', async (_evt, email, folderPath, uid, index) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  const creds = await freshCredentials(acc);
  const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
  const safeName = path.basename(att.filename).replace(/[<>:"/\\|?*]/g, '_') || 'ek.bin';
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: safeName });
  if (canceled || !filePath) return { saved: false };
  await fs.promises.writeFile(filePath, att.content);
  return { saved: true, path: filePath };
});

ipcMain.handle('mail:attachment-preview', async (_evt, email, folderPath, uid, index) => {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');
  const creds = await freshCredentials(acc);
  const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
  return {
    filename: att.filename,
    contentType: att.contentType,
    dataBase64: Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content || '').toString('base64'),
  };
});

ipcMain.handle('mail:autoconfig', (_evt, email) => detectSettings(email));

ipcMain.handle('mail:reply-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'reply'));

ipcMain.handle('mail:reply-all-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'replyAll'));

ipcMain.handle('mail:forward-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'forward'));

ipcMain.handle('mail:export-eml', async (_evt, email, folderPath, uid) => {
  const folder = folderPath || 'INBOX';
  const meta = getMessageMeta(email, folder, uid);
  let body = getMessageBody(email, folder, uid);
  if (!body || (!body.body_html && !body.body_text)) {
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const fetched = await imapLock(email, () => fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds }));
        persistBody(email, folder, uid, fetched);
        body = fetched;
      }
    } catch {}
  }
  const cleanSub = (meta?.subject || 'eposta').replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${cleanSub}.eml`,
    filters: [{ name: 'E-posta Dosyası', extensions: ['eml'] }],
  });
  if (canceled || !filePath) return { saved: false };
  const eml = [
    `From: ${meta?.from_addr || email}`,
    `Subject: ${meta?.subject || '(konusuz)'}`,
    `Date: ${meta?.date || new Date().toISOString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    body?.body_html || body?.body_text || '(İçerik boş)',
  ].join('\r\n');
  await fs.promises.writeFile(filePath, eml, 'utf8');
  return { saved: true, path: filePath };
});

ipcMain.handle('mail:empty-trash', async (_evt, email) => {
  return emptySpecialFolder({
    email,
    folder: getTrashFolder(email),
    patterns: TRASH_PATTERNS,
    imapFlag: '\\Trash',
    label: 'Çöp kutusu',
  });
});

ipcMain.handle('mail:empty-spam', async (_evt, email) => {
  return emptySpecialFolder({
    email,
    folder: getSpamFolder(email),
    patterns: SPAM_PATTERNS,
    imapFlag: '\\Junk',
    label: 'Gereksiz e-posta',
  });
});

// ── Salt-okunur hesap tanısı (DB'ye yazmaz, hesap ekleme akışına dokunmaz) ──
// Adımlar: hesap kaydı → token varlığı → token yenileme → IMAP INBOX açma + status
ipcMain.handle('mail:diagnose', async (_evt, email) => {
  const steps = [];
  const push = (key, ok, detail) => { steps.push({ key, ok, detail: String(detail || '').slice(0, 500) }); };
  try {
    const acc = getAccountByEmail(email);
    if (!acc) {
      push('account', false, `${email} yerel DB'de bulunamadı.`);
      return { email, ok: false, steps, hint: 'Hesap listede yoksa yeniden ekleyin.' };
    }
    push('account', true, `provider=${acc.provider || '?'} auth=${acc.auth_type || 'oauth'}`);
    if (acc.auth_type === 'password') {
      push('token', !!acc.password_enc, acc.password_enc ? 'Kayıtlı şifre mevcut.' : 'Kayıtlı şifre yok.');
    } else {
      push('token', !!(acc.refresh_token_enc || acc.access_token_enc), acc.refresh_token_enc ? 'Refresh token kayıtlı.' : 'Refresh token YOK — hesabı yeniden bağlayın.');
    }
    try {
      await freshCredentials(acc);
      push('refresh', true, acc.auth_type === 'password' ? 'Şifre çözüldü.' : `Access token alındı (süre: ${acc.token_expiry || 'bilinmiyor'}).`);
    } catch (e) {
      push('refresh', false, friendlySyncError(acc.provider, e));
      return { email, ok: false, steps, hint: 'Token yenilenemedi — Gmail IMAP iznini ve yeniden bağlamayı deneyin.' };
    }
    try {
      const info = await withIpcTimeout(
        withAuthRetry(acc, (creds) =>
          imapLock(email, async () => {
            return withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
              const mb = await client.mailboxOpen('INBOX', { readOnly: true });
              let status = null;
              try { status = await client.status('INBOX', { messages: true, unseen: true }); } catch {}
              return { exists: mb?.exists ?? client.mailbox?.exists ?? null, status };
            });
          })),
        110000,
        'Tanı bağlantısı',
      );
      const total = info?.status?.messages ?? info?.exists ?? '?';
      const unseen = info?.status?.unseen ?? '?';
      push('imap', true, `INBOX açıldı. kutuda=${total} okunmamış=${unseen}`);
      return { email, ok: true, steps, hint: total === 0 ? 'INBOX sunucuda boş görünüyor — Gmail webde gelen kutusunu kontrol edin.' : 'Bağlantı sağlıklı. Liste boşsa Eşitle + klasör seçimine bakın.' };
    } catch (e) {
      push('imap', false, friendlySyncError(acc.provider, e));
      return { email, ok: false, steps, hint: 'IMAP INBOX açılamadı — yukarıdaki IMAP/Gmail kontrol listesini uygulayın.' };
    }
  } catch (e) {
    push('fatal', false, friendlySyncError('', e));
    return { email, ok: false, steps, hint: 'Beklenmeyen tanı hatası.' };
  }
});

}

module.exports = { register };
