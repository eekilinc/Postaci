// electron/db-drizzle.test.ts — taşınan sorguların davranış testleri
// Faz 2 kuralı: taşınan her fonksiyonun eski davranışını kilitleyen test olur.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbcjs = require('./db.cjs') as {
  initDb: (userDataPath: string) => unknown;
  getSetting: (key: string, def?: unknown) => unknown;
  setSetting: (key: string, value: unknown) => void;
};
// Drizzle hesap sorguları db.cjs üzerinden kilitlenir (Faz 2)
const ddb = require('./db.cjs') as {
  addAccount: (a: Record<string, unknown>) => unknown;
  getAccountByEmail: (e: string) => { email: string; display_name?: string } | null;
  listAccounts: () => unknown[];
  updateAccount: (id: number, u: Record<string, unknown>) => unknown;
  updateTokens: (e: string, t: Record<string, unknown>) => void;
  deleteAccount: (id: number) => unknown;
  getAccountById: (id: number) => { email?: string } | undefined;
};

describe('db-drizzle settings', () => {
  beforeAll(() => {
    dbcjs.initDb(mkdtempSync(join(tmpdir(), 'postaci-drizzle-')));
  });

  it('yoksa varsayılan döner', () => {
    expect(dbcjs.getSetting('olmayan-anahtar', 'varsayılan')).toBe('varsayılan');
    expect(dbcjs.getSetting('olmayan-anahtar')).toBeNull();
  });

  it('string ve obje turu yapar (eski JSON davranışı)', () => {
    dbcjs.setSetting('duz-metin', 'merhaba');
    expect(dbcjs.getSetting('duz-metin')).toBe('merhaba');
    dbcjs.setSetting('ayar-nesnesi', { a: 1, b: [2, 3] });
    expect(dbcjs.getSetting('ayar-nesnesi')).toEqual({ a: 1, b: [2, 3] });
  });

  it('üzerine yazma çalışır', () => {
    dbcjs.setSetting('anahtar', 'bir');
    dbcjs.setSetting('anahtar', 'iki');
    expect(dbcjs.getSetting('anahtar')).toBe('iki');
  });

  it('accounts: ekle/bul/güncelle/sil (Drizzle üzerinden)', () => {
    const id = ddb.addAccount({ provider: 'imap', email: 'drizzle@ornek.com', displayName: 'D' }) as number;
    expect(id).toBeGreaterThan(0);
    // aynı e-postada upsert: sayaç sabit kalır, tokens null kalır
    ddb.addAccount({ provider: 'imap', email: 'DRIZZLE@ornek.com', accessTokenEnc: 'tok' });
    const acc = ddb.getAccountByEmail('drizzle@ornek.com');
    expect(acc).toBeTruthy();
    expect(ddb.listAccounts()).toHaveLength(1);
    ddb.updateTokens('drizzle@ornek.com', { refreshTokenEnc: 'r', accessTokenEnc: 'a', tokenExpiry: '2030' });
    const full = ddb.getAccountById(1) as { refresh_token_enc?: string };
    expect(full?.refresh_token_enc).toBe('r');
    ddb.updateAccount(1, { displayName: 'Yeni' });
    expect(ddb.getAccountByEmail('drizzle@ornek.com')?.display_name).toBe('Yeni');
    ddb.deleteAccount(1);
    expect(ddb.listAccounts()).toHaveLength(0);
  });

  afterAll(() => {
    (dbcjs as unknown as { getDb: () => { close: () => void } }).getDb().close();
  });
});
