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

  afterAll(() => {
    (dbcjs as unknown as { getDb: () => { close: () => void } }).getDb().close();
  });
});
