// src/query/mailKeys.test.ts — anahtar hiyerarşisi + istemci varsayılanları
import { describe, expect, it } from 'vitest';
import { createQueryClient } from './client';
import { mailKeys } from './mailKeys';

describe('mailKeys', () => {
  it('hesap bazında izole anahtar üretir', () => {
    expect(mailKeys.folders('a@x.com')).not.toEqual(
      mailKeys.folders('b@x.com'),
    );
    expect(mailKeys.folders(null)).toEqual(['mail', 'folders', 'none']);
  });

  it('hiyerarşiktir: mail anahtarı klasör anahtarının ön ekidir', () => {
    const f = mailKeys.folders('a@x.com');
    expect(f.slice(0, 1)).toEqual([...mailKeys.all]);
  });
});

describe('queryClient', () => {
  it('masaüstü varsayılanlarıyla kurulur', () => {
    const c = createQueryClient();
    const d = c.getDefaultOptions().queries;
    expect(d?.refetchOnWindowFocus).toBe(false);
    expect(d?.retry).toBe(1);
  });
});
