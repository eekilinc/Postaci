// electron/ipc.cjs - Tum IPC isleyicileri (main.cjs'ten tasindi)
const { app, ipcMain, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDb, getStats, getDbPath, vacuumDb, listAccounts, getAccountById, getAccountByEmail, updateAccount, deleteAccount, updateTokens, addAccount, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, saveMessageBody, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, searchContacts, listContacts, upsertContact, deleteContact, saveSentMessage, saveDraftMessage, listAttachments, saveAttachments, getSetting, setSetting, getAllUnreadCounts } = require('./db.cjs');
const { startOAuthFlow } = require('./auth.cjs');
const { emailFromIdToken, fetchProfileEmail, syncInbox, syncFolder, fetchBody, fetchAttachment, markSeen, markUnseen, createTransporter, buildRaw, sendRaw, appendToSent, verifyImap, listFolders, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, moveToFolder, batchMoveToFolder, withClient, imapErrDetail, invalidateClient, isAuthFailed } = require('./mail.cjs');
const { detectSettings } = require('./providers.cjs');
const { splitAddresses, buildReply, buildReplyAll, buildForward } = require('./compose.cjs');
const { enc, dec, freshCredentials, withAuthRetry, _tokenRefreshPromises } = require('./token-auth.cjs');
const { markDeleted, isDeleted, clearDeleted, _lastSyncTime, _imapQueues, _lastImapOpTime, _activeFolderPerAccount, imapLock, SYNC_CONCURRENCY, syncOneInboxWithTimeout, isTimeoutError, runWithConcurrency } = require('./imap-queue.cjs');
const { adjustFolderUnread } = require('./db-drizzle.cjs');
const { notifyNewMessages, showDesktopNotification, flushAllPendingToasts, DEFAULT_NOTIFICATION_SETTINGS } = require('./notifications.cjs');
const { updateBackgroundSyncSchedule } = require('./background-sync.cjs');
const { syncStartupSettings } = require('./shell-integration.cjs');

function registerIpc(ctx) {
  const getMainWindow = ctx.getMainWindow;
  const getTray = ctx.getTray;
  ipcMain.handle('db:stats', () => getStats());

  // Sistem Bilgisi: RAM, DB boyutu, Electron/Node/Chrome versiyonları
  ipcMain.handle('db:system-info', async () => {
    const memUsage = process.memoryUsage();
    const dbFilePath = getDbPath();
    let dbSizeBytes = 0;
    if (dbFilePath) {
      try { dbSizeBytes = fs.statSync(dbFilePath).size; } catch {}
    }
    return {
      ram: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
        rssMB: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
        externalMB: Math.round(memUsage.external / 1024 / 1024 * 10) / 10,
      },
      db: {
        sizeBytes: dbSizeBytes,
        sizeMB: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
        path: dbFilePath,
      },
      versions: {
        electron: process.versions.electron || '?',
        node: process.versions.node || '?',
        chrome: process.versions.chrome || '?',
        v8: process.versions.v8 || '?',
      },
    };
  });

  // DB Vakum (VACUUM + optimize) — Gelişmiş sekmesi "Önbelleği Temizle" butonu
  ipcMain.handle('db:vacuum', () => {
    vacuumDb();
    return true;
  });
  // Tanı logları: yolu ver + klasörü aç (Ayarlar > Gelişmiş)
  ipcMain.handle('logs:get-path', () => {
    try {
      return require('./electron/logger.cjs').logPath(app.getPath('userData'));
    } catch {
      return null;
    }
  });
  ipcMain.handle('logs:open-folder', async () => {
    try {
      const p = require('./electron/logger.cjs').logPath(app.getPath('userData'));
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      return { ok: !err, error: err || null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
  ipcMain.handle('accounts:list', () => listAccounts());
  ipcMain.handle('auth:start', async (_evt, provider) => {
    const tokens = await startOAuthFlow(provider);
    // E-posta: önce id_token'dan (her zaman elimizde), olmazsa profil API'sinden.
    let profile = emailFromIdToken(tokens.id_token);
    if (!profile.email) {
      profile = await fetchProfileEmail(provider, tokens.access_token).catch(() => ({ email: null, name: null }));
    }
    if (!profile.email) {
      throw new Error('E-posta adresi profilden alınamadı. Lütfen sağlayıcı izinlerini onaylayarak tekrar deneyin.');
    }
    const expiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    const saved = {
      provider,
      email: profile.email,
      displayName: profile.name,
      refreshTokenEnc: enc(tokens.refresh_token),
      accessTokenEnc: enc(tokens.access_token),
      tokenExpiry: expiry,
    };
    addAccount(saved);

    // IMAP bağlantısını test et ve klasörleri önceden çek (kullanıcıyı ana ekranda bekletmemek için)
    try {
      console.log(`[auth:start] ${profile.email} (${provider}) için IMAP bağlantısı doğrulanıyor...`);
      const folders = await listFolders({
        provider,
        email: profile.email,
        accessToken: tokens.access_token,
      });
      if (folders && folders.length > 0) {
        const db = getDb();
        const upsert = db.prepare(`
          INSERT INTO folders (account_id, name, path, flags, unread_count)
          VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, 0)
          ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, flags=excluded.flags
        `);
        for (const f of folders) {
          upsert.run(profile.email, f.name || f.path, f.path, JSON.stringify(f.flags || []));
        }
        console.log(`[auth:start] ${profile.email} için ${folders.length} klasör başarıyla önbelleğe alındı.`);
      }
    } catch (testErr) {
      console.warn(`[auth:start] ${profile.email} IMAP ilk bağlantı uyarısı:`, testErr?.message || testErr);
      if (isAuthFailed(testErr)) {
        // Hatalı/erişilemeyen hesabın veritabanında hayalet kayıt bırakmasını önle
        try {
          const added = getAccountByEmail(profile.email);
          if (added?.id) deleteAccount(added.id);
        } catch {}
        throw new Error(
          `Giriş yapıldı fakat ${provider === 'google' ? 'Gmail' : provider} IMAP erişimini reddetti.\n\n` +
          (provider === 'google'
            ? 'Lütfen giriş yaparken "Tüm e-postalarınızı okuma/yönetme" kutusunu işaretlediğinizden ve Gmail Ayarları → Yönlendirme ve POP/IMAP sekmesinde "IMAP\'i etkinleştir" seçeneğinin açık olduğundan emin olun.'
            : friendlySyncError(provider, testErr))
        );
      }
    }

    return saved;
  });
  ipcMain.on('app:get-version-sync', (event) => {
    try {
      event.returnValue = app.getVersion();
    } catch {
      event.returnValue = '1.0.16';
    }
  });
  ipcMain.handle('accounts:add', (_evt, acc) => addAccount(acc));
  ipcMain.handle('accounts:get', async (_evt, id) => {
    const acc = getAccountById(id);
    if (!acc) return null;
    const { password_enc: _p, access_token_enc: _a, refresh_token_enc: _r, ...safe } = acc;
    return safe;
  });
  ipcMain.handle('accounts:update', async (_evt, id, updates) => {
    const acc = getAccountById(id);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const dbUpdates = {
      displayName: updates.displayName,
      imapHost: updates.imapHost,
      imapPort: updates.imapPort,
      smtpHost: updates.smtpHost,
      smtpPort: updates.smtpPort,
      smtpSecure: updates.smtpSecure,
    };
    if (updates.password && updates.password.trim()) {
      dbUpdates.passwordEnc = enc(updates.password.trim());
    }
    updateAccount(id, dbUpdates);
    return true;
  });
  ipcMain.handle('accounts:delete', async (_evt, id) => {
    deleteAccount(id);
    return true;
  });
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
        35000,
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
  const _folderSyncMap = new Map(); // email -> timestamp
  const _folderSyncInFlight = new Map(); // email -> Promise
  // Klasör listesinin IMAP'ten son çekildiği zaman (normEmail -> timestamp)
  const _folderListFetchedAt = new Map();
  const FOLDER_LIST_REFRESH_MS = 10 * 60 * 1000; // 10 dakikada bir tazele

  // IPC yardımcı: asla sonsuza takılmaması için sınırlı süre (takılan IMAP sözünü boşa düşürür)
  function withIpcTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} zaman aşımına uğradı (${Math.round(ms / 1000)} sn). Tekrar deneyin.`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => { if (t) clearTimeout(t); });
  }

  // Okunmamış sayacını yerel işlemler için delta ile güncelle.
// DİKKAT: `UPDATE folders SET unread_count = (SELECT SUM(...) FROM messages ...)`
// yazımı sunucudan gelen gerçek değeri yerel alt kümenin sayısıyla eziyordu
// (900 okunmamışlık klasör, 50 ileti senkronlandığı için 50'ye düşüyordu).
// Doğrusu: sunucu STATUS değerini yazar, yerel işlemler delta uygular.
function adjustUnread(email, folderPath, delta) {
  if (!delta || !folderPath) return;
  try {
    adjustFolderUnread(getDb(), email, folderPath, delta);
  } catch (e) {
    console.warn('[unread] sayaç güncellenemedi:', e?.message);
  }
}

// Verilen iletilerden kaç tanesi okunmamış? (silme/taşıma sonrası delta için)
function countUnread(email, folderPath, uids) {
  try {
    if (!Array.isArray(uids) || uids.length === 0) return 0;
    const ph = uids.map(() => '?').join(',');
    const row = getDb().prepare(
      `SELECT COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS n
       FROM messages
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
         AND folder_path=? COLLATE NOCASE AND uid IN (${ph})`
    ).get(email, folderPath, ...uids.map(String));
    return row?.n || 0;
  } catch {
    return 0;
  }
}

// Klasör önbelleğini tek yerden oku.
// unread_count kaynağı: DB'deki folders tablosunda SAKLANAN değer.
// Bu değeri sunucudan IMAP STATUS ile dolduran iki yol var:
//   - syncFolder (mail.cjs) → aktif klasör her senkronlanınca
//   - refreshFolderCounts (mail.cjs) → 15 dakikada bir tüm klasörler
// Daha önce burada HER çağrıda yerel `messages` alt kümesinden yeniden hesaplanıp
// folders.unread_count EZİLİYORDU. Yerel küme limit (30/50) ile sınırlı olduğu
// için 900 okunmamışı olan bir klasör 50'ye düşüyor ve refreshFolderCounts'in
// STATUS verisi kalıcı olarak bozuluyordu. Artık yalnızca okuyoruz.
function readFolderCache(email) {
  const db = getDb();
  const cached = db.prepare(`
    SELECT f.name, f.path, f.flags,
           COALESCE(f.unread_count, 0) AS unread_count,
           COALESCE((SELECT SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END)
                     FROM messages m
                     WHERE m.account_id = f.account_id AND lower(m.folder_path) = lower(f.path)), 0) AS local_unread
    FROM folders f
    WHERE f.account_id = (SELECT id FROM accounts WHERE email = ? COLLATE NOCASE)
  `).all(email);

  return (cached || []).map((f) => {
    let flags = [];
    try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
    // Sunucudan hiç STATUS gelmemişse (unread_count hiç yazılmamışsa) yerel
    // hesapla düşüş yap; yazılmışsa sunucu değeri doğrudur.
    const stored = Number(f.unread_count) || 0;
    const local = Number(f.local_unread) || 0;
    return {
      path: f.path,
      name: f.name,
      flags,
      delimiter: '/',
      unread_count: stored > 0 ? stored : local,
    };
  });
}

  async function fetchFoldersFromImap(acc) {
    const email = acc.email;
    if (_folderSyncInFlight.has(email)) {
      return _folderSyncInFlight.get(email);
    }

    const task = (async () => {
      let creds = await freshCredentials(acc);
      let list;
      try {
        list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
      } catch (initialErr) {
        let activeErr = initialErr;
        const errStr = `${activeErr?.message || ''} ${activeErr?.responseText || ''} ${activeErr?.response || ''}`.toLowerCase();
        const needForcedRefresh =
          (errStr.includes('authenticated but not connected') && acc.provider === 'microsoft') ||
          (acc.auth_type !== 'password' && isAuthFailed(initialErr));
        if (needForcedRefresh) {
          try {
            console.log(`[mail:folders] ${email} için token zorla yenilenip tekrar deneniyor...`);
            try { invalidateClient(email); } catch {}
            const latest = getAccountByEmail(email) || acc;
            if (latest.refresh_token_enc) {
              updateTokens(email, { refreshTokenEnc: latest.refresh_token_enc, accessTokenEnc: null, tokenExpiry: null });
              creds = await freshCredentials(getAccountByEmail(email) || acc, true);
              list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
            }
          } catch (retryErr) {
            activeErr = retryErr;
          }
        }
        if (!list) {
          console.warn('[mail:folders] IMAP klasör listesi alınamadı, DB önbelleği kullanılıyor:', activeErr?.message);
          try {
            const db = getDb();
            const cached = db.prepare(`SELECT name, path, flags FROM folders WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)`).all(email);
            if (cached && cached.length > 0) {
              return cached.map((f) => {
                let flags = [];
                try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
                return { path: f.path, name: f.name, flags, delimiter: '/' };
              });
            }
          } catch {}
          throw activeErr;
        }
      }
      try {
        const db = getDb();
        // Sadece UPSERT yetiyordu: sunucuda silinmiş bir klasör yerel DB'de
        // kalıcı olarak listelenmeye devam ediyordu (bayat rozetle).
        const upsert = db.prepare(`
          INSERT INTO folders (account_id, name, path, flags, unread_count)
          VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, 0)
          ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, flags=excluded.flags
        `);
        const serverPaths = [];
        for (const f of list) {
          upsert.run(email, f.name || f.path, f.path, JSON.stringify(f.flags || []));
          serverPaths.push(f.path);
        }
        // Artık sunucuda olmayan, yerelde mesaj/ek kaydı da bulunmayan
        // klasörleri temizle (o klasörün verisi varsa dokunma).
        try {
          if (serverPaths.length > 0) {
            const ph = serverPaths.map(() => '?').join(',');
            db.prepare(
              `DELETE FROM folders
               WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
                 AND path NOT IN (${ph})
                 AND path NOT IN (
                   SELECT DISTINCT folder_path FROM messages
                   WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
                 )`,
            ).run(email, ...serverPaths, email);
          }
        } catch (delErr) {
          console.warn('[mail:folders] bayat klasör temizliği uyarısı:', delErr?.message);
        }
      } catch (e) {
        console.warn('[mail:folders] DB klasör önbelleği güncelleme uyarısı:', e?.message);
      }
      return list.map((f) => ({ path: f.path, name: f.name, flags: f.flags, delimiter: f.delimiter }));
    })();

    _folderSyncInFlight.set(email, task);
    try {
      const res = await withIpcTimeout(task, 25000, 'Klasör listesi');
      _folderListFetchedAt.set((email || '').toLowerCase().trim(), Date.now());
      return res;
    } finally {
      _folderSyncInFlight.delete(email);
    }
  }

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
        35000,
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
        75000,
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
  // Gövde + ek bilgilerini DB'ye yazan tek fonksiyon (body ve şablon yolları ortak kullanır)
  function persistBody(email, folder, uid, fetched) {
    saveMessageBody(email, folder, uid, fetched);
    saveAttachments(email, folder, uid, fetched.attachments || []);
  }
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

  function isTrashFolder(folderPath) {
    return /trash|çöp|deleted|bin|silinmiş|recycl|ilk kutusu/i.test(folderPath || '');
  }

  // Özel klasör (çöp/spam/arşiv) çözümlemesi — NOTLAR:
  //  - SQLite'un lower()'ı ASCII-only: lower('[Gmail]/Çöp kutusu') -> '[gmail]/Çöp kutusu'
  //    (Ç küçülmez), dolayısıyla `lower(path) LIKE '%çöp%'` Türkçe adlarda HİÇ eşleşmez.
  //    Unicode-duyarlı `ltr()` kullanılıyor (db.cjs'te kayıtlı).
  //  - "Silinmiş Öğeler" (TR Outlook), "Çöp" (TR Yahoo), "Zil/Köp" gibi isimler de eklendi.
  //  - ORDER BY id DESC: yeniden adlandırılan/taşınan klasörün BAYAT satırı seçiliyordu.
  function findSpecialFolder(email, patterns, fallbacks) {
    try {
      const where = patterns.map(() => '(ltr(path) LIKE ? OR ltr(name) LIKE ?)').join(' OR ');
      const params = [];
      for (const p of patterns) params.push(`%${p}%`, `%${p}%`);
      const row = getDb().prepare(
        `SELECT path FROM folders
         WHERE account_id = (SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
           AND (${where})
         ORDER BY id DESC LIMIT 1`
      ).get(email, ...params);
      if (row?.path) return row.path;
    } catch (e) {
      console.warn('[folders] özel klasör araması uyarısı:', e?.message);
    }
    const acc = getAccountByEmail(email);
    if (acc?.provider === 'google') return fallbacks.google;
    if (acc?.provider === 'microsoft') return fallbacks.microsoft;
    return fallbacks.other;
  }

  function getTrashFolder(email) {
    return findSpecialFolder(
      email,
      ['çöp', 'trash', 'deleted', 'bin', 'silinmiş', 'recycl'],
      { google: '[Gmail]/Çöp kutusu', microsoft: 'Deleted Items', other: 'Trash' },
    );
  }

  function getSpamFolder(email) {
    return findSpecialFolder(
      email,
      ['spam', 'junk', 'gereksiz', 'istenmeyen', 'önemsiz'],
      { google: '[Gmail]/Spam', microsoft: 'Junk Email', other: 'Junk' },
    );
  }

  function getArchiveFolder(email) {
    return findSpecialFolder(
      email,
      ['archive', 'arşiv', 'tüm postalar', 'all mail'],
      { google: '[Gmail]/Tüm Postalar', microsoft: 'Archive', other: 'Archive' },
    );
  }

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

  ipcMain.handle('contacts:search', async (_evt, query) => {
    try {
      return searchContacts(query);
    } catch {
      return [];
    }
  });

  ipcMain.handle('contacts:list', async (_evt, query) => {
    try {
      return listContacts(query);
    } catch (e) {
      console.error('[contacts:list] error:', e);
      return [];
    }
  });

  ipcMain.handle('contacts:upsert', async (_evt, contact) => {
    try {
      return upsertContact(contact);
    } catch (e) {
      console.error('[contacts:upsert] error:', e);
      throw e;
    }
  });

  ipcMain.handle('contacts:delete', async (_evt, id) => {
    try {
      return deleteContact(id);
    } catch (e) {
      console.error('[contacts:delete] error:', e);
      return false;
    }
  });

  ipcMain.handle('app:set-spellcheck', async (_evt, enabled) => {
    try {
      if (getMainWindow()?.webContents?.session) {
        getMainWindow().webContents.session.setSpellCheckerEnabled(Boolean(enabled));
      }
      return true;
    } catch (e) {
      console.error('[app:set-spellcheck] error:', e);
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
  // Çöp/spam kutusunu sunucuda kalıcı olarak boşaltır, SONRA yerel DB'yi temizler.
//
// Düzeltilen kritik hatalar:
//  1) imapflow `search()` hata/bağlantı durumunda `false`/`undefined` DÖNER
//     (throw etmez). `if (all && all.length > 0)` koruması bunu "kutu zaten boş"
//     sanıyor, expunge hiç yapılmadan handler `true` dönüyordu -> kullanıcı
//     "silindi" diyordu, sunucuda hiçbir şey silinmemişti.
//  2) `messageFlagsAdd`/`messageDelete` imapflow'da exec hatasında `false`
//     döndürür (throw etmez) ve `\Deleted` permanentFlags'ta yoksa sessizce
//     hiçbir şey yapılmadan `true` döner. Dönüş değerleri KONTROL ediliyor.
//  3) `run('EXPUNGE')` imapflow'ta range olmadan tamamen no-op (bkz. expunge.js).
//     Gerçek doğrulama: expunge sonrası yeniden arama yapılıyor.
//  4) Tek komutta 20.000 UID göndermek sessizce başarısız oluyor; UID'ler
//     parçalara bölünüyor.
//  5) Klasör, `mail.cjs`'teki `findTrashPath` (IMAP \Trash bayrağı) ile de
//     doğrulanıyor; DB/sağlayıcı tahmini yanlış kutuya düşüyordu.
async function emptySpecialFolder({ email, folder, patterns, imapFlag, label }) {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');

  // 1. Doğru klasörü IMAP'ten doğrula (\Trash / \Junk bayrağı)
  let targetFolder = folder;
  let creds = null;
  try {
    creds = await freshCredentials(acc);
    await imapLock(email, async () =>
      withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
        if (imapFlag) {
          try {
            const detected = await findSpecialFolderByFlag(client, imapFlag);
            if (detected) targetFolder = detected;
          } catch (e) {
            console.warn(`[empty] ${label} bayrağıyla klasör tespiti başarısız:`, e?.message);
          }
        }
        // Tahmin edilen yol gerçekten açılabiliyor mu?
        try {
          await client.mailboxOpen(targetFolder, { readOnly: true });
        } catch (e) {
          // Yol yanlışsa: hiçbir şey silmeden hataya düş (sessiz sahte başarı yok)
          throw new Error(`${label} klasörü sunucuda açılamadı ("${targetFolder}"): ${e?.responseText || e?.message}`);
        }
      }),
    );
  } catch (e) {
    console.error(`[empty-${label}] hata:`, e);
    throw new Error(`${label} klasörü sunucuda açılamadı: ${e?.message || e}. Yerel veriler korundu.`);
  }

  // 2. Sunucuda expunge et
  let purgedUids = [];
  try {
    purgedUids = await imapLock(email, async () =>
      withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
        await client.mailboxOpen(targetFolder, { readOnly: false });

        const found = await client.search({ all: true }, { uid: true });
        if (!Array.isArray(found)) {
          // search() false/undefined döndü -> BAŞARISIZ. Önceden burası boş
          // kutu sanılıp sessizce "başarılı" dönülüyordu.
          throw new Error('Sunucu ileti listesini döndürmedi (arama başarısız veya bağlantı koptu).');
        }
        const uids = found.map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (uids.length === 0) {
          try { await client.mailboxClose(); } catch {}
          return [];
        }

        // UID setini parçala: 20.000 iletiyi tek STORE'da göndermek
        // sunucu tarafında sessizce reddediliyor.
        const CHUNK = 400;
        for (let i = 0; i < uids.length; i += CHUNK) {
          const chunk = uids.slice(i, i + CHUNK);
          const seq = chunk.join(',');
          try {
            await client.messageDelete(seq, { uid: true });
          } catch (e) {
            // messageDelete STORE + EXPUNGE yapar; başarısız olursa bayrak + EXPUNGE
            console.warn(`[empty] ${label} messageDelete başarısız (${e?.message}), bayrak yolu deneniyor`);
            const flagged = await client.messageFlagsAdd(seq, ['\\Deleted'], { uid: true });
            if (flagged === false) {
              throw new Error(`Sunucu Deleted bayrağını kabul etmedi (UID ${chunk[0]}-${chunk[chunk.length - 1]}).`);
            }
            await client.run('UID EXPUNGE');
          }
        }

        // 3. DOĞRULA: hâlâ duran ileti var mı?
        const remaining = await client.search({ all: true }, { uid: true });
        const left = Array.isArray(remaining) ? remaining.length : -1;
        if (left !== 0) {
          throw new Error(
            left < 0
              ? 'Silme sonrası doğrulama yapılamadı (sunucu yanıt vermedi).'
              : `Sunucuda ${left} ileti hâlâ duruyor; silme tamamlanamadı.`,
          );
        }

        try { await client.mailboxClose(); } catch {}
        return uids.map(String);
      }),
    );
  } catch (e) {
    console.error(`[empty-${label}] hata:`, e);
    throw new Error(`${label} sunucuda boşaltılamadı: ${e?.message || e}. Yerel veriler korundu.`);
  }

  // 4. IMAP doğrulandı: yerel DB'yi temizle
  const where = '(ltr(folder_path)=ltr(?)' + patterns.map(() => ' OR ltr(folder_path) LIKE ?').join('') + ')';
  const likeParams = patterns.map((p) => `%${p}%`);
  const pathWhere = '(ltr(path)=ltr(?)' + patterns.map(() => ' OR ltr(path) LIKE ?').join('') + ')';

  for (const u of purgedUids) {
    markDeleted(email, targetFolder, u);
  }
  const db = getDb();
  const accId = `(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)`;
  const deleted = db
    .prepare(`DELETE FROM messages WHERE account_id=${accId} AND ${where}`)
    .run(email, targetFolder, ...likeParams);
  try {
    db.prepare(`DELETE FROM attachments WHERE account_id=${accId} AND ${where}`)
      .run(email, targetFolder, ...likeParams);
  } catch {}
  try {
    db.prepare(`UPDATE folders SET unread_count=0 WHERE account_id=${accId} AND ${pathWhere}`)
      .run(email, targetFolder, ...likeParams);
  } catch {}

  console.log(`[empty-${label}] ${email}: sunucuda ${purgedUids.length} ileti silindi, yerelden ${deleted.changes} satır temizlendi.`);
  return { purged: purgedUids.length, removedLocal: deleted.changes, folder: targetFolder };
}

async function findSpecialFolderByFlag(client, flag) {
  try {
    const tree = await client.listTree();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.flags && n.flags.has(flag)) return n.path;
        if (n.folders) {
          const sub = walk(n.folders);
          if (sub) return sub;
        }
      }
      return null;
    };
    return walk(tree?.folders || tree) || null;
  } catch {
    return null;
  }
}

const TRASH_PATTERNS = ['çöp', 'trash', 'deleted', 'bin', 'silinmiş', 'recycl'];
  const SPAM_PATTERNS = ['spam', 'junk', 'gereksiz', 'istenmeyen', 'önemsiz'];

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
  // Bağlantı Testi — mevcut kaydedilmiş veya formda düzenlenen hesap kimlik bilgilerini doğrular
  ipcMain.handle('accounts:test-connection', async (_evt, { accountId, ...overrides }) => {
    const acc = getAccountById(accountId);
    if (!acc) throw new Error('Hesap bulunamadı.');

    const result = { imap: null, smtp: null };

    try {
      if (acc.auth_type === 'password') {
        let password = (overrides && overrides.password && overrides.password.trim()) ? overrides.password.trim() : null;
        if (!password && acc.password_enc) {
          password = dec(acc.password_enc);
        }
        if (!password) {
          const fullAcc = getAccountByEmail(acc.email);
          if (fullAcc?.password_enc) {
            password = dec(fullAcc.password_enc);
          }
        }
        if (!password) {
          throw new Error('Kayıtlı şifre bulunamadı. Lütfen şifre alanına şifrenizi girerek tekrar test edin.');
        }

        const imapHost = (overrides && overrides.imapHost) ? overrides.imapHost.trim() : acc.imap_host;
        const imapPort = (overrides && overrides.imapPort) ? Number(overrides.imapPort) : Number(acc.imap_port || 993);
        const smtpHost = (overrides && overrides.smtpHost) ? overrides.smtpHost.trim() : acc.smtp_host;
        const smtpPort = (overrides && overrides.smtpPort) ? Number(overrides.smtpPort) : Number(acc.smtp_port || 465);
        const smtpSecure = (overrides && overrides.smtpSecure !== undefined)
          ? Boolean(overrides.smtpSecure)
          : (acc.smtp_secure !== 0);

        // IMAP Testi
        try {
          await verifyImap({ host: imapHost, port: imapPort, email: acc.email, password });
          result.imap = { ok: true };
        } catch (imapErr) {
          result.imap = { ok: false, error: imapErr.message || String(imapErr) };
        }

        // SMTP Testi
        if (smtpHost && smtpPort) {
          try {
            const transporter = createTransporter({
              provider: acc.provider,
              email: acc.email,
              password,
              smtpHost,
              smtpPort,
              smtpSecure,
            });
            await transporter.verify();
            result.smtp = { ok: true };
          } catch (smtpErr) {
            result.smtp = { ok: false, error: smtpErr.message || String(smtpErr) };
          }
        } else {
          result.smtp = { ok: false, error: 'SMTP sunucusu veya portu belirtilmemiş.' };
        }
      } else {
        // OAuth hesap — IMAP bağlantısını withClient ile test et (ölü tokenda otomatik yenileme dahil)
        await withAuthRetry(acc, async (creds) => {
          if (!creds.accessToken) throw new Error('OAuth erişim anahtarı alınamadı.');
          await withClient({ provider: acc.provider, email: acc.email, accessToken: creds.accessToken }, async (client) => {
            await client.mailboxOpen('INBOX', { readOnly: true });
          });
        });
        result.imap = { ok: true };
        result.smtp = { ok: true, note: 'OAuth bağlantısı IMAP ile doğrulandı.' };
      }
    } catch (err) {
      result.imap = result.imap || { ok: false, error: friendlySyncError(acc.provider, err) };
    }

    return result;
  });

  // ── Gmail / OAuth dostu hata eşlemesi (salt metin dönüşümü, akışa dokunmaz) ──
  function friendlySyncError(provider, err) {
    // imapflow genel mesajların (örn. 'Command failed') asıl nedenini
    // responseText/response alanlarında taşır — önce tam detayı kur
    const raw = (typeof imapErrDetail === 'function' ? imapErrDetail(err) : (err?.message || String(err || '')));
    const low = raw.toLowerCase();
    const isGoogle = (provider || '').toLowerCase().includes('google') || low.includes('gmail');
    if (/invalid_grant|invalid client|unauthorized_client|access_denied|token has been expired or revoked|refresh token/i.test(raw)) {
      return `${raw} — Google/sağlayıcı oturumu reddetti. Çözüm: Ayarlar → Hesaplar'dan bu hesabı silip tekrar ekleyin (açılan Google izin ekranında 'Tüm e-postaları okuma/yönetme' kutusunu işaretlediğinizden emin olun).`;
    }
    if (/imap.*disabled|imap access is disabled|application-specific password|app password|invalid credentials|authentication failed|auth failed|login failed|oauth.*401|alert.*please log in via your web browser/i.test(raw)) {
      return `${raw} — Gmail bu hesaba IMAP erişimini onaylamadı. Lütfen kontrol edin:\n1) Gmail web arayüzünde Ayarlar → 'Tüm ayarları görüntüleyin' → 'Yönlendirme ve POP/IMAP' sekmesinde 'IMAP'i etkinleştir' seçeneğinin açık olduğundan emin olun.\n2) Google girişinde istenen e-posta okuma/yazma izin kutusunu onaylayın.\n3) Okul/kurum hesabıysa yöneticiniz üçüncü taraf IMAP erişimini kapatmış olabilir (bu durumda Ayarlar → Hesaplar → Manuel IMAP seçeneği ile Google Uygulama Şifresi girerek bağlanabilirsiniz).`;
    }
    if (/too many simultaneous connections|too many connections/i.test(raw)) {
      return `${raw} — Gmail eşzamanlı bağlantı limitine takıldı (çok hesap aynı anda). Birkaç saniye bekleyip Eşitle'ye tekrar basın.`;
    }
    if (/zaman aşımına uğradı|timeout|etimedout|econnreset|epipe|socket|network|fetch failed|enotfound/i.test(raw)) {
      return `${raw} — Sunucu bağlantısı zaman aşımına uğradı veya ağ kesildi. İnternet bağlantınızı kontrol edip tekrar deneyin.`;
    }
    if (isGoogle && /no such mailbox|mailbox|folder/i.test(raw)) {
      return `${raw} — Klasör Gmail'de bulunamadı (etiket silinmiş veya adı değişmiş olabilir). Klasör listesini yenileyip tekrar deneyin.`;
    }
    return raw;
  }

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
          45000,
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

  ipcMain.handle('accounts:add-manual', async (_evt, { email, password, imap, smtp }) => {
    if (!email || !password) throw new Error('E-posta ve şifre gerekli.');
    // Kaydetmeden önce bağlantıyı doğrula (anında hata bildirimi)
    await verifyImap({ host: imap.host, port: imap.port, email, password });
    return addAccount({
      provider: 'imap',
      email,
      authType: 'password',
      imapHost: imap.host,
      imapPort: imap.port,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      passwordEnc: enc(password),
    });
  });
  ipcMain.handle('notifications:get-settings', () => {
    // Varsayılanlar notifications.cjs'teki TEK kaynaktan gelir ve getSetting
    // kayıtlı ayarla birleştirir (eksik anahtar kalmaz).
    return getSetting('notification_settings', DEFAULT_NOTIFICATION_SETTINGS);
  });
  ipcMain.handle('notifications:save-settings', (_evt, newSettings) => {
    const current = getSetting('notification_settings', DEFAULT_NOTIFICATION_SETTINGS);
    const updated = { ...current, ...(newSettings || {}) };
    setSetting('notification_settings', updated);
    updateBackgroundSyncSchedule();
    return updated;
  });
  ipcMain.handle('notifications:test', () => {
    const accs = listAccounts();
    const targetEmail = accs.length > 0 ? accs[0].email : '';
    // Test bildirimi birleştirme penceresini beklemesin: göster ve hemen boşalt
    showDesktopNotification({
      title: '📧 Postacı — Test Bildirimi',
      body: 'Windows masaüstü bildirimleri aktif! Tıklayarak gelen kutunuza gidebilirsiniz.',
      email: targetEmail,
      folderPath: 'INBOX',
      uid: 'test-' + Date.now(),
    });
    flushAllPendingToasts();
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      try { getMainWindow().flashFrame(true); } catch {}
      getMainWindow().webContents.send('notify:new-mail', {
        email: targetEmail,
        folderPath: 'INBOX',
        count: 1,
        messages: [{ uid: 'test', subject: 'Postacı test bildirimi başarıyla alındı!', from: 'Postacı Ekibi' }],
        quiet: false,
        muted: false,
      });
    }
    return true;
  });
  ipcMain.handle('app:get-settings', () => {
    return getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
      language: 'tr',
    });
  });
  ipcMain.handle('app:save-settings', (_evt, newSettings) => {
    const current = getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
      language: 'tr',
    });
    const updated = { ...current, ...newSettings };
    setSetting('app_behavior_settings', updated);

    if (typeof updated.launchOnStartup === 'boolean' || typeof updated.startMinimized === 'boolean') {
      syncStartupSettings(!!updated.launchOnStartup, !!updated.startMinimized);
    }

    return updated;
  });

  ipcMain.handle('shell:open-external', (_evt, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:') || url.startsWith('ms-settings:'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Windows Görev Çubuğu Rozeti — okunmamış sayısı
  ipcMain.handle('app:set-badge', (_evt, count) => {
    if (!getMainWindow() || getMainWindow().isDestroyed()) return false;
    try {
      if (!count || count <= 0) {
        getMainWindow().setOverlayIcon(null, '');
        if (getTray() && !getTray().isDestroyed()) getTray().setToolTip('Postacı - E-posta İstemcisi');
        return true;
      }
      const label = count > 99 ? '99+' : String(count);
      const size = 24;
      // SVG rozet ikonu oluştur
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#e53e3e"/>
        <text x="${size / 2}" y="${count > 9 ? 16 : 17}" text-anchor="middle" fill="white"
          font-size="${count > 9 ? 10 : 13}" font-family="Arial,sans-serif" font-weight="bold">${label}</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      const img = nativeImage.createFromDataURL(dataUrl);
      getMainWindow().setOverlayIcon(img, `${count} okunmamış ileti`);
      if (getTray() && !getTray().isDestroyed()) getTray().setToolTip(`Postacı — ${count} okunmamış`);
      return true;
    } catch (e) {
      console.warn('[badge] setOverlayIcon hatası:', e?.message);
      return false;
    }
  });

  // Dosya Seç Dialog (özel arkaplan resmi için)
  ipcMain.handle('dialog:open-file', async (_evt, { filters, title } = {}) => {
    if (!getMainWindow() || getMainWindow().isDestroyed()) return null;
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: title || 'Dosya Seç',
      properties: ['openFile'],
      filters: filters || [
        { name: 'Resim Dosyaları', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    try {
      const data = fs.readFileSync(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };
      const mime = mimeMap[ext] || 'image/png';
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });

}

module.exports = { registerIpc };
