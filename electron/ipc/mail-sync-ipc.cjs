// electron/ipc/mail-sync-ipc.cjs — senkronizasyon ve klasor kanallari (sync*, folders*, unread-counts, diagnose).
// mail-ipc.cjs'in alt grubu; ipc.cjs yukleyicisi tarafindan kaydettirilir.
// Sozlesme: ipc.test.ts (kanal + duman), ipc-static.test.ts (import/kullanim).


const { ipcMain } = require('electron');
const { getDb, listAccounts, getAccountByEmail, getAllUnreadCounts } = require('../db.cjs');
const { syncInbox, syncFolder, withClient, invalidateClient } = require('../mail.cjs');
const { freshCredentials, withAuthRetry } = require('../token-auth.cjs');
const { isDeleted, _lastSyncTime, _activeFolderPerAccount, imapLock, SYNC_CONCURRENCY, syncOneInboxWithTimeout, isTimeoutError, runWithConcurrency } = require('../imap-queue.cjs');
const { notifyNewMessages } = require('../notifications.cjs');
const { withIpcTimeout, readFolderCache, fetchFoldersFromImap, friendlySyncError, _folderListFetchedAt, FOLDER_LIST_REFRESH_MS } = require('../ipc-helpers.cjs');



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

ipcMain.handle('mail:unread-counts', () => {
return getAllUnreadCounts();
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
