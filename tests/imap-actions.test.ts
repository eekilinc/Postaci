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
