// electron/sync-pagination.test.ts — "Sunucudaki eski iletileri getir" regresyon testleri
//
// KÖK NEDEN: `beforeUid` renderer'da listenin son iletisinden geliyor ve liste
// `ORDER BY date DESC` ile sıralı, yani beforeUid TARIHSEL en eski iletidir.
// IMAP UID'leri ise VARIŞ sırasına göre artar ve monoton değildir. Aranan UID
// aralığı zaten alınmış iletilerle dolduğunda her tıklama aynı pencereyi
// tekrar "çekiyor" ama listeye hiçbir yeni ileti girmiyordu; kullanıcı
// "50 ileti çekildi" mesajını görüp hiçbir değişiklik görmüyordu.
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * syncFolder'ın beforeUid dalındaki hedef UID seçimini saf bir fonksiyon
 * olarak modelliyoruz. Gerçek kod electron/mail.cjs içinde; burada
 * "hangi UID'ler çekilecek" kararının DOĞRU sonucu verdiğini sabitliyoruz.
 */
function pickOlderTargets({
  foundUids,
  localUids,
  limit,
  beforeUid,
}: {
  foundUids: number[];
  localUids: string[];
  limit: number;
  beforeUid: number | null;
}): number[] {
  if (beforeUid === null) throw new Error('beforeUid gerekli');
  const beforeNum = Number(beforeUid);
  if (Number.isNaN(beforeNum) || beforeNum <= 1) return [];

  const ordered = foundUids
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n < beforeNum)
    .sort((a, b) => a - b);

  const alreadyLocal = new Set(localUids.map(String));
  const missing = ordered.filter((u) => !alreadyLocal.has(String(u)));
  if (missing.length === 0) return [];
  // En eskilerden başla ki her tıklamada gerçek ilerleme olsun
  return missing.slice(0, limit);
}

describe('eski ileti sayfalama hedef seçimi', () => {
  beforeEach(() => { /* saf fonksiyon */ });

  it('tarih sırası UID sırasından sapmışsa yine ilerleme üretir', () => {
    // UID 100 en YENİ ama tarihi eski; renderer listeyi date DESC ile
    // sıraladığı için beforeUid=100 geliyor. UID 90-99 henüz alınmamış.
    const found = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
    const local = ['100']; // sadece UID 100 alınmış
    const target = pickOlderTargets({ foundUids: found, localUids: local, limit: 5, beforeUid: 100 });
    // Daha önce: slice(-5) -> [96..100] = hepsi zaten local olan/üstüne yazılan
    // Doğrusu: eksik olan EN ESKİ 5 ileti
    expect(target).toEqual([90, 91, 92, 93, 94]);
    expect(target.every((u) => !local.includes(String(u)))).toBe(true);
  });

  it('pencere tamamen alınmışsa hedef boş döner (sonsuz döngü yerine)', () => {
    const found = [90, 91, 92];
    const local = ['90', '91', '92'];
    expect(pickOlderTargets({ foundUids: found, localUids: local, limit: 5, beforeUid: 100 })).toEqual([]);
  });

  it('kısmen alınmış pencere yalnızca eksikleri hedefler', () => {
    const found = [10, 11, 12, 13, 14];
    const local = ['10', '11'];
    expect(pickOlderTargets({ foundUids: found, localUids: local, limit: 10, beforeUid: 20 })).toEqual([12, 13, 14]);
  });

  it('her çağrıda ilerleme vardır (aynı iletiler tekrar hedeflenmez)', () => {
    const found = [50, 51, 52, 53, 54, 55];
    let local = ['54', '55'];
    // 1. tıklama: eksik en eskiler
    const t1 = pickOlderTargets({ foundUids: found, localUids: local, limit: 2, beforeUid: 56 });
    expect(t1).toEqual([50, 51]);
    local = [...local, ...t1.map(String)];
    // 2. tıklama: sıradaki
    const t2 = pickOlderTargets({ foundUids: found, localUids: local, limit: 2, beforeUid: 56 });
    expect(t2).toEqual([52, 53]);
    expect(t1.some((u) => t2.includes(u))).toBe(false);
  });

  it('geçersiz / yerel UID (draft-…, local-…) sayısal aralığa girmez', () => {
    // Number('draft-1730') -> NaN -> önceki kodda blok atlanıp 0 dönüyordu
    const asNum = Number('draft-1730000000000');
    expect(Number.isNaN(asNum)).toBe(true);
    expect(pickOlderTargets({ foundUids: [], localUids: [], limit: 50, beforeUid: asNum })).toEqual([]);
  });

  it('beforeUid 1 ise arama yapılmaz', () => {
    expect(pickOlderTargets({ foundUids: [1], localUids: [], limit: 50, beforeUid: 1 })).toEqual([]);
  });

  it('sonuç her zaman UID artan düzende ve limite uyar', () => {
    const found = Array.from({ length: 30 }, (_, i) => 1000 - i * 3);
    const target = pickOlderTargets({ foundUids: found, localUids: [], limit: 7, beforeUid: 2000 });
    expect(target.length).toBeLessThanOrEqual(7);
    for (let i = 1; i < target.length; i++) expect(target[i]).toBeGreaterThan(target[i - 1]);
  });
});