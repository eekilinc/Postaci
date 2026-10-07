// electron/compose.test.ts — yanıt/ilet mantığı birim testleri
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitAddresses, buildReply, buildReplyAll, buildForward } = require('./compose.cjs') as {
  splitAddresses: (s: string) => string[];
  buildReply: (o: Record<string, unknown>) => { to: string; subject: string; inReplyTo?: string; references?: string };
  buildReplyAll: (o: Record<string, unknown>, my: string) => { to: string; cc: string };
  buildForward: (o: Record<string, unknown>) => { to: string; subject: string; inReplyTo?: string };
};

describe('splitAddresses', () => {
  it('virgül ve noktalı virgülle ayırır, boşlukları kırpar', () => {
    expect(splitAddresses('a@x.com, b@y.com ; c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });
  it('@ içermeyenleri ayıklar ve boş girdide boş döner', () => {
    expect(splitAddresses('bozuk, a@x.com')).toEqual(['a@x.com']);
    expect(splitAddresses('')).toEqual([]);
    expect(splitAddresses(null as unknown as string)).toEqual([]);
  });
});

describe('prefixSubject (buildReply üzerinden)', () => {
  const orig = { from: 'a@x.com', subject: 'Buluşma', text: 'selam', messageId: 'm1', references: [] };
  it('Re: ekler ve tekrarını yığmaz', () => {
    expect(buildReply(orig).subject).toBe('Re: Buluşma');
    expect(buildReply({ ...orig, subject: 'Re: Buluşma' }).subject).toBe('Re: Buluşma');
  });
  it('konusuz mesajda (konusuz) kullanır', () => {
    expect(buildReply({ ...orig, subject: '' }).subject).toBe('Re: (konusuz)');
  });
  it('threading alanlarını doldurur', () => {
    const r = buildReply({ ...orig, references: ['m0'] });
    expect(r.inReplyTo).toBe('m1');
    expect(r.references).toBe('m0 m1');
  });
});

describe('buildReplyAll', () => {
  it('cc listesinden kendimi ve göndereni çıkarır', () => {
    const r = buildReplyAll(
      { from: 'gonderen@x.com', to: 'ben@x.com, ikinci@x.com', cc: 'cc@x.com, ben@x.com', subject: 'S', references: [] },
      'ben@x.com',
    );
    expect(r.to).toBe('gonderen@x.com');
    expect(r.cc).toBe('ikinci@x.com, cc@x.com');
  });
});

describe('buildForward', () => {
  it('cc boş, threading yok, Fwd: öneki', () => {
    const f = buildForward({ from: 'a@x.com', subject: 'Belge', text: 'x', messageId: 'm9' });
    expect(f.to).toBe('');
    expect(f.subject).toBe('Fwd: Belge');
    expect(f.inReplyTo).toBeUndefined();
  });
});
