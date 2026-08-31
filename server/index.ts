import express, { Request, Response } from 'express';
import { getAIStatus } from './services/localAI.js';
import { getStorageStatus } from './services/db.js';
import { DeliveryGuard, deliveryJournalPath } from './services/deliveryGuard.js';
import { validateSendPayload } from './services/sendValidation.js';
import { getPreferences, savePreferences } from './services/preferences.js';
import { installSecurity } from './security.js';
import { publicAccount } from './services/secrets.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { APP_VERSION } from './version';

const getDirname = () => {
  if (typeof __dirname !== 'undefined') return __dirname;
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};
const appDir = getDirname();

import {
  initDatabase,
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getEmails,
  getEmailById,
  getEmailThread,
  saveEmail,
  updateEmailFlags,
  deleteEmailPermanent,
  bulkUpdateEmailFlags,
  bulkDeleteEmails,
  emptyTrash,
  getFolderStats,
  getServerFolders,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  searchRecipients,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  resetDatabase,
  clearAccountCache,
} from './services/db.js';

import { ImapService } from './services/imapService.js';
import { SmtpService } from './services/smtpService.js';
import { AIService } from './services/aiService.js';
import { BackupService } from './services/backupService.js';
import { UpdaterService } from './services/updaterService.js';
import { AutodiscoverService } from './services/autodiscoverService.js';
import { authRoutes } from './routes/auth.js';
import { Account, Email, CalendarEvent, Attachment } from './types.js';

const app = express();
const PORT = process.env.PORT || 3001;

// SSE Clients for real-time push notifications
// SSE Clients for real-time push notifications
let sseClients: Response[] = [];

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      if (client.writableEnded || client.destroyed) {
        sseClients.splice(i, 1);
      } else {
        client.write(payload);
      }
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// Send periodic SSE keep-alive ping every 25s to purge dead connections
setInterval(() => {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      if (client.writableEnded || client.destroyed) {
        sseClients.splice(i, 1);
      } else {
        client.write(': ping\n\n');
      }
    } catch {
      sseClients.splice(i, 1);
    }
  }
}, 25000);

// Middleware
installSecurity(app, Number(PORT));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer for attachment uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

// Initialize database
initDatabase();

// ----------------- SSE EVENTS ROUTE -----------------
app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) {
      sseClients.splice(idx, 1);
    }
  });
});

app.get('/api/system/diagnostics', (_req, res) => res.json({ storage: getStorageStatus(), ai: getAIStatus(), security: { loopbackOnly: true, encryptedCredentials: true } }));
app.get('/api/ai/status', (_req, res) => res.json(getAIStatus()));
app.get('/api/preferences', (_req, res) => res.json(getPreferences()));
app.put('/api/preferences', (req, res) => res.json(savePreferences(req.body)));

// ----------------- ACCOUNTS -----------------
app.get('/api/accounts', (req: Request, res: Response) => {
  try {
    const accounts = getAccounts();
    res.json(accounts.map(publicAccount));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', (req: Request, res: Response) => {
  try {
    const newAcc: Account = {
      ...req.body,
      id: req.body.id || `acc-${uuidv4()}`,
      syncInterval: req.body.syncInterval || 60,
      color: req.body.color || '#3b82f6',
      isDefault: req.body.isDefault ?? false,
    };
    const created = createAccount(newAcc);
    broadcastSSE('accounts_updated', publicAccount(created));

    // Trigger instant background sync for newly added account
    if (created.provider !== 'demo') {
      ImapService.syncAccount(created.id).then(result => {
        broadcastSSE('emails_synced', { accountId: created.id, ...result });
      }).catch(err => {
        console.warn(`Initial sync for newly added account ${created.email} failed:`, err);
      });
    }

    res.status(201).json(publicAccount(created));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/test', async (req: Request, res: Response) => {
  try {
    const saved = req.body.id ? getAccountById(req.body.id) : undefined;
    const credentials = { ...saved, ...req.body };
    if (saved && !req.body.imapPassword) credentials.imapPassword = saved.imapPassword;
    if (saved && !req.body.smtpPassword) credentials.smtpPassword = saved.smtpPassword;
    const imapRes = await ImapService.testConnection(credentials);
    if (!imapRes.success) {
      return res.status(400).json(imapRes);
    }

    const smtpRes = await SmtpService.testConnection(credentials);
    if (!smtpRes.success) {
      return res.status(400).json(smtpRes);
    }

    res.json({
      success: true,
      message: 'IMAP ve SMTP bağlantı testleri başarıyla tamamlandı!',
      folders: imapRes.folders,
      suggestedImapHost: imapRes.suggestedImapHost,
      suggestedImapUser: imapRes.suggestedImapUser,
      suggestedImapPort: imapRes.suggestedImapPort,
      suggestedImapSecure: imapRes.suggestedImapSecure,
      suggestedSmtpHost: smtpRes.suggestedSmtpHost,
      suggestedSmtpUser: smtpRes.suggestedSmtpUser,
      suggestedSmtpPort: smtpRes.suggestedSmtpPort,
      suggestedSmtpSecure: smtpRes.suggestedSmtpSecure,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/accounts/autodiscover', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await AutodiscoverService.discover(email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.use(authRoutes(broadcastSSE, PORT));

app.put('/api/accounts/:id', (req: Request, res: Response) => {
  try {
    const changes = { ...req.body };
    delete changes.id;
    for (const field of ['imapPassword', 'smtpPassword']) if (!changes[field]) delete changes[field];
    for (const field of ['oauthAccessToken', 'oauthRefreshToken', 'oauthClientSecret']) delete changes[field];
    const updated = updateAccount(req.params.id, changes);
    ImapService.clearAccountCache(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Hesap bulunamadı.' });
    broadcastSSE('accounts_updated', publicAccount(updated));
    res.json(publicAccount(updated));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id', (req: Request, res: Response) => {
  try {
    ImapService.clearAccountCache(req.params.id);
    const success = deleteAccount(req.params.id);
    if (!success) return res.status(404).json({ error: 'Hesap bulunamadı.' });
    broadcastSSE('accounts_updated', { id: req.params.id, deleted: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/sync', async (req: Request, res: Response) => {
  try {
    const result = await ImapService.syncAccount(req.params.id);
    broadcastSSE('emails_synced', { accountId: req.params.id, ...result });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/resync-full', async (req: Request, res: Response) => {
  try {
    clearAccountCache(req.params.id);
    const result = await ImapService.syncAccount(req.params.id);
    broadcastSSE('emails_synced', { accountId: req.params.id, ...result });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders/sync', async (req: Request, res: Response) => {
  try {
    const { accountId, mailboxPath } = req.body;
    if (!accountId || !mailboxPath) {
      return res.status(400).json({ error: 'accountId and mailboxPath are required.' });
    }
    const result = await ImapService.syncMailbox(accountId, mailboxPath);
    broadcastSSE('emails_synced', { accountId, mailboxPath, ...result });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders/older', async (req, res) => {
  try {
    if (typeof req.body.accountId !== 'string' || typeof req.body.mailboxPath !== 'string') return res.status(400).json({ error: 'Hesap ve klasör gerekli.' });
    const result = await ImapService.syncMailbox(req.body.accountId, req.body.mailboxPath, true);
    res.json(result);
    broadcastSSE('emails_synced', { accountId: req.body.accountId });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ----------------- EMAILS & FOLDERS -----------------
app.get('/api/emails', (req: Request, res: Response) => {
  try {
    const { accountId, folder, isStarred, isUnread, label, search } = req.query;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const emails = getEmails({
      accountId: accountId as string,
      folder: folder as string,
      isStarred: isStarred === 'true' ? true : undefined,
      isUnread: isUnread === 'true' ? true : undefined,
      label: label as string,
      search: search as string,
      limit: limit + 1, offset, sort: String(req.query.sort || 'newest'), hasAttachment: req.query.hasAttachment === 'true',
    });
    res.json({ items: emails.slice(0, limit), hasMore: emails.length > limit, nextOffset: offset + Math.min(limit, emails.length) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/folders/stats', (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    const stats = getFolderStats(accountId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/emails/:id', async (req: Request, res: Response) => {
  try {
    let email = getEmailById(req.params.id);
    if (!email) return res.status(404).json({ error: 'E-posta bulunamadı.' });

    // On-demand full email body fetch if body was not preloaded
    if (!email.hasFullBody && email.imapUid && email.accountId) {
      const account = getAccountById(email.accountId);
      if (account && account.provider !== 'demo') {
        const fullEmail = await ImapService.fetchFullEmailBody(
          email.accountId,
          email.mailboxPath || 'INBOX',
          email.imapUid,
          email.id
        );
        if (fullEmail) {
          email = fullEmail;
        }
      }
    }

    res.json(email);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/emails/thread/:threadId', (req: Request, res: Response) => {
  try {
    const emails = getEmailThread(req.params.threadId);
    res.json(emails);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/emails/:id/flags', (req: Request, res: Response) => {
  try {
    const updated = updateEmailFlags(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'E-posta bulunamadı.' });
    broadcastSSE('email_updated', updated);
    res.json(updated);

    // Asynchronously synchronize with remote IMAP mail server
    (async () => {
      try {
        if (req.body.folder || req.body.isDeleted) {
          const targetFolder = (req.body.folder === 'TRASH' || req.body.isDeleted) ? 'TRASH' : (req.body.folder || 'INBOX');
          await ImapService.moveMessageOnServer(updated.accountId, updated, targetFolder);
        }
        if (req.body.isRead !== undefined || req.body.isStarred !== undefined) {
          await ImapService.updateFlagsOnServer(updated.accountId, updated, {
            isRead: req.body.isRead,
            isStarred: req.body.isStarred
          });
        }
      } catch (e) {
        console.warn('Background IMAP sync error:', e);
      }
    })();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/emails/bulk-flags', (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids dizisi gereklidir.' });
    }
    const mails = ids.map(id => getEmailById(id)).filter(Boolean) as Email[];
    const count = bulkUpdateEmailFlags(ids, updates || {});
    broadcastSSE('emails_synced', { count });
    res.json({ success: true, updatedCount: count });

    // Asynchronously synchronize bulk updates with remote IMAP mail server in parallel batches
    (async () => {
      const byAccount = new Map<string, Email[]>();
      for (const m of mails) {
        if (!byAccount.has(m.accountId)) byAccount.set(m.accountId, []);
        byAccount.get(m.accountId)!.push(m);
      }

      for (const [accId, accMails] of byAccount.entries()) {
        try {
          if (updates.folder || updates.isDeleted) {
            const targetFolder = (updates.folder === 'TRASH' || updates.isDeleted) ? 'TRASH' : (updates.folder || 'INBOX');
            await ImapService.bulkMoveMessagesOnServer(accId, accMails, targetFolder);
          }
          if (updates.isRead !== undefined || updates.isStarred !== undefined) {
            await ImapService.bulkUpdateFlagsOnServer(accId, accMails, {
              isRead: updates.isRead,
              isStarred: updates.isStarred
            });
          }
        } catch (e) {
          console.warn('Bulk IMAP sync error:', e);
        }
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/emails/bulk-delete', (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids dizisi gereklidir.' });
    }
    const mails = ids.map(id => getEmailById(id)).filter(Boolean) as Email[];
    const count = bulkDeleteEmails(ids);
    broadcastSSE('emails_synced', { count });
    res.json({ success: true, deletedCount: count });

    // Asynchronously delete permanently on remote IMAP mail server in parallel batches
    (async () => {
      const byAccount = new Map<string, Email[]>();
      for (const m of mails) {
        if (!byAccount.has(m.accountId)) byAccount.set(m.accountId, []);
        byAccount.get(m.accountId)!.push(m);
      }

      for (const [accId, accMails] of byAccount.entries()) {
        try {
          await ImapService.bulkDeleteMessagesOnServer(accId, accMails);
        } catch (e) {
          console.warn('Bulk IMAP delete error:', e);
        }
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders/empty-trash', (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    const count = emptyTrash(accountId);
    broadcastSSE('emails_synced', { count });
    res.json({ success: true, deletedCount: count });

    // Asynchronously empty trash on remote IMAP mail server
    ImapService.emptyTrashOnServer(accountId).catch(err => {
      console.warn('Empty trash IMAP sync error:', err);
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/emails/:id', (req: Request, res: Response) => {
  try {
    const mail = getEmailById(req.params.id);
    const success = deleteEmailPermanent(req.params.id);
    if (!success) return res.status(404).json({ error: 'E-posta bulunamadı.' });
    broadcastSSE('email_deleted', { id: req.params.id });
    res.json({ success: true });

    // Asynchronously delete on remote IMAP mail server
    if (mail) {
      ImapService.deleteMessageOnServer(mail.accountId, mail).catch(err => {
        console.warn('IMAP delete error:', err);
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- COMPOSE & SEND -----------------
const deliveryGuard = new DeliveryGuard<Email>(deliveryJournalPath, getEmailById);
app.post('/api/send', async (req: Request, res: Response) => {
  try {
    validateSendPayload(req.body);
    const key = String(req.headers['idempotency-key'] || '');
    const sentEmail = await deliveryGuard.run(key, req.body, () => SmtpService.sendMail(req.body));
    broadcastSSE('email_sent', sentEmail);
    res.status(201).json(sentEmail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drafts', (req: Request, res: Response) => {
  try {
    const draft: Email = {
      ...req.body,
      id: req.body.id || `draft-${uuidv4()}`,
      threadId: req.body.threadId || `thread-draft-${uuidv4()}`,
      date: new Date().toISOString(),
      isDraft: true,
      folder: 'DRAFTS',
      labels: ['Taslak'],
      attachments: req.body.attachments || [],
      to: req.body.to || [],
      cc: req.body.cc || [],
      bcc: req.body.bcc || [],
      isRead: true,
      isStarred: false,
      isArchived: false,
      isDeleted: false,
      isSpam: false,
      priority: 'normal',
      snippet: (req.body.bodyText || '').substring(0, 150).replace(/\s+/g, ' ')
    };
    const saved = saveEmail(draft);
    broadcastSSE('draft_saved', saved);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi.' });
    }
    const attachment: Attachment = {
      id: uuidv4(),
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      contentBase64: req.file.buffer.toString('base64'),
    };
    res.json(attachment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- AI COPILOT -----------------
app.post('/api/ai/summarize', async (req: Request, res: Response) => {
  try {
    const email: Email = req.body;
    const summary = await AIService.summarizeEmail(email);
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/smart-replies', async (req: Request, res: Response) => {
  try {
    const email: Email = req.body;
    const replies = await AIService.generateSmartReplies(email);
    res.json({ replies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/polish', async (req: Request, res: Response) => {
  try {
    const { text, style } = req.body;
    const polished = await AIService.polishText(text, style);
    res.json({ text: polished });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/draft', async (req: Request, res: Response) => {
  try {
    const { prompt, replyContext } = req.body;
    const draft = await AIService.generateDraft(prompt, replyContext);
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/extract-tasks', (req: Request, res: Response) => {
  try {
    const email: Email = req.body.email || req.body;
    const tasks = AIService.extractTasks(email);
    res.json({ tasks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/security-check', (req: Request, res: Response) => {
  try {
    const email: Email = req.body;
    const security = AIService.analyzeSecurity(email);
    res.json(security);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CALENDAR -----------------
app.get('/api/calendar/events', (req: Request, res: Response) => {
  try {
    const events = getCalendarEvents();
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/events', (req: Request, res: Response) => {
  try {
    const event: CalendarEvent = {
      ...req.body,
      id: req.body.id || `cal-${uuidv4()}`,
      color: req.body.color || '#3b82f6',
      status: req.body.status || 'CONFIRMED'
    };
    const created = createCalendarEvent(event);
    broadcastSSE('calendar_updated', created);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/calendar/events/:id', (req: Request, res: Response) => {
  try {
    const updated = updateCalendarEvent(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    broadcastSSE('calendar_updated', updated);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/calendar/events/:id', (req: Request, res: Response) => {
  try {
    const success = deleteCalendarEvent(req.params.id);
    if (!success) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    broadcastSSE('calendar_updated', { id: req.params.id, deleted: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/rsvp', (req: Request, res: Response) => {
  try {
    const { emailId, status } = req.body;
    const email = getEmailById(emailId);
    if (!email || !email.meetingInvite) {
      return res.status(404).json({ error: 'Toplantı daveti bulunamadı.' });
    }

    email.meetingInvite.status = status;
    saveEmail(email);

    if (status === 'ACCEPTED' || status === 'TENTATIVE') {
      const calEvent: CalendarEvent = {
        id: `cal-${email.meetingInvite.uid || uuidv4()}`,
        uid: email.meetingInvite.uid,
        title: email.meetingInvite.summary,
        description: email.meetingInvite.description,
        location: email.meetingInvite.location,
        startTime: email.meetingInvite.startTime,
        endTime: email.meetingInvite.endTime,
        isAllDay: false,
        color: '#3b82f6',
        accountId: email.accountId,
        organizer: email.meetingInvite.organizer,
        status: status === 'ACCEPTED' ? 'CONFIRMED' : 'TENTATIVE',
        emailId: email.id
      };
      createCalendarEvent(calEvent);
    }

    broadcastSSE('rsvp_updated', { emailId, status });
    res.json({ success: true, email });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CONTACTS -----------------
app.get('/api/contacts/search', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const results = searchRecipients(q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contacts', (req: Request, res: Response) => {
  try {
    const contacts = getContacts();
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', (req: Request, res: Response) => {
  try {
    const contact = {
      ...req.body,
      id: req.body.id || `cnt-${uuidv4()}`,
      isStarred: req.body.isStarred ?? false
    };
    const created = createContact(contact);
    broadcastSSE('contacts_updated', created);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/contacts/:id', (req: Request, res: Response) => {
  try {
    const updated = updateContact(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    broadcastSSE('contacts_updated', updated);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/contacts/:id', (req: Request, res: Response) => {
  try {
    const success = deleteContact(req.params.id);
    if (!success) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    broadcastSSE('contacts_updated', { id: req.params.id, deleted: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- BACKUP & RESTORE -----------------
app.post('/api/backup/export', (req: Request, res: Response) => {
  try {
    const backup = BackupService.createBackup(req.body.passphrase, req.body.preferences);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=postaci_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/import', (req: Request, res: Response) => {
  try {
    const { backup, mode, passphrase } = req.body;
    const result = BackupService.restoreBackup(backup, mode || 'merge', passphrase);
    broadcastSSE('accounts_updated', {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------- SYSTEM & HEALTH -----------------
app.get('/api/system/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// ----------------- RESET DATABASE & FACTORY RESET -----------------
const handleResetDb = (req: Request, res: Response) => {
  try {
    const { seedDemo } = req.body || {};
    const result = resetDatabase(Boolean(seedDemo));
    broadcastSSE('accounts_updated', {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/settings/reset-database', handleResetDb);
app.post('/api/system/reset-database', handleResetDb);

// ----------------- GITHUB UPDATER -----------------
app.get('/api/system/update-check', async (req: Request, res: Response) => {
  try {
    const repo = req.query.repo as string | undefined;
    const result = await UpdaterService.checkForUpdates(repo);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve production frontend assets if built
import fs from 'fs';
const staticDirCandidates = [
  path.join(appDir, '../client'),
  path.join(appDir, 'client'),
  path.resolve(process.cwd(), 'dist/client'),
  path.resolve(process.cwd(), 'client')
];
const staticDir = staticDirCandidates.find(d => fs.existsSync(path.join(d, 'index.html'))) || path.resolve(process.cwd(), 'dist/client');
app.use(express.static(staticDir));

app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/events')) {
    return next();
  }
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Postacı Backend API Aktif. Lütfen frontend geliştirme sunucusunu (port 5173) açın.');
  }
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`🚀 Postacı API Sunucusu http://127.0.0.1:${PORT} üzerinde çalışıyor.`);
  // Start continuous 15s auto-sync engine
  ImapService.startAutoSyncEngine(broadcastSSE);
}).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} kullanımda. Başka bir sunucuya bağlanılmadı.`);
    process.exit(1);
  } else {
    console.error('Server listen error:', err);
  }
});
