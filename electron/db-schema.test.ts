// electron/db-schema.test.ts — Drizzle şeması <-> gerçek DB parlama testi
//
// Gerçek initDb() ile boş bir DB açar, PRAGMA table_info'dan sütunları okur ve
// Drizzle şemasındaki sütunlarla birebir karşılaştırır. Fark çıkarsa şema
// gerçeği yansıtmıyor demektir; Faz 2'ye (sorgu taşıma) ancak bu test yeşilken
// geçilir.
//
// Not: db.cjs singleton tutar, o yüzden tek DB açılıp tüm testlerde paylaşılır.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accounts,
  attachments,
  contacts,
  folders,
  messages,
  settings,
} from './db-schema';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbcjs = require('./db.cjs') as {
  initDb: (userDataPath: string) => Database;
  getDb: () => Database;
};

const tables = { accounts, folders, messages, attachments, settings, contacts };

function realColumns(db: Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c: { name: string }) => c.name)
    .sort();
}

describe('db-schema parlama', () => {
  let db: Database;
  beforeAll(() => {
    dbcjs.initDb(mkdtempSync(join(tmpdir(), 'postaci-schema-')));
    db = dbcjs.getDb();
  });
  afterAll(() => {
    db.close();
  });

  it('Drizzle tabloları gerçek DB sütunlarıyla birebir aynı', () => {
    for (const [name, table] of Object.entries(tables)) {
      const drizzleCols = Object.keys(getTableColumns(table)).sort();
      expect(realColumns(db, name), `tablo: ${name}`).toEqual(drizzleCols);
    }
  });

  it('kritik indeksler initDb sonrası mevcut', () => {
    const names: string[] = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .all()
      .map((r: { name: string }) => r.name);
    for (const idx of [
      'idx_messages_folder',
      'idx_messages_search',
      'idx_accounts_email_nocase',
      'idx_att_msg',
    ]) {
      expect(names, `indeks: ${idx}`).toContain(idx);
    }
  });
});
