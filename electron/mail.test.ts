// electron/mail.test.ts — IMAP hata detay formatlayıcı birim testleri
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { imapErrDetail } = require('./mail.cjs') as {
  imapErrDetail: (e: unknown) => string;
};

describe('imapErrDetail', () => {
  it('genel mesaj + sunucu yanıtı + kodu tek satırda birleştirir', () => {
    const out = imapErrDetail({
      message: 'Command failed',
      responseText: 'Invalid credentials (Failure)',
      response: { status: 'NO', code: 'AUTHENTICATIONFAILED' },
    });
    expect(out).toContain('Command failed');
    expect(out).toContain('sunucu-yanıtı=Invalid credentials (Failure)');
    expect(out).toContain('AUTHENTICATIONFAILED');
  });

  it('yalnızca mesaj varsa onu döndürür', () => {
    expect(imapErrDetail({ message: 'boom' })).toBe('boom');
  });

  it('boş/ tanımsız hatada çökmez', () => {
    expect(imapErrDetail(null)).toContain('bilinmeyen hata');
    expect(imapErrDetail(undefined)).toContain('bilinmeyen hata');
  });

  it('code alanını ekler', () => {
    expect(imapErrDetail({ message: 'x', code: 'ETIMEDOUT' })).toContain('ETIMEDOUT');
  });
});
