// electron/db-unread.test.ts — folders.unread_count sayacı regresyon testleri
//
// KÖK NEDEN: folders.unread_count, sunucudan IMAP STATUS ile gelen gerçek
// değerin üzerine yerel delta'ların uygulandığı bir sayacı olmalı. Önceden:
//  1) markRead/markUnread hiç dokunmuyordu -> okunan mailde rozet düşmüyordu
//  2) silme/taşıma handler'ları yerel alt kümenin sayısıyla EZİYORDU
//     -> 900 okunmamışlık klasör 50'ye düşüyordu
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const SRC = path.join(process.cwd(), 'electron');

type Ctx = {
  initDb: (p: string) => unknown;
  getDb: () => any;
  markReadDb: (e: string, f: string, u: string) => void;
  markUnreadDb: (e: string, f: string, u: string) => void;
  batchMarkReadDb: (e: string, f: string, u: string[], r: number) => void;
  adjustFolderUnread: (e: string, f: string, d: number) => void;
};

let ctx: Ctx;
let tmp: string;

const EMAIL = 'test@example.com';

function seed(unreadCount: number) {
  const db = ctx.getDb();
  db.prepare(
    `INSERT INTO accounts (provider, email, display_name) VALUES ('google', ?, 'Test')
     ON CONFLICT(email) DO UPDATE SET display_name='Test'`,
  ).run(EMAIL);
  db.prepare('DELETE FROM folders WHERE path = ?').run('INBOX');
  db.prepare('DELETE FROM messages WHERE uid LIKE ?').run('m-%');
  db.prepare(
    `INSERT INTO folders (account_id, name, path, unread_count)
     VALUES ((SELECT id FROM accounts WHERE email=?), 'Gelen Kutusu', 'INBOX', ?)`,
  ).run(EMAIL, unreadCount);
}

function addMsg(uid: string, isRead: number) {
  ctx
    .getDb()
    .prepare(
      `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, is_read)
       VALUES ((SELECT id FROM accounts WHERE email=?), 'INBOX', ?, 'konu', 'a@b.c', ?, '2026-01-01T00:00:00Z', '', ?)`,
    )
    .run(EMAIL, uid, EMAIL, isRead);
}

function folderUnread(): number {
  return (
    ctx.getDb().prepare('SELECT unread_count FROM folders WHERE path=?').get('INBOX')?.unread_count ?? -1
  );
}

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dbMod = require(path.join(SRC, 'db.cjs'));
  const dzMod = require(path.join(SRC, 'db-drizzle.cjs'));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-unread-'));
  dbMod.initDb(tmp);
  ctx = {
    initDb: dbMod.initDb,
    getDb: dbMod.getDb,
    markReadDb: (e, f, u) => dzMod.markReadDb(dbMod.getDb(), e, f, u),
    markUnreadDb: (e, f, u) => dzMod.markUnreadDb(dbMod.getDb(), e, f, u),
    batchMarkReadDb: (e, f, u, r) => dzMod.batchMarkReadDb(dbMod.getDb(), e, f, u, r),
    adjustFolderUnread: (e, f, d) => dzMod.adjustFolderUnread(dbMod.getDb(), e, f, d),
  };
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* yoksay */ }
});

describe('folders.unread_count sayacı', () => {
  it('okunan ileti sayacı ANINDA bir azaltır (sunucu değerini ezmeden)', () => {
    seed(900); // sunucudan gelen gerçek değer
    addMsg('m-1', 0);
    expect(folderUnread()).toBe(900);
    ctx.markReadDb(EMAIL, 'INBOX', 'm-1');
    // 900 -> 899. Önceden 900'de kalıyordu (rozet hiç düşmüyordu).
    expect(folderUnread()).toBe(899);
  });

  it('okunmadan yapılan ileti sayacı bir artırır', () => {
    seed(10);
    addMsg('m-2', 1);
    ctx.markUnreadDb(EMAIL, 'INBOX', 'm-2');
    expect(folderUnread()).toBe(11);
  });

  it('aynı duruma tekrar yazmak sayacı değiştirmez', () => {
    seed(10);
    addMsg('m-3', 1);
    ctx.markReadDb(EMAIL, 'INBOX', 'm-3');
    expect(folderUnread()).toBe(10);
    ctx.markReadDb(EMAIL, 'INBOX', 'm-3');
    expect(folderUnread()).toBe(10);
  });

  it('toplu okundu işaretlemesi yalnızca GERÇEKTEN durum değişenleri sayar', () => {
    seed(50);
    addMsg('m-4', 0); // okunmamis -> okundu  (-1)
    addMsg('m-5', 1); // zaten okunmus      (0)
    addMsg('m-6', 0); // okunmamis -> okundu (-1)
    ctx.batchMarkReadDb(EMAIL, 'INBOX', ['m-4', 'm-5', 'm-6'], 1);
    expect(folderUnread()).toBe(48);
  });

  it('toplu okunmadı işaretlemesi de delta uygular', () => {
    seed(5);
    addMsg('m-7', 1);
    addMsg('m-8', 1);
    ctx.batchMarkReadDb(EMAIL, 'INBOX', ['m-7', 'm-8'], 0);
    expect(folderUnread()).toBe(7);
  });

  it('sayacı asla eksiye düşürmez', () => {
    seed(1);
    addMsg('m-9', 0);
    ctx.markReadDb(EMAIL, 'INBOX', 'm-9');
    expect(folderUnread()).toBe(0);
    ctx.adjustFolderUnread(EMAIL, 'INBOX', -5);
    expect(folderUnread()).toBe(0);
  });

  it('silinen iletiler için delta (yerel alt küme hesabı DEĞİL) uygulanır', () => {
    // 900 sunucu değeri, ama yerelde yalnızca 3 ileti var.
    // Eski davranış yerel SUM ile yazıyordu -> 900 yerine 3 yazardı.
    seed(900);
    addMsg('m-10', 0);
    addMsg('m-11', 0);
    addMsg('m-12', 1);
    // 2 okunmamış silindi
    ctx.adjustFolderUnread(EMAIL, 'INBOX', -2);
    expect(folderUnread()).toBe(898);
  });

  it('ltr() Türkçe klasör adlarını küçük harfe çevirir (lower() çeviremez)', () => {
    const db = ctx.getDb();
    db.prepare('DELETE FROM folders WHERE path = ?').run('[Gmail]/Çöp kutusu');
    db.prepare(
      `INSERT INTO folders (account_id, name, path, unread_count)
       VALUES ((SELECT id FROM accounts WHERE email=?), 'Çöp kutusu', '[Gmail]/Çöp kutusu', 7)`,
    ).run(EMAIL);
    const r = db
      .prepare(
        `SELECT (lower(path) LIKE '%çöp%') AS eski, (ltr(path) LIKE '%çöp%') AS yeni FROM folders WHERE path = ?`,
      )
      .get('[Gmail]/Çöp kutusu') as { eski: number; yeni: number };
    // SQLite'un lower()'ı ASCII-only: Ç küçülmez -> eski yol HİÇ eşleşmez
    expect(r.eski).toBe(0);
    expect(r.yeni).toBe(1);
    db.prepare('DELETE FROM folders WHERE path = ?').run('[Gmail]/Çöp kutusu');
  });
});