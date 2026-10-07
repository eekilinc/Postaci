// electron/providers.test.ts — sunucu tespiti birim testleri (ağ çağrısı mock'lu)
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { detectSettings, KNOWN } = require('./providers.cjs') as {
  detectSettings: (email: string) => Promise<{ source: string; imap: { host: string }; smtp: { host: string } }>;
  KNOWN: Record<string, unknown>;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectSettings', () => {
  it('bilinen sağlayıcıyı ağa çıkmadan döndürür', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectSettings('biri@gmail.com');
    expect(r.source).toBe('bilinen');
    expect(r.imap.host).toBe('imap.gmail.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('alan adı büyük/küçük harf ve boşluk duyarsız', async () => {
    const r = await detectSettings('  Biri@GMAIL.com ');
    expect(r.source).toBe('bilinen');
  });

  it('bilinmeyende autoconfig başarısızsa akıllı tahmine düşer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ağ yok')));
    const r = await detectSettings('kullanici@ornek-firma.com');
    expect(r.source).toBe('tahmin');
    expect(r.imap.host).toBe('imap.ornek-firma.com');
    expect(r.smtp.host).toBe('smtp.ornek-firma.com');
  });

  it('autoconfig XML gelirse onu kullanır', async () => {
    const xml = `<clientConfig version="1.1"><emailProvider id="x">
      <incomingServer type="imap"><hostname>imap.firma.net</hostname><port>143</port></incomingServer>
      <outgoingServer type="smtp"><hostname>smtp.firma.net</hostname><port>2525</port></outgoingServer>
    </emailProvider></clientConfig>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => xml }));
    const r = await detectSettings('a@firma.net');
    expect(r.source).toBe('autoconfig');
    expect(r.imap.host).toBe('imap.firma.net');
    expect(r.smtp.host).toBe('smtp.firma.net');
  });

  it('geçersiz e-postada hata fırlatır', async () => {
    await expect(detectSettings('adres-degil')).rejects.toThrow('Geçerli bir e-posta');
  });

  it('KNOWN tablosunda yaygın sağlayıcılar var', () => {
    expect(Object.keys(KNOWN)).toContain('outlook.com');
    expect(Object.keys(KNOWN)).toContain('icloud.com');
  });
});
