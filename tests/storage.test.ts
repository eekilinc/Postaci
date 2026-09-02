import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { account, email } from './fixtures.js';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-storage-'));
process.env.POSTACI_DATA_DIR = directory;
process.env.POSTACI_SEED_DEMO = '0';
fs.writeFileSync(path.join(directory, 'accounts.json'), JSON.stringify([account]));
const db = await import('../server/services/db.js');
const { BackupService } = await import('../server/services/backupService.js');
const { decryptBackup, CredentialError, decryptSecret } = await import('../server/services/secrets.js');
db.initDatabase();
after(() => db.closeDatabase());

test('uses the requested storage engine', () => {
  assert.equal(db.getStorageStatus().engine, process.env.POSTACI_STORAGE === 'json' ? 'json' : 'sqlite');
});
test('migrates plaintext legacy accounts without losing passwords or OAuth tokens', () => {
  const saved = db.getAccountById(account.id)!;
  assert.equal(saved.imapPassword, account.imapPassword);
  assert.equal(saved.oauthRefreshToken, account.oauthRefreshToken);
  const raw = fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8');
  assert.ok(!raw.includes('fixture-password'));
  assert.ok(!raw.includes('fixture-refresh'));
  assert.match(raw, /postaci:v1:/);
});
test('decryption fails closed for corrupted ciphertext', () => {
  assert.throws(() => decryptSecret('postaci:v1:broken'), CredentialError);
});
test('supports pagination beyond 500 records without duplicates', () => {
  db.saveEmailsBatch(Array.from({ length: 750 }, (_, i) => email(i)));
  const ids: string[] = [];
  for (let offset = 0; offset < 750; offset += 100) ids.push(...db.getEmails({ accountId: account.id, folder: 'INBOX', limit: 100, offset }).map(e => e.id));
  assert.equal(ids.length, 750); assert.equal(new Set(ids).size, 750);
  assert.equal(db.getEmails({ sort: 'oldest', limit: 1 })[0].id, email(0).id);
  assert.equal(db.getEmails({ sort: 'newest', limit: 1 })[0].id, email(749).id);
});
test('pin and snooze survive writes and reads', () => {
  db.updateEmailFlags(email(2).id, { isPinned: true, snoozedUntil: '2030-01-01T00:00:00.000Z' });
  assert.equal(db.getEmailById(email(2).id)!.isPinned, true);
  assert.equal(db.getEmailById(email(2).id)!.snoozedUntil, '2030-01-01T00:00:00.000Z');
});
test('folder moves persist the server mailbox identity used by later deletes', () => {
  const target = email(3);
  db.updateEmailFlags(target.id, { folder: 'TRASH', isDeleted: true, mailboxPath: 'TRASH', imapUid: 0 });
  const moved = db.getEmailById(target.id)!;
  assert.equal(moved.folder, 'TRASH');
  assert.equal(moved.mailboxPath, 'TRASH');
  assert.equal(moved.imapUid, 0);
});

test('backup includes OAuth, mail, attachments, contacts, calendar and folders', () => {
  const message = email(800);
  message.attachments = [{ id: 'attachment', filename: 'file.txt', contentType: 'text/plain', size: 4, contentBase64: 'dGVzdA==' }];
  db.saveEmail(message);
  db.createContact({ id: 'contact', name: 'Contact', email: 'contact@example.test', isStarred: true });
  db.createCalendarEvent({ id: 'event', title: 'Meeting', startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z', isAllDay: false, color: '#123456', accountId: account.id });
  db.registerServerFolder({ id: 'folder', accountId: account.id, path: 'Projects', name: 'Projects', folderKey: 'Projects' });
  const encrypted = BackupService.createBackup('fixture-passphrase', { postaci_theme: 'nord' });
  assert.ok(!JSON.stringify(encrypted).includes('fixture-password'));
  const payload = decryptBackup(encrypted, 'fixture-passphrase');
  assert.equal(payload.accounts[0].oauthRefreshToken, account.oauthRefreshToken);
  assert.equal(payload.emails.length, 751);
  assert.equal(payload.emails.find((e: any) => e.id === message.id).attachments[0].contentBase64, 'dGVzdA==');
  assert.equal(payload.contacts.length, 1); assert.equal(payload.calendarEvents.length, 1); assert.equal(payload.customFolders.length, 1);
  const restored = BackupService.restoreBackup(encrypted, 'merge', 'fixture-passphrase');
  assert.equal(restored.preferences.postaci_theme, 'nord');
  assert.equal(db.exportData().emails!.length, 751);
});
test('wrong backup password and invalid records leave existing data intact', () => {
  const before = db.exportData();
  const encrypted = BackupService.createBackup('fixture-passphrase');
  assert.throws(() => BackupService.restoreBackup(encrypted, 'merge', 'wrong-password'));
  assert.throws(() => db.restoreData({ accounts: [account], emails: [{ id: 'broken' } as any] }));
  assert.deepEqual(db.exportData(), before);
});
test('merge rolls back all changes after a conflicting mail ID', () => {
  const other = { ...account, id: 'other-account', email: 'other@example.test' };
  const before = db.exportData();
  assert.throws(() => db.restoreData({ accounts: [other], emails: [{ ...email(1), accountId: other.id }] }));
  assert.equal(db.getAccountById(other.id), undefined);
  assert.deepEqual(db.exportData(), before);
});

test('metadata sync preserves downloaded bodies and local pin/snooze state', () => {
  const old = db.getEmailById(email(2).id)!;
  db.saveEmailsBatch([{ ...email(2), bodyHtml: '<p>Envelope only</p>', bodyText: 'Envelope only', hasFullBody: false }], true);
  const updated = db.getEmailById(email(2).id)!;
  assert.equal(updated.isPinned, true);
  assert.equal(updated.snoozedUntil, old.snoozedUntil);
  assert.equal(updated.bodyHtml, old.bodyHtml);
  assert.equal(updated.hasFullBody, true);
});
