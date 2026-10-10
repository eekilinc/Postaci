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
// İşlem sunucuda BAŞARISIZ olduğunda işareti geri al.
// Aksi halde 5 dakika boyunca o UID hiç senkronlanmaz ve kullanıcı iletiyi
// listede göremez (başarılı ama sessiz veri kaybı).
function clearDeleted(email, folderPath, uid) {
  deletedUidCache.delete(`${email}:${folderPath}:${uid}`);
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

// Bir hesabın kuyruğu en fazla bu kadar süre BEKLER. Asılı kalan bir görev
// (sessizce düşen soket, throttling, takılan FETCH) kuyruğu tıkamasın.
//
// DİKKAT — iki AŞAMALI tasarım (2026-10-11 düzeltmesi):
// Eski kod bu sayacı ENQUEUE anında başlatıp bekleme+çalıştırmanın TOPLAMINA
// karşı yarıştırıyordu. Sonuç: 20 sn'yi aşan sağlıklı bir INBOX senkronu bile
// "kuyruk zaman aşımı" hatası alıyor; catch bloğu hâlâ sağlıklı soketi
// invalidateClient ile öldürüyor ve indirme yarıda kesiliyordu ("çekerken
// bazen hata" şikayeti). Ayrıca beklerken reddedilen işlemin terk edilen
// zinciri SONRA yine de koşuyordu — silme için: kullanıcı hata görüyor, ama
// sunucudan silme arkada yine gerçekleşiyordu ("silerken bazen sorun").
//
// Yeni sözleşme (imap-lock.test.ts ile sabitlendi):
//   - BEKLEME aşaması: kuyruğun boşalması bu kadar sn'yi aşarsa işlem temiz
//     biçimde reddedilir ve HİÇ çalışmaz (hayalet yürütme yok). Sayaç öncül
//     bitince DURDURULUR. Hata mesajı bilerek "zaman aşımına uğradı" İÇERMEZ
//     ki çağıranlar (isTimeoutError) sağlıklı öncülün soketini yanlışlıkla
//     düşürmesin.
//   - YÜRÜTME aşaması: fn() kendi bütçesiyle sınırlıdır; aşılırsa (asılı
//     soket) invalidateClient çağrılır — kuyruk bunun sayesinde HER ZAMAN
//     ilerler, hiçbir işlem kuyruğu sonsuza dek tutamaz.
const QUEUE_WAIT_TIMEOUT_MS = 60000;
const IMAP_OP_TIMEOUT_MS = 45000;

function imapLock(email, fn) {
  const key = (email || '').toLowerCase().trim();
  const prev = _imapQueues.get(key) ?? Promise.resolve();

  const task = (async () => {
    // ── 1. BEKLEME: yalnızca kuyruğun boşalması sınırlıdır ──
    // prev hata vermiş olabilir; zincir hataların üstüne binmez, kuyruk yine ilerler.
    let waitTimer = null;
    try {
      await new Promise((resolve, reject) => {
        waitTimer = setTimeout(
          () => reject(new Error(
            `[${email}] IMAP kuyruğu çok meşgul (${Math.round(QUEUE_WAIT_TIMEOUT_MS / 1000)} sn içinde boşalmadı); sunucu yanıt vermiyor olabilir, tekrar deneyin.`,
          )),
          QUEUE_WAIT_TIMEOUT_MS,
        );
        prev.then(() => resolve(), () => resolve());
      });
    } finally {
      if (waitTimer) clearTimeout(waitTimer);
    }

    // ── 2. YÜRÜTME: minik güvenlik payı (50ms) + sınırlı işlem bütçesi ──
    const lastOp = _lastImapOpTime.get(key) || 0;
    const elapsed = Date.now() - lastOp;
    if (elapsed < 50) {
      await new Promise((r) => setTimeout(r, 50 - elapsed));
    }
    let opTimer = null;
    try {
      return await Promise.race([
        fn(),
        new Promise((_, rej) => {
          opTimer = setTimeout(() => {
            // Asılı soketi düşür: fn bundan sonra hızla hata verir ve kuyruk
            // bir sonraki işleme geçer. Çağıranlar aynı hatayı görünce
            // invalidateClient'i bir daha çağırır — zararsız.
            try { invalidateClient(email); } catch {}
            rej(new Error(
              `[${email}] IMAP işlemi zaman aşımına uğradı (${Math.round(IMAP_OP_TIMEOUT_MS / 1000)} sn); bağlantı düşürüldü.`,
            ));
          }, IMAP_OP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (opTimer) clearTimeout(opTimer);
      _lastImapOpTime.set(key, Date.now());
    }
  })();

  // Kuyruk sonu sinyali: hata yutulur ve ZİNCİR ÜZERİNE BİNMEZ.
  const settled = task.then(() => {}, () => {});
  _imapQueues.set(key, settled);
  // Kuyruk kaydını temizle (yalnızca hâlâ en son sinyalse)
  settled.finally(() => {
    if (_imapQueues.get(key) === settled) _imapQueues.delete(key);
  });
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
// Çok hesaplı senkron dayanıklılığı:
// Kök neden: runBackgroundSync + mail:sync-all-inboxes hesapları SIRAYLA ve
// ZAMAN AŞIMSIZ senkronize ediyordu. Tek bir Gmail yavaşlarsa/asılırsa
// (büyük kutuda FETCH, throttling, sessizce düşen soket) kuyruktaki TÜM
// sonraki hesaplar sonsuza dek bekliyordu — "bazı Gmail'ler eşitlenmiyor,
// özellikle son eklenenler" şikayetinin sebebi bu head-of-line bloklanması.
// Çözüm: (1) hesap başına zaman aşımı + asılı soketi düşürme,
// (2) sınırlı paralellik (3) — yavaş hesap diğerlerini bloklamaz.
//
// NOT: bu bütçe imapLock'un kendi hata ürettiği eşikten (60 sn bekleme +
// 45 sn yürütme ≈ 105 sn) YÜKSEK tutulur; yalnızca gerçek asılmalara karşı
// son güvenlik ağıdır. Daha kısa olsaydı, sağlıklı bir kuyruk bekleyişini
// yanlışlıkla kesip invalidateClient ile sağlıklı soketi öldürüyordu.
const SYNC_PER_ACCOUNT_TIMEOUT_MS = 110000;
const SYNC_CONCURRENCY = 2; // Gmail IP/bağlantı kısıtlamalarını önlemek için 2'li paralellik
// Tam temizlik ve diğer klasörlerin rozetleri arka planda en seyrek bu aralıkla taranır
const FULL_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const _lastFullPrune = new Map(); // email -> timestamp
// Yalnızca BAŞARILI turun sonunda damgalanır. Baştan damgalarsak, zamana
// uğrayan/başarısız bir tur sayacı ilerletir ve prune 15 dakika daha hiç
// çalışmaz ("sildiğim mailler hâlâ listede duruyor" şikayetinin kaynağı).
const _fullPrunePending = new Map(); // email -> timestamp (başlatıldı, henüz tamamlanmadı)
function shouldFullPrune(email) {
  const key = (email || '').toLowerCase().trim();
  const last = _lastFullPrune.get(key) || 0;
  if (Date.now() - last < FULL_PRUNE_INTERVAL_MS) return false;
  _fullPrunePending.set(key, Date.now());
  return true;
}
function commitFullPrune(email) {
  const key = (email || '').toLowerCase().trim();
  if (_fullPrunePending.has(key)) {
    _lastFullPrune.set(key, _fullPrunePending.get(key));
    _fullPrunePending.delete(key);
  }
}
function abortFullPrune(email) {
  _fullPrunePending.delete((email || '').toLowerCase().trim());
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
      // Tur gerçekten bitti: 15 dakikalık sayaç ancak şimdi ilerlesin
      if (doPrune) commitFullPrune(email);
      return r;
    }));
  try {
    return await withTimeout(work, SYNC_PER_ACCOUNT_TIMEOUT_MS, `[${email}] INBOX eşitleme`);
  } catch (e) {
    // Başarısız tur sayacı ilerletmesin; bir sonraki deneme hemen tekrar denesin
    if (doPrune) abortFullPrune(email);
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
  deletedUidCache, markDeleted, isDeleted, clearDeleted, _lastSyncTime, _imapQueues, _lastImapOpTime, _activeFolderPerAccount,
  imapLock, SYNC_PER_ACCOUNT_TIMEOUT_MS, SYNC_CONCURRENCY, FULL_PRUNE_INTERVAL_MS, shouldFullPrune, commitFullPrune, abortFullPrune,
  isTimeoutError, syncOneInboxWithTimeout, runWithConcurrency,
};
