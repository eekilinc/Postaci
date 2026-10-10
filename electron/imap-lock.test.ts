// electron/imap-lock.test.ts — hesap başına IMAP kuyruğunun zamanlama sözleşmesi
//
// KULLANICI BELİRTİSİ: "senkronizasyonda bazen silerken bazen çekerken sorun
// oluyor" — aralıklı (intermittent) hatalar. Mekanizma hipotezi:
//
// 1. ÇEKERKEN: imapLock'un 20 sn'lik sayacı ENQUEUE anında başlar ve
//    bekleme+çalıştırmanın TOPLAMINI sınırlar. Büyük bir INBOX senkronu 20 sn'yi
//    aşarsa çağıran hata alır; catch'teki invalidateClient ise hâlâ sağlıklı
//    çalışan soketi ÖLDÜRÜR → indirme yarıda kesilir.
// 2. SİLERKEN: silme, arkada koşan bir senkronun arkasına kuyruklanır; 20 sn'lik
//    toplam sayaç hâlâ BEKLERKEN ateşlenir → kullanıcıya "silinemedi" hatası
//    görünür; ama terk edilen (abandoned) işlem SONRA yine de çalışır → sunucu
//    değişir, yerel temizlik yapılmaz → hayalet durum.
//
// Bu dosya İSTENEN davranışı sabitler (şimdi KIRMIZI, düzeltmeyle YEŞİL):
//   - beklemeyi aşan işlem temiz biçimde reddedilir ve HİÇ çalışmaz
//   - yürütme bütçesini aşan (asılı) işlem invalidateClient ile düşürülür
//   - kuyruk-meşgul hatası isTimeoutError ile EŞLEŞMEZ (yanlış soket
//     öldürmeyi önler); yürütme aşımı EŞLEŞİR.
//
// CJS modüller require.cache stub'larıyla izole edilir (bkz. ipc.test.ts);
// sayaclar vi.useFakeTimers ile sürülür — döngü saniyeler içinde koşar.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ── Stub'lar: imap-queue.cjs'in bağımlılıkları ────────────────────────────────
const invalidateClient = vi.fn();
const withTimeout = (promise: Promise<unknown>, ms: number, label: string) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} zaman aşımına uğradı (${Math.round(ms / 1000)} sn).`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (t) clearTimeout(t); });
};

function injectStub(absPath: string, exports: unknown) {
  require.cache[absPath] = {
    id: absPath, filename: absPath, loaded: true, exports, children: [], paths: [],
  } as unknown as NodeModule;
}

injectStub(require.resolve('./mail.cjs'), {
  invalidateClient,
  withTimeout,
  syncFolder: vi.fn(),
  refreshFolderCounts: vi.fn(),
});
injectStub(require.resolve('./db.cjs'), { getDb: () => ({}) });
injectStub(require.resolve('./token-auth.cjs'), { withAuthRetry: (_a: unknown, fn: (c: unknown) => unknown) => fn({}) });

const { imapLock, isTimeoutError, _imapQueues, _lastImapOpTime } = require('./imap-queue.cjs') as {
  imapLock: (email: string, fn: () => Promise<unknown>) => Promise<unknown>;
  isTimeoutError: (e: unknown) => boolean;
  _imapQueues: Map<string, Promise<unknown>>;
  _lastImapOpTime: Map<string, number>;
};

// Sahte zamanlayıcı evrenleri testler arasında değişir; modülün içindeki
// kuyruk/sayaç haritaları ÖNCEKİ evrene ait zaman damgaları taşır ve yeni
// testte kilitlenme yaratır. Her testte sökülür.
const resetQueueState = () => {
  _imapQueues.clear();
  _lastImapOpTime.clear();
};

vi.setConfig({ testTimeout: 20_000 });

const EMAIL = 'a@x.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.useFakeTimers();
  resetQueueState();
  invalidateClient.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('imapLock — yürütme bütçesi', () => {
  it('tek başına 20 sn aşan sağlıklı işlem hata vermemeli (çekerken belirtisi)', async () => {
    const p = imapLock(EMAIL, async () => {
      await sleep(30_000);
      return 'ok';
    });
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(p).resolves.toBe('ok');
  });

  it('yürütme bütçesini aşan asılı işlem invalidateClient ile düşürülür', async () => {
    const p = imapLock(EMAIL, async () => {
      await sleep(60_000); // 45 sn iç bütçesinin üstünde — asılı soket simülasyonu
      return 'x';
    });
    await vi.advanceTimersByTimeAsync(46_000);
    await expect(p).rejects.toThrow(/zaman aşımına uğradı/);
    expect(invalidateClient).toHaveBeenCalledWith(EMAIL);
  });
});

describe('imapLock — kuyruk beklemesi', () => {
  it('öndeki sağlıklı senkron arkasına kuyruklanan silme bekler ve başarır', async () => {
    const order: string[] = [];
    const pA = imapLock(EMAIL, async () => {
      order.push('A:start');
      await sleep(30_000);
      order.push('A:end');
      return 'A';
    });
    const pB = imapLock(EMAIL, async () => {
      order.push('B:start');
      await sleep(2_000);
      order.push('B:end');
      return 'B';
    });
    await vi.advanceTimersByTimeAsync(35_000);
    await expect(pA).resolves.toBe('A');
    await expect(pB).resolves.toBe('B');
    // B, A bittikten SONRA başlamalı (aynı hesapta sıralı yürütme)
    expect(order.indexOf('B:start')).toBeGreaterThan(order.indexOf('A:end'));
  });

  it('meşgul reddedilen işlem HİÇ çalışmaz (hayalet yürütme yok)', async () => {
    // İki öncül x 40 sn = 80 sn backlog; 60 sn bekleme bütçesi aşılır.
    // Öncüller kasıtlı olarak beklenmez: amaçları kuyruğu meşgul tutmak.
    const _pA = imapLock(EMAIL, () => sleep(40_000).then(() => 'A'));
    const _pC = imapLock(EMAIL, () => sleep(40_000).then(() => 'C'));
    const spy = vi.fn(async () => 'B');
    const pB = imapLock(EMAIL, spy);
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(pB).rejects.toThrow(/kuyruğ/);
    // Öncüller kendi bütçeleri içinde bitse de B ASLA çalışmamalı
    await vi.advanceTimersByTimeAsync(25_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('meşgul hatası isTimeoutError ile eşleşmez — sağlıklı öncülün soketi yanlışlıkla düşürülmez', async () => {
    const _pA = imapLock(EMAIL, () => sleep(40_000).then(() => 'A'));
    const _pC = imapLock(EMAIL, () => sleep(40_000).then(() => 'C'));
    const pB = imapLock(EMAIL, async () => 'B');
    await vi.advanceTimersByTimeAsync(61_000);
    const err = await pB.then(
      () => { throw new Error('reddedilmeliydi'); },
      (e: Error) => e,
    );
    expect(isTimeoutError(err)).toBe(false);
    // Meşgul hatası bağlantıyı düşürmemeli (öncüller hâlâ sağlıklı)
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  it('meşgul sonrası kuyruk sağlıklı kalır', async () => {
    const _pA = imapLock(EMAIL, () => sleep(40_000).then(() => 'A'));
    const _pC = imapLock(EMAIL, () => sleep(40_000).then(() => 'C'));
    const pB = imapLock(EMAIL, async () => 'B');
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(pB).rejects.toThrow(/kuyruğ/);
    const pD = imapLock(EMAIL, async () => 'D');
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(pD).resolves.toBe('D');
  });
});

describe('imapLock — sıralama koruması (regresyon)', () => {
  it('işlemler hesap başına sırayla koşar', async () => {
    const order: string[] = [];
    const pA = imapLock(EMAIL, async () => { order.push('A'); await sleep(10_000); return 'A'; });
    const pB = imapLock(EMAIL, async () => { order.push('B'); await sleep(5_000); return 'B'; });
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(pA).resolves.toBe('A');
    await expect(pB).resolves.toBe('B');
    expect(order).toEqual(['A', 'B']);
  });

  it('öncül hata verirse kuyruk zehirlenmez', async () => {
    const pA = imapLock(EMAIL, async () => { throw new Error('sunucu hatası'); });
    const pB = imapLock(EMAIL, async () => 'B');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pA).rejects.toThrow('sunucu hatası');
    await expect(pB).resolves.toBe('B');
  });

  it('farklı hesaplar birbirini beklemez', async () => {
    const pA = imapLock('a@x.com', () => sleep(10_000).then(() => 'A'));
    const pB = imapLock('b@y.com', () => sleep(1_000).then(() => 'B'));
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pB).resolves.toBe('B'); // a@x.com hâlâ koşarken bitti
    await vi.advanceTimersByTimeAsync(9_000);
    await expect(pA).resolves.toBe('A');
  });
});