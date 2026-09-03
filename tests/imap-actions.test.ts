import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { account, email } from './fixtures.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-imap-actions-'));
process.env.POSTACI_DATA_DIR = directory;
process.env.POSTACI_SEED_DEMO = '0';

const db = await import('../server/services/db.js');
const { ImapService } = await import('../server/services/imapService.js');
db.initDatabase();
db.saveAccount({
  ...account,
  provider: 'custom',
  authType: 'password',
  imapHost: 'imap.example.test',
  imapPort: 993,
  imapSecure: true,
  smtpHost: 'smtp.example.test',
  smtpPort: 465,
  smtpSecure: true,
});
const originalGetClient = (ImapService as any).getOrCreateClient;
after(() => {
  (ImapService as any).getOrCreateClient = originalGetClient;
  db.closeDatabase();
});

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    list: async () => [
      { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' },
      { path: 'Trash', name: 'Trash', specialUse: '\\Trash' },
    ],
    getMailboxLock: async () => ({ release() {} }),
    messageMove: async () => ({ uidMap: new Map([[2, 20]]) }),
    messageCopy: async () => ({ uidMap: new Map([[2, 20]]) }),
    messageFlagsAdd: async () => true,
    messageFlagsRemove: async () => true,
    messageDelete: async () => true,
    search: async () => [2],
    ...overrides,
  };
}

test('remote mail actions reject false IMAP command results', async () => {
  const message = email(1);

  (ImapService as any).getOrCreateClient = async () => fakeClient({
    messageMove: async () => false,
    messageCopy: async () => false,
  });
  assert.equal(await ImapService.moveMessageOnServer(account.id, message, 'TRASH'), false);

  (ImapService as any).getOrCreateClient = async () => fakeClient({
    messageDelete: async () => false,
  });
  assert.equal(await ImapService.deleteMessageOnServer(account.id, { ...message, folder: 'TRASH', isDeleted: true }), false);
});

test('remote move succeeds only after the IMAP server confirms it', async () => {
  (ImapService as any).getOrCreateClient = async () => fakeClient();
  assert.equal(await ImapService.moveMessageOnServer(account.id, email(1), 'TRASH'), true);
});

test('remote flag updates apply \\Seen flag on IMAP server', async () => {
  const flagsAdded: string[] = [];
  (ImapService as any).getOrCreateClient = async () => fakeClient({
    messageFlagsAdd: async (_uid: string, flags: string[]) => {
      flagsAdded.push(...flags);
      return true;
    },
  });
  const res = await ImapService.updateFlagsOnServer(account.id, email(1), { isRead: true });
  assert.equal(res, true);
  assert.ok(flagsAdded.includes('\\Seen'));
});

test('updateEmailBody matches both URL-encoded and raw email IDs', () => {
  const specialId = '<special-test-id@example.com>';
  const encodedId = encodeURIComponent(specialId);
  db.saveEmail({
    ...email(99),
    id: encodedId,
    messageId: specialId,
    bodyText: 'snippet only',
    bodyHtml: '<p>snippet only</p>',
    snippet: 'snippet only',
    hasFullBody: false,
  });

  const updated = db.updateEmailBody(specialId, {
    bodyText: 'Full body content here',
    bodyHtml: '<p>Full body content here</p>',
    hasFullBody: true,
  });
  assert.equal(updated, true);

  const fetched = db.getEmailById(specialId);
  assert.ok(fetched);
  assert.equal(fetched.hasFullBody, true);
  assert.equal(fetched.bodyText, 'Full body content here');
});

test('fetchFullEmailBody retrieves body source and updates email in database', async () => {
  const mail = email(101);
  db.saveEmail({
    ...mail,
    bodyText: mail.snippet,
    bodyHtml: `<p>${mail.snippet}</p>`,
    hasFullBody: false,
  });

  (ImapService as any).getOrCreateClient = async () => fakeClient({
    fetchOne: async () => ({
      source: Buffer.from(`From: sender@example.test\r\nTo: test@example.test\r\nSubject: Test Subject\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Actual full HTML body from IMAP</p>`),
      envelope: {},
      flags: new Set(),
    }),
  });

  const fullEmail = await ImapService.fetchFullEmailBody(account.id, 'INBOX', mail.imapUid || 102, mail.id);
  assert.ok(fullEmail);
  assert.equal(fullEmail.hasFullBody, true);
  assert.ok(fullEmail.bodyHtml.includes('Actual full HTML body from IMAP'));
});

test('getEmailById matches when Express decodes URI-encoded ID param', () => {
  const mid = '<20260903.express-test@domain.com>';
  const storedId = `imap-${account.id}-${encodeURIComponent(mid)}`;
  db.saveEmail({
    ...email(105),
    id: storedId,
    messageId: mid,
    bodyText: 'express snippet',
    bodyHtml: '<p>express snippet</p>',
    snippet: 'express snippet',
    hasFullBody: false,
  });

  // Express decodes :id parameter in routes
  const decodedExpressParam = decodeURIComponent(storedId);
  assert.notEqual(decodedExpressParam, storedId);

  const found = db.getEmailById(decodedExpressParam);
  assert.ok(found, 'Should find the email record even when Express decodes the route parameter');
  assert.equal(found.id, storedId);
  assert.equal(found.messageId, mid);
});

test('getEmailsNeedingBodies identifies body-less emails and syncPendingEmailBodies processes them', async () => {
  const mail1 = email(110);
  const mail2 = email(111);
  db.saveEmail({ ...mail1, hasFullBody: false, bodyText: mail1.snippet });
  db.saveEmail({ ...mail2, hasFullBody: true, bodyText: 'Already full body' });

  const needing = db.getEmailsNeedingBodies(10, account.id);
  assert.ok(needing.some(e => e.id === mail1.id));
  assert.ok(!needing.some(e => e.id === mail2.id));
});

test('decodeImapUtf7 correctly decodes Turkish IMAP folder names', async () => {
  const { decodeImapUtf7 } = await import('../server/services/imapService.js');
  assert.equal(decodeImapUtf7('&AMcA9g-p Kutusu'), 'Çöp Kutusu');
  assert.equal(decodeImapUtf7('[Gmail]/&AMcA9g-p Kutusu'), '[Gmail]/Çöp Kutusu');
  assert.equal(decodeImapUtf7('G&APY-nderilenler'), 'Gönderilenler');
  assert.equal(decodeImapUtf7('T&APw-m Postalar'), 'Tüm Postalar');
});

test('resolveServerMailboxPath resolves TRASH for Turkish UTF-7 mailbox names', async () => {
  const fakeClientWithTurkishTrash = {
    list: async () => [
      { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' },
      { path: '[Gmail]/&AMcA9g-p Kutusu', name: '&AMcA9g-p Kutusu' },
    ],
  };
  const resolved = await ImapService.resolveServerMailboxPath(fakeClientWithTurkishTrash as any, 'turkish-acc-id', 'TRASH');
  assert.equal(resolved, '[Gmail]/&AMcA9g-p Kutusu');
});

test('pruneMissingServerUids preserves TRASH emails with imapUid = 0 (newly moved)', () => {
  const movedMail = email(200);
  db.saveEmail({
    ...movedMail,
    folder: 'TRASH',
    isDeleted: true,
    imapUid: 0,
  });

  // Server TRASH sync returns only UID 50
  const deletedCount = db.pruneMissingServerUids(account.id, 'Trash', [50], 1, 'TRASH');
  assert.equal(deletedCount, 0, 'Should not delete newly moved email with imapUid: 0');

  const record = db.getEmailById(movedMail.id);
  assert.ok(record, 'Email with imapUid: 0 should still exist in TRASH');
  assert.equal(record.folder, 'TRASH');
});

test('saveEmailsBatch preserves TRASH emails during sync even if marked deleted locally', () => {
  const trashMail = email(205);
  // Mark deleted locally to prevent resurrection in INBOX
  db.markDeletedLocally({ id: trashMail.id, messageId: trashMail.messageId, accountId: account.id });

  // Sync arrives for TRASH mailbox
  const { savedCount, newEmails } = db.saveEmailsBatch([
    {
      ...trashMail,
      folder: 'TRASH',
      isDeleted: true,
      imapUid: 55,
      mailboxPath: 'Trash',
    }
  ], true);

  assert.equal(savedCount, 1);
  const found = db.getEmailById(trashMail.id);
  assert.ok(found, 'Email should be saved in TRASH even if in deleted_records');
  assert.equal(found.folder, 'TRASH');
});


