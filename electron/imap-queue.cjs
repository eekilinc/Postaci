// electron/imap-queue.cjs - IMAP serilestirme kuyrugu ve cok hesapli senkron (main.cjs'ten tasindi)
const { getDb } = require('./db.cjs');
const { syncFolder, refreshFolderCounts, withTimeout, invalidateClient } = require('./mail.cjs');
const { withAuthRetry } = require('./token-auth.cjs');

// Yakın zamanda silinen mesajlar — sync'in bunları tekrar eklemesini önler
// format: 'email:folderPath:uid' → expiry timestamp
const deletedUidCache = new Map();
function markDeleted(email, folderPath, uid) {
  const key = `${email}:${folderPath}:${uid}`;
  deletedUidCache.set(key, Date.now() + 5 * 60 * 1000); // 5 dakika TTL
}
function isDeleted(email, folderPath, uid) {
  const key = `${email}:${folderPath}:${uid}`;
  const exp = deletedUidCache.get(key);
  if (!exp) return false;
  if (Date.now() > exp) { deletedUidCache.delete(key); return false; }
  return true;
}

// Son kullanıcı senkronizasyon zamanı — arka plan sync'in aktif kullanıcıyla yarışmasını önler
const _lastSyncTime = new Map(); // email -> timestamp

// ── Per-account IMAP seri kuyruğu ──────────────────────────────────────────
// Gmail/Outlook hesap başına eşzamanlı bağlantı limitlerine sahiptir.
// Bu yapı aynı hesaba ait işlemleri sıralayıp 'User is authenticated but not connected'
// kilitlerini önler (concurrency = 1 per account).
const _imapQueues = new Map(); // email → Promise (kuyruk sonu)
const _lastImapOpTime = new Map(); // email → timestamp
const _activeFolderPerAccount = new Map(); // normEmail → folderPath (terk edilen klasörleri atlamak için)

function imapLock(email, fn) {
  const key = (email || '').toLowerCase().trim();
  const prev = _imapQueues.get(key) ?? Promise.resolve();
  const task = prev.then(async () => {
    // Ardışık çok hızlı çağrılarda minik güvenlik payı (50ms); boşta bekleyen bağlantıda 0ms
    const lastOp = _lastImapOpTime.get(key) || 0;
    const elapsed = Date.now() - lastOp;
    if (elapsed < 50) {
      await new Promise((r) => setTimeout(r, 50 - elapsed));
    }
    try {
      return await fn();
    } finally {
      _lastImapOpTime.set(key, Date.now());
    }
  }, async () => {
    try {
      return await fn();
    } finally {
      _lastImapOpTime.set(key, Date.now());
    }
  });
  _imapQueues.set(key, task.then(() => {}, () => {})); // kuyruk sonunu güncelle, hata yutma
  return task; // çağırıcıya gerçek sonuç / hata döner
}

// ── Çok hesaplı senkron dayanıklılığı ───────────────────────────────────────
// Kök neden: runBackgroundSync + mail:sync-all-inboxes hesapları SIRAYLA ve
// ZAMAN AŞIMSIZ senkronize ediyordu. Tek bir Gmail yavaşlarsa/asılırsa
// (büyük kutuda FETCH, throttling, sessizce düşen soket) kuyruktaki TÜM
// sonraki hesaplar sonsuza dek bekliyordu — "bazı Gmail'ler eşitlenmiyor,
// özellikle son eklenenler" şikayetinin sebebi bu head-of-line bloklanması.
// Çözüm: (1) hesap başına zaman aşımı + asılı soketi düşürme,
// (2) sınırlı paralellik (3) — yavaş hesap diğerlerini bloklamaz.
const SYNC_PER_ACCOUNT_TIMEOUT_MS = 45000;
const SYNC_CONCURRENCY = 2; // Gmail IP/bağlantı kısıtlamalarını önlemek için 2'li paralellik
// Tam temizlik ve diğer klasörlerin rozetleri arka planda en seyrek bu aralıkla taranır
const FULL_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const _lastFullPrune = new Map(); // email -> timestamp
function shouldFullPrune(email) {
  const key = (email || '').toLowerCase().trim();
  const last = _lastFullPrune.get(key) || 0;
  if (Date.now() - last < FULL_PRUNE_INTERVAL_MS) return false;
  _lastFullPrune.set(key, Date.now());
  return true;
}

function isTimeoutError(e) {
  return /zaman aşımına uğradı/i.test(e?.message || '');
}

// Tek hesabın INBOX senkronu: zaman aşımlı, asılı soketi temizleyen, bildirim üreten.
async function syncOneInboxWithTimeout(fullAcc) {
  const email = fullAcc.email;
  // Arka plan turu: pahalı tam temizlik ve klasör sayaçları en fazla 15 dk'da bir; ara turlar hafif artımlı.
  const doPrune = shouldFullPrune(email);
  const work = withAuthRetry(fullAcc, (creds) =>
    imapLock(email, async () => {
      const r = await syncFolder({
        provider: fullAcc.provider,
        email: fullAcc.email,
        folderPath: 'INBOX',
        db: getDb(),
        limit: 30,
        ...creds,
        skipUid: (uid) => isDeleted(fullAcc.email, 'INBOX', String(uid)),
        skipPrune: !doPrune,
      });
      // INBOX dışı klasörler: yalnızca periyodik temizlik turunda (15 dk'da bir) sayaçları tazele (aşırı STATUS sorgusunu önler)
      if (doPrune) {
        try {
          await withTimeout(
            refreshFolderCounts({
              provider: fullAcc.provider, email: fullAcc.email, db: getDb(), ...creds,
            }),
            15000,
            `[${email}] klasör sayaçları`,
          );
        } catch (e) {
          console.warn(`[bg-sync] ${email} klasör sayaçları atlandı:`, e?.message || e);
        }
      }
      return r;
    }));
  try {
    return await withTimeout(work, SYNC_PER_ACCOUNT_TIMEOUT_MS, `[${email}] INBOX eşitleme`);
  } catch (e) {
    if (isTimeoutError(e)) {
      try { invalidateClient(email); } catch {}
    }
    throw e;
  }
}

// Sınırlı paralellik havuzu: Gmail IMAP soket patlamasını önlemek için çalışanlar arasına küçük gecikme ekler
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, async (_x, workerIdx) => {
    if (workerIdx > 0) {
      await new Promise((r) => setTimeout(r, workerIdx * 300));
    }
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }));
  return results;
}

module.exports = {
  deletedUidCache, markDeleted, isDeleted, _lastSyncTime, _imapQueues, _lastImapOpTime, _activeFolderPerAccount,
  imapLock, SYNC_PER_ACCOUNT_TIMEOUT_MS, SYNC_CONCURRENCY, FULL_PRUNE_INTERVAL_MS, shouldFullPrune,
  isTimeoutError, syncOneInboxWithTimeout, runWithConcurrency,
};
