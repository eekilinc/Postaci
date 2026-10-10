// @vitest-environment jsdom
// src/hooks/useUndoSend.test.tsx — gönderim kuyruğunun veri kaybı sözleşmesi.
//
// KULLANICI VERİSİ KAYBINA AÇIK İKİ DELİK (analiz bulgusu 2 ve 3):
//   A) SMTP hatasında yalnız hata gösteriliyordu; taslak gönderim kuyruğa
//      girerken SİLİNMİŞTİ → kullanıcı yazdığı e-postayı kaybediyordu.
//   B) Geri alma penceresi (5 sn) yalnız bellekte yaşıyordu; pencere sırasında
//      uygulama kapanırsa e-posta ne gider ne kalır — sessiz kayıp.
//
// Sözleşme (test önce KIRMIZI görüldü, düzeltmeyle YEŞİL):
//   - gönderim hatası → içerik yazma penceresine GERİ YÜKLENİR
//   - kuyruğa girerken payload localStorage'a YAZILIR (uygulama kapanırsa
//     kurtarılabilir), gönderim/geri alma bitince SİLİNİR
//   - ekler kota nedeniyle kaydedilemiyorsa eklersiz kaydedilir + işaretlenir
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUndoSend, persistPendingSend, clearPendingSend, restorePendingSend, PENDING_SEND_KEY } from './useUndoSend';
import type { SendPayload } from './useUndoSend';

const payload = (over: Partial<SendPayload> = {}): SendPayload => ({
  fromEmail: 'ben@x.com',
  to: 'ali@y.com',
  cc: '',
  subject: 'Önemli rapor',
  text: 'Rapor ektedir.',
  html: '<p>Rapor ektedir.</p>',
  attachments: [{ filename: 'rapor.pdf', contentType: 'application/pdf', dataBase64: 'QUJD', size: 3 }],
  ...over,
});

const sendMock = vi.fn();

function renderUndo(over: Record<string, unknown> = {}) {
  const onRestoreCompose = vi.fn();
  const hook = renderHook(() =>
    useUndoSend({
      onRestoreCompose,
      undoDelaySeconds: 0,
      setNotice: vi.fn(),
      setError: vi.fn(),
      ...over,
    }),
  );
  return { ...hook, onRestoreCompose };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sendMock.mockReset();
  (window as unknown as { postaci: unknown }).postaci = {
    mail: { send: sendMock },
    db: { stats: vi.fn().mockResolvedValue({}) },
    mail_delete: undefined,
  };
});
afterEach(() => vi.useRealTimers());

describe('A) gönderim hatası içeriği geri yükler', () => {
  it('SMTP hatasında onRestoreCompose payload ile çağrılır', async () => {
    sendMock.mockRejectedValue(new Error('SMTP bağlantı hatası'));
    const { result, onRestoreCompose } = renderUndo();

    await act(async () => {
      result.current.queueSendWithUndo(payload());
    });

    expect(onRestoreCompose).toHaveBeenCalledTimes(1);
    const p = onRestoreCompose.mock.calls[0][0] as SendPayload;
    expect(p.subject).toBe('Önemli rapor');
    expect(p.attachments).toHaveLength(1);
  });

  it('başarılı gönderimde onRestoreCompose çağrılmaz', async () => {
    sendMock.mockResolvedValue({ messageId: 'ok' });
    const { result, onRestoreCompose } = renderUndo();

    await act(async () => {
      result.current.queueSendWithUndo(payload());
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(onRestoreCompose).not.toHaveBeenCalled();
  });
});

describe('B) geri alma penceresi kalıcıdır', () => {
  it('kuyruğa girerken payload localStoragea yazılır', () => {
    const { result } = renderUndo({ undoDelaySeconds: 5 });
    act(() => {
      result.current.queueSendWithUndo(payload());
    });
    const raw = localStorage.getItem(PENDING_SEND_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).subject).toBe('Önemli rapor');
    expect(JSON.parse(raw!).attachments).toHaveLength(1);
  });

  it('geri sayım bitip gönderim BAŞARILI olunca kayıt silinir', async () => {
    sendMock.mockResolvedValue({ messageId: 'ok' });
    const { result } = renderUndo({ undoDelaySeconds: 2 });
    act(() => {
      result.current.queueSendWithUndo(payload());
    });
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeNull();
  });

  it('kullanıcı geri alınca kayıt silinir ve içerik composea döner', () => {
    sendMock.mockResolvedValue({});
    const { result, onRestoreCompose } = renderUndo({ undoDelaySeconds: 5 });
    act(() => {
      result.current.queueSendWithUndo(payload());
    });
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeTruthy();

    act(() => {
      result.current.handleUndoSend();
    });

    expect(onRestoreCompose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('uygulama kapanırsa: restorePendingSend payloadı döndürür ve kaydı temizler', () => {
    persistPendingSend(payload());
    const restored = restorePendingSend();
    expect(restored?.subject).toBe('Önemli rapor');
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeNull();
    expect(restorePendingSend()).toBeNull();
  });

  it('kota doluysa ekler olmadan kaydedilir ve işaretlenir', () => {
    const origSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // İlk yazma (eklerle) tıklansın, sonrakiler (eklersiz yedek) geçsin
    let called = 0;
    setItem.mockImplementation(function (this: Storage, k: string, v: string) {
      called += 1;
      if (called === 1 && v.includes('QUJD')) throw new DOMException('quota', 'QuotaExceededError');
      return origSetItem.call(this, k, v);
    });
    persistPendingSend(payload());
    const raw = localStorage.getItem(PENDING_SEND_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.attachmentsSkipped).toBe(true);
    expect(parsed.attachments).toHaveLength(0);
    setItem.mockRestore();
  });

  it('bozuk kayıt çökertmez ve null döner', () => {
    localStorage.setItem(PENDING_SEND_KEY, '{bozuk');
    expect(restorePendingSend()).toBeNull();
  });

  it('clearPendingSend kaydı sessizce siler', () => {
    persistPendingSend(payload());
    expect(() => clearPendingSend()).not.toThrow();
    expect(localStorage.getItem(PENDING_SEND_KEY)).toBeNull();
  });
});