// @vitest-environment jsdom
// src/hooks/useMessages.test.ts — saf yardımcılar: hedef hazır mı, hangi IPC
// kanalına gidilir, eşitleme özeti nasıl kurulur.
// Hook'un kendisi (React + TanStack Query) burada test edilmez; buradaki üç
// fonksiyon yanlış giderse liste/rozet sessizce bozulur, o yüzden sabitleniyor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCount, fetchPage, formatSyncNotice, ipcReady, PAGE_SIZE } from './useMessages';
import type { MessageTarget } from './useMessages';

const account = (over: Partial<MessageTarget> = {}): MessageTarget => ({
  email: 'a@x.com',
  folder: 'INBOX',
  unified: false,
  ...over,
});

describe('ipcReady', () => {
  afterEach(() => {
    delete (window as { postaci?: unknown }).postaci;
  });

  it('pencere köprüsü yoksa sorgu çalıştırmaz', () => {
    delete (window as { postaci?: unknown }).postaci;
    expect(ipcReady(account())).toBe(false);
  });

  it('hesap seçiliyse hazır', () => {
    (window as unknown as { postaci: unknown }).postaci = {};
    expect(ipcReady(account())).toBe(true);
  });

  it('birleşik gelen kutusu hesap gerektirmez', () => {
    (window as unknown as { postaci: unknown }).postaci = {};
    expect(ipcReady(account({ email: null, unified: true }))).toBe(true);
  });

  it('hesap yoksa ve birleşik değilse hazır değil', () => {
    (window as unknown as { postaci: unknown }).postaci = {};
    expect(ipcReady(account({ email: null, unified: false }))).toBe(false);
  });
});

describe('fetchPage / fetchCount', () => {
  beforeEach(() => {
    (window as unknown as { postaci: unknown }).postaci = {
      mail: {
        list: vi.fn().mockResolvedValue([{ uid: '1' }]),
        listUnified: vi.fn().mockResolvedValue([{ uid: 'u1' }]),
        count: vi.fn().mockResolvedValue({ total: 7, unread: 2 }),
        countUnified: vi.fn().mockResolvedValue({ total: 9, unread: 3 }),
      },
    };
  });

  it('birleşik hedefte listUnified/countUnified kanalına gider', async () => {
    const t = account({ email: null, unified: true });
    await fetchPage(t, 0);
    expect(await fetchCount(t)).toBe(9);
    expect(window.postaci!.mail.listUnified).toHaveBeenCalledWith(PAGE_SIZE, 0);
    expect(window.postaci!.mail.countUnified).toHaveBeenCalled();
    // Birleşik hedefte hesap-spesifik kanallar ÇAĞRILMAMALI
    expect(window.postaci!.mail.list).not.toHaveBeenCalled();
    expect(window.postaci!.mail.count).not.toHaveBeenCalled();
  });

  it('hesap hedefinde list/count kanalına gider ve ofseti iletir', async () => {
    const t = account();
    await fetchPage(t, PAGE_SIZE);
    expect(window.postaci!.mail.list).toHaveBeenCalledWith('a@x.com', 'INBOX', PAGE_SIZE, PAGE_SIZE);
    expect(await fetchCount(t)).toBe(7);
    expect(window.postaci!.mail.listUnified).not.toHaveBeenCalled();
  });
});

describe('formatSyncNotice', () => {
  it('kutudaki ve çekilen sayıyı bildirir', () => {
    const s = formatSyncNotice('INBOX', { total: 10, synced: 10 });
    expect(s).toContain('10');
    expect(s).toContain('INBOX');
  });

  it('klasör yoksa yer adı yazmaz', () => {
    expect(formatSyncNotice(null, { total: 3, synced: 3 })).not.toContain('null');
  });

  it('sunucu ileti bildiriyor ama hiçbiri düşmediyse uyarır', () => {
    // Sessiz kalmasın: 0 çekilen + sunucuda ileti var = eşleşme/izin sorunu.
    // Not: 'İ' lower() ile 'i̇' olur, bu yüzden toLowerCase() yerine
    // Türkçe karakter içermeyen bir parça aranır.
    const s = formatSyncNotice('INBOX', { total: 25, synced: 0 });
    expect(s).toMatch(/25/);
    expect(s).toContain('hiçbiri listeye düşmedi');
  });

  it('başarılı senkronizasyonda uyarı cümlesi kurmaz', () => {
    const s = formatSyncNotice('INBOX', { total: 25, synced: 25 });
    expect(s).not.toContain('hiçbiri listeye düşmedi');
  });

  it('hatalı iletileri ve ilk nedeni kısaltarak raporlar', () => {
    const s = formatSyncNotice('INBOX', {
      total: 10,
      synced: 7,
      failed: 3,
      firstError: 'x'.repeat(500),
    });
    expect(s).toContain('hatalı 3');
    expect(s).toContain('neden:');
    // Sunucu mesajı 180 karaktere kırpılır
    expect(s).not.toContain('x'.repeat(300));
  });
});