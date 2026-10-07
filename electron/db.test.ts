// electron/db.test.ts — yerel SQLite katmanı fonksiyonel testleri
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('./db.cjs') as {
  initDb: (p: string) => unknown;
  getDb: () => { prepare: (s: string) => { run: (...a: unknown[]) => void }; close: () => void };
  addAccount: (a: Record<string, unknown>) => unknown;
  getAccountByEmail: (e: string) => { id: number } | undefined;
  updateAccount: (id: number, u: Record<string, unknown>) => void;
  deleteAccount: (id: number) => void;
  listMessages: (email: string, folder: string, limit?: number, offset?: number) => unknown[];
  markReadDb: (e: string, f: string, uid: string) => void;
  toggleStarDb: (e: string, f: string, uid: string) => unknown;
  saveMessageBody: (e: string, f: string, uid: string, b: { html?: string; text?: string; messageId?: string; references?: string[] }) => void;
  getMessageBody: (e: string, f: string, uid: string) => { body_html?: string; message_id?: string; references: string[] } | undefined;
  searchUnifiedMessages: (q: string) => unknown[];
  upsertContact: (c: Record<string, unknown>) => unknown;
  searchContacts: (q: string) => unknown[];
  listContacts: (q?: string) => unknown[];
  deleteContact: (id: number) => void;
};

const EMAIL = 'test@ornek.com';

function insertMessage(uid: string, subject: string, isRead = 0, starred = 0) {
  db.getDb()
    .prepare(
      `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, is_read, starred, has_att)
       VALUES ((SELECT id FROM accounts WHERE email=?), 'INBOX', ?, ?, 'a@x.com', ?, '2026-01-01', 'özet', ?, ?, 0)`,
    )
    .run(EMAIL, uid, subject, EMAIL, isRead, starred);
}

beforeAll(() => {
  db.initDb(mkdtempSync(join(tmpdir(), 'postaci-dbtest-')));
  db.addAccount({ provider: 'imap', email: EMAIL, displayName: 'Test', authType: 'basic' });
  insertMessage('1', 'Rapor taslağı', 0, 0);
  insertMessage('2', 'Fatura', 1, 1);
  insertMessage('3', 'Tatil planı', 0, 0);
});

afterAll(() => {
  db.getDb().close();
});

describe('accounts', () => {
  it('ekle → e-postaya göre bul → güncelle', () => {
    const acc = db.getAccountByEmail(EMAIL);
    expect(acc).toBeTruthy();
    db.updateAccount(acc!.id, { displayName: 'Yeni İsim' });
    expect((db.getAccountByEmail(EMAIL) as { display_name?: string }).display_name).toBe('Yeni İsim');
  });
});

describe('messages', () => {
  it('klasörden listeler', () => {
    expect(db.listMessages(EMAIL, 'INBOX')).toHaveLength(3);
  });
  it('okundu işaretleme listeye yansır', () => {
    db.markReadDb(EMAIL, 'INBOX', '1');
    const rows = db.listMessages(EMAIL, 'INBOX') as { is_read: number }[];
    expect(rows.filter((r) => r.is_read === 1)).toHaveLength(2);
  });
  it('yıldızlama aç/kapa', () => {
    db.toggleStarDb(EMAIL, 'INBOX', '3');
    let rows = db.listMessages(EMAIL, 'INBOX') as { starred: number; uid: string }[];
    expect(rows.find((r) => r.uid === '3')!.starred).toBe(1);
    db.toggleStarDb(EMAIL, 'INBOX', '3');
    rows = db.listMessages(EMAIL, 'INBOX') as { starred: number; uid: string }[];
    expect(rows.find((r) => r.uid === '3')!.starred).toBe(0);
  });
  it('gövde kaydet → oku (threading alanlarıyla)', () => {
    db.saveMessageBody(EMAIL, 'INBOX', '1', { html: '<b>hi</b>', messageId: 'm1', references: ['m0', 'm1'] });
    const body = db.getMessageBody(EMAIL, 'INBOX', '1');
    expect(body?.body_html).toBe('<b>hi</b>');
    expect(body?.message_id).toBe('m1');
    expect(body?.references).toEqual(['m0', 'm1']);
  });
  it('birleşik aramada konu eşleşir', () => {
    const hits = db.searchUnifiedMessages('Fatura') as unknown[];
    expect(hits.length).toBeGreaterThan(0);
    expect(db.searchUnifiedMessages('olmayan-konu-xyz')).toHaveLength(0);
  });
});

describe('contacts', () => {
  it('ekle → ara → sil', () => {
    const c = db.upsertContact({ email: 'ahmet@firma.com', name: 'Ahmet Yılmaz' }) as { id: number };
    db.upsertContact({ email: 'ayse@firma.com', name: 'Ayşe Demir' });
    expect(db.searchContacts('ahmet')).toHaveLength(1);
    expect(db.listContacts()).toHaveLength(2);
    db.deleteContact(c.id);
    expect(db.searchContacts('ahmet')).toHaveLength(0);
  });
});
