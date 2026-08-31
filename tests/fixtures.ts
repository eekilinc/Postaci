import type { Account, Email } from '../server/types.js';
export const account: Account = { id: 'fixture-account', name: 'Test User', email: 'test@example.test', provider: 'demo', color: '#123456', isDefault: true, syncInterval: 60, imapPassword: 'fixture-password', smtpPassword: 'fixture-password', oauthRefreshToken: 'fixture-refresh', oauthClientSecret: 'fixture-secret' };
export function email(index: number): Email {
  return { id: 'fixture-mail-' + index, accountId: account.id, threadId: 'thread-' + index,
    messageId: '<fixture-' + index + '@example.test>', fromName: 'Sender ' + index, fromEmail: 'sender@example.test',
    to: [{ name: 'Test User', email: account.email }], cc: [], bcc: [],
    subject: 'Message ' + index, bodyText: 'Body ' + index, bodyHtml: '<p>Body ' + index + '</p>',
    snippet: 'Body ' + index, date: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    isRead: false, isStarred: false, isArchived: false, isDeleted: false, isDraft: false, isSpam: false,
    folder: 'INBOX', labels: [], priority: 'normal', attachments: [], imapUid: index + 1, mailboxPath: 'INBOX', hasFullBody: true,
  };
}
