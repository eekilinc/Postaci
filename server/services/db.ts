import path from 'path';
import fs from 'fs';
import { Account, Email, Contact, CalendarEvent, FolderStat } from '../types.js';
import { initialAccounts, initialContacts, initialEmails, initialCalendarEvents } from './demoData.js';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

const dbPath = path.join(dataDir, 'postaci.db');
const jsonDbPath = path.join(dataDir, 'postaci_store.json');

let isNativeSqlite = false;
let db: any = null;

// In-Memory / File-based Store fallback if better-sqlite3 native addon fails to load (e.g. cross-platform Windows binaries)
interface MemoryStore {
  accounts: Account[];
  emails: Email[];
  contacts: Contact[];
  calendar_events: CalendarEvent[];
  deletedRecords?: Array<{ id: string; messageId?: string; accountId?: string; imapUid?: number; mailboxPath?: string; deletedAt: string }>;
}

let memStore: MemoryStore = {
  accounts: [],
  emails: [],
  contacts: [],
  calendar_events: [],
  deletedRecords: []
};

function loadJsonStore() {
  if (fs.existsSync(jsonDbPath)) {
    try {
      const content = fs.readFileSync(jsonDbPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        memStore = {
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          emails: Array.isArray(parsed.emails) ? parsed.emails : [],
          contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
          calendar_events: Array.isArray(parsed.calendar_events) ? parsed.calendar_events : [],
          deletedRecords: Array.isArray(parsed.deletedRecords) ? parsed.deletedRecords : []
        };
        return;
      }
    } catch {}
  }
  // Initialize with seed data if file doesn't exist
  memStore = {
    accounts: [...initialAccounts],
    emails: [...initialEmails],
    contacts: [...initialContacts],
    calendar_events: [...initialCalendarEvents],
    deletedRecords: []
  };
  saveJsonStore();
}

let saveTimer: NodeJS.Timeout | null = null;
let isSaving = false;
let needsSaveAgain = false;

export function saveJsonStore(forceSync = false) {
  if (isNativeSqlite) return;

  if (forceSync) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      fs.writeFileSync(jsonDbPath, JSON.stringify(memStore), 'utf-8');
    } catch (e) {
      console.warn('Sync JSON store save error:', e);
    }
    return;
  }

  if (saveTimer) return;

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (isSaving) {
      needsSaveAgain = true;
      return;
    }
    isSaving = true;
    try {
      const data = JSON.stringify(memStore);
      await fs.promises.writeFile(jsonDbPath, data, 'utf-8');
    } catch (e) {
      console.warn('Debounced JSON store save error:', e);
    } finally {
      isSaving = false;
      if (needsSaveAgain) {
        needsSaveAgain = false;
        saveJsonStore();
      }
    }
  }, 200);
}

export function resetDatabase() {
  if (!isNativeSqlite) {
    memStore = {
      accounts: [...initialAccounts],
      emails: [...initialEmails],
      contacts: [...initialContacts],
      calendar_events: [...initialCalendarEvents],
      deletedRecords: []
    };
    saveJsonStore();
    return { success: true, accountsCount: memStore.accounts.length, emailsCount: memStore.emails.length };
  }

  try {
    db.exec(`
      DELETE FROM emails;
      DELETE FROM server_folders;
      DELETE FROM contacts;
      DELETE FROM calendar_events;
      DELETE FROM deleted_records;
      DELETE FROM accounts;
    `);
    seedDemoData();
    return { success: true };
  } catch (err: any) {
    throw new Error(`Sıfırlama hatası: ${err.message}`);
  }
}

export function clearAccountCache(accountId: string): boolean {
  if (!isNativeSqlite) {
    memStore.emails = memStore.emails.filter(e => e.accountId !== accountId);
    if (memStore.deletedRecords) {
      memStore.deletedRecords = memStore.deletedRecords.filter(r => r.accountId !== accountId);
    }
    saveJsonStore();
    return true;
  }

  try {
    db.prepare('DELETE FROM emails WHERE accountId = ?').run(accountId);
    db.prepare('DELETE FROM deleted_records WHERE accountId = ?').run(accountId);
    return true;
  } catch {
    return false;
  }
}

try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  isNativeSqlite = true;
} catch (err: any) {
  console.warn('⚠️ Native SQLite not available, using JSON/In-Memory fallback store:', err.message || err);
  isNativeSqlite = false;
  loadJsonStore();
}

export function initDatabase() {
  if (!isNativeSqlite) {
    console.log('🌱 JSON Storage active. Loaded', memStore.emails.length, 'emails.');
    return;
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        imapHost TEXT,
        imapPort INTEGER,
        imapUser TEXT,
        imapPassword TEXT,
        imapSecure INTEGER,
        smtpHost TEXT,
        smtpPort INTEGER,
        smtpUser TEXT,
        smtpPassword TEXT,
        smtpSecure INTEGER,
        color TEXT NOT NULL,
        avatar TEXT,
        isDefault INTEGER NOT NULL DEFAULT 0,
        signature TEXT,
        syncInterval INTEGER NOT NULL DEFAULT 60,
        lastSyncedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        threadId TEXT NOT NULL,
        messageId TEXT,
        inReplyTo TEXT,
        references_header TEXT,
        fromName TEXT NOT NULL,
        fromEmail TEXT NOT NULL,
        to_json TEXT NOT NULL,
        cc_json TEXT NOT NULL,
        bcc_json TEXT NOT NULL,
        replyTo_json TEXT,
        subject TEXT NOT NULL,
        bodyText TEXT NOT NULL,
        bodyHtml TEXT NOT NULL,
        snippet TEXT NOT NULL,
        date TEXT NOT NULL,
        isRead INTEGER NOT NULL DEFAULT 0,
        isStarred INTEGER NOT NULL DEFAULT 0,
        isArchived INTEGER NOT NULL DEFAULT 0,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        isDraft INTEGER NOT NULL DEFAULT 0,
        isSpam INTEGER NOT NULL DEFAULT 0,
        folder TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        attachments_json TEXT NOT NULL,
        meetingInvite_json TEXT,
        aiSummary TEXT,
        aiSmartReplies_json TEXT,
        aiCategory TEXT,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        avatar TEXT,
        company TEXT,
        role TEXT,
        phone TEXT,
        notes TEXT,
        isStarred INTEGER NOT NULL DEFAULT 0,
        lastContactedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        uid TEXT,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        isAllDay INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL,
        accountId TEXT,
        organizer_json TEXT,
        attendees_json TEXT,
        status TEXT DEFAULT 'CONFIRMED',
        emailId TEXT
      );

      CREATE TABLE IF NOT EXISTS deleted_records (
        id TEXT PRIMARY KEY,
        accountId TEXT,
        messageId TEXT,
        imapUid INTEGER,
        mailboxPath TEXT,
        deletedAt TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_deleted_msg ON deleted_records(messageId);
      CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(accountId);
      CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
      CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(threadId);
      CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
    `);

    // Dynamic schema migrations for accounts table
    try { db.prepare('ALTER TABLE accounts ADD COLUMN authType TEXT').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE accounts ADD COLUMN oauthAccessToken TEXT').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE accounts ADD COLUMN oauthRefreshToken TEXT').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE accounts ADD COLUMN oauthExpiresAt INTEGER').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE accounts ADD COLUMN oauthClientId TEXT').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE accounts ADD COLUMN oauthClientSecret TEXT').run(); } catch (_) {}

    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
    if (accountCount.count === 0) {
      console.log('🌱 Seeding initial demo accounts, emails, contacts and calendar events...');
      seedDemoData();
    }
  } catch (err: any) {
    console.warn('SQLite init failed, falling back to JSON storage:', err.message);
    isNativeSqlite = false;
    loadJsonStore();
  }
}

function seedDemoData() {
  const insertAccount = db.prepare(`
    INSERT INTO accounts (
      id, name, email, provider, imapHost, imapPort, imapUser, imapPassword, imapSecure,
      smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, color, avatar, isDefault, signature, syncInterval, lastSyncedAt
    ) VALUES (
      @id, @name, @email, @provider, @imapHost, @imapPort, @imapUser, @imapPassword, @imapSecure,
      @smtpHost, @smtpPort, @smtpUser, @smtpPassword, @smtpSecure, @color, @avatar, @isDefault, @signature, @syncInterval, @lastSyncedAt
    )
  `);

  for (const acc of initialAccounts) {
    insertAccount.run({
      id: acc.id,
      name: acc.name,
      email: acc.email,
      provider: acc.provider,
      imapHost: acc.imapHost || null,
      imapPort: acc.imapPort || null,
      imapUser: acc.imapUser || null,
      imapPassword: acc.imapPassword || null,
      imapSecure: acc.imapSecure ? 1 : 0,
      smtpHost: acc.smtpHost || null,
      smtpPort: acc.smtpPort || null,
      smtpUser: acc.smtpUser || null,
      smtpPassword: acc.smtpPassword || null,
      smtpSecure: acc.smtpSecure ? 1 : 0,
      color: acc.color,
      avatar: acc.avatar || null,
      isDefault: acc.isDefault ? 1 : 0,
      signature: acc.signature || null,
      syncInterval: acc.syncInterval || 60,
      lastSyncedAt: acc.lastSyncedAt || null
    });
  }

  const insertContact = db.prepare(`
    INSERT INTO contacts (
      id, name, email, avatar, company, role, phone, notes, isStarred, lastContactedAt
    ) VALUES (
      @id, @name, @email, @avatar, @company, @role, @phone, @notes, @isStarred, @lastContactedAt
    )
  `);

  for (const cnt of initialContacts) {
    insertContact.run({
      id: cnt.id,
      name: cnt.name,
      email: cnt.email,
      avatar: cnt.avatar || null,
      company: cnt.company || null,
      role: cnt.role || null,
      phone: cnt.phone || null,
      notes: cnt.notes || null,
      isStarred: cnt.isStarred ? 1 : 0,
      lastContactedAt: cnt.lastContactedAt || null
    });
  }

  const insertEmail = db.prepare(`
    INSERT INTO emails (
      id, accountId, threadId, messageId, inReplyTo, references_header, fromName, fromEmail, to_json, cc_json, bcc_json, replyTo_json,
      subject, bodyText, bodyHtml, snippet, date, isRead, isStarred, isArchived,
      isDeleted, isDraft, isSpam, folder, labels_json, priority, attachments_json,
      meetingInvite_json, aiSummary, aiSmartReplies_json, aiCategory
    ) VALUES (
      @id, @accountId, @threadId, @messageId, @inReplyTo, @references_header, @fromName, @fromEmail, @to_json, @cc_json, @bcc_json, @replyTo_json,
      @subject, @bodyText, @bodyHtml, @snippet, @date, @isRead, @isStarred, @isArchived,
      @isDeleted, @isDraft, @isSpam, @folder, @labels_json, @priority, @attachments_json,
      @meetingInvite_json, @aiSummary, @aiSmartReplies_json, @aiCategory
    )
  `);

  for (const mail of initialEmails) {
    insertEmail.run({
      id: mail.id,
      accountId: mail.accountId,
      threadId: mail.threadId,
      messageId: mail.messageId || null,
      inReplyTo: mail.inReplyTo || null,
      references_header: mail.references || null,
      fromName: mail.fromName,
      fromEmail: mail.fromEmail,
      to_json: JSON.stringify(mail.to),
      cc_json: JSON.stringify(mail.cc),
      bcc_json: JSON.stringify(mail.bcc),
      replyTo_json: mail.replyTo ? JSON.stringify(mail.replyTo) : null,
      subject: mail.subject,
      bodyText: mail.bodyText,
      bodyHtml: mail.bodyHtml,
      snippet: mail.snippet,
      date: mail.date,
      isRead: mail.isRead ? 1 : 0,
      isStarred: mail.isStarred ? 1 : 0,
      isArchived: mail.isArchived ? 1 : 0,
      isDeleted: mail.isDeleted ? 1 : 0,
      isDraft: mail.isDraft ? 1 : 0,
      isSpam: mail.isSpam ? 1 : 0,
      folder: mail.folder,
      labels_json: JSON.stringify(mail.labels),
      priority: mail.priority || 'normal',
      attachments_json: JSON.stringify(mail.attachments || []),
      meetingInvite_json: mail.meetingInvite ? JSON.stringify(mail.meetingInvite) : null,
      aiSummary: mail.aiSummary || null,
      aiSmartReplies_json: mail.aiSmartReplies ? JSON.stringify(mail.aiSmartReplies) : null,
      aiCategory: mail.aiCategory || null
    });
  }

  const insertCal = db.prepare(`
    INSERT INTO calendar_events (
      id, uid, title, description, location, startTime, endTime, isAllDay, color, accountId, organizer_json, attendees_json, status, emailId
    ) VALUES (
      @id, @uid, @title, @description, @location, @startTime, @endTime, @isAllDay, @color, @accountId, @organizer_json, @attendees_json, @status, @emailId
    )
  `);

  for (const cal of initialCalendarEvents) {
    insertCal.run({
      id: cal.id,
      uid: cal.uid || null,
      title: cal.title,
      description: cal.description || null,
      location: cal.location || null,
      startTime: cal.startTime,
      endTime: cal.endTime,
      isAllDay: cal.isAllDay ? 1 : 0,
      color: cal.color,
      accountId: cal.accountId || null,
      organizer_json: cal.organizer ? JSON.stringify(cal.organizer) : null,
      attendees_json: cal.attendees ? JSON.stringify(cal.attendees) : null,
      status: cal.status || 'CONFIRMED',
      emailId: cal.emailId || null
    });
  }
}

// ----------------- ACCOUNTS -----------------
export function getAccounts(): Account[] {
  if (!isNativeSqlite) {
    return memStore.accounts.map(a => ({
      ...a,
      unreadCount: memStore.emails.filter(e => e.accountId === a.id && !e.isRead && e.folder === 'INBOX').length
    }));
  }

  const rows = db.prepare('SELECT * FROM accounts ORDER BY isDefault DESC, name ASC').all() as any[];
  return rows.map(r => {
    const unread = (db.prepare("SELECT COUNT(*) as c FROM emails WHERE accountId = ? AND isRead = 0 AND folder = 'INBOX'").get(r.id) as any)?.c || 0;
    return {
      ...r,
      isDefault: Boolean(r.isDefault),
      imapSecure: Boolean(r.imapSecure),
      smtpSecure: Boolean(r.smtpSecure),
      unreadCount: unread
    };
  });
}

export function getAccountById(id: string): Account | undefined {
  if (!isNativeSqlite) {
    return memStore.accounts.find(a => a.id === id);
  }
  const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
  if (!r) return undefined;
  return {
    ...r,
    isDefault: Boolean(r.isDefault),
    imapSecure: Boolean(r.imapSecure),
    smtpSecure: Boolean(r.smtpSecure)
  };
}

export function getAccountByEmail(email: string): Account | undefined {
  if (!isNativeSqlite) {
    return memStore.accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  }
  const r = db.prepare('SELECT * FROM accounts WHERE LOWER(email) = LOWER(?)').get(email) as any;
  if (!r) return undefined;
  return {
    ...r,
    isDefault: Boolean(r.isDefault),
    imapSecure: Boolean(r.imapSecure),
    smtpSecure: Boolean(r.smtpSecure)
  };
}

export function saveAccount(acc: Account): Account {
  const existing = getAccountById(acc.id) || getAccountByEmail(acc.email);
  if (existing) {
    return updateAccount(existing.id, acc) || acc;
  } else {
    return createAccount(acc);
  }
}

export function createAccount(acc: Account): Account {
  if (!isNativeSqlite) {
    if (acc.isDefault) {
      memStore.accounts.forEach(a => a.isDefault = false);
    }
    memStore.accounts.push(acc);
    saveJsonStore();
    return acc;
  }

  if (acc.isDefault) {
    db.prepare('UPDATE accounts SET isDefault = 0').run();
  }
  const stmt = db.prepare(`
    INSERT INTO accounts (
      id, name, email, provider, authType, oauthAccessToken, oauthRefreshToken, oauthExpiresAt, oauthClientId, oauthClientSecret,
      imapHost, imapPort, imapUser, imapPassword, imapSecure,
      smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, color, avatar, isDefault,
      signature, syncInterval, lastSyncedAt
    ) VALUES (
      @id, @name, @email, @provider, @authType, @oauthAccessToken, @oauthRefreshToken, @oauthExpiresAt, @oauthClientId, @oauthClientSecret,
      @imapHost, @imapPort, @imapUser, @imapPassword, @imapSecure,
      @smtpHost, @smtpPort, @smtpUser, @smtpPassword, @smtpSecure, @color, @avatar, @isDefault,
      @signature, @syncInterval, @lastSyncedAt
    )
  `);
  stmt.run({
    id: acc.id,
    name: acc.name,
    email: acc.email,
    provider: acc.provider,
    authType: acc.authType || 'password',
    oauthAccessToken: acc.oauthAccessToken || null,
    oauthRefreshToken: acc.oauthRefreshToken || null,
    oauthExpiresAt: acc.oauthExpiresAt || null,
    oauthClientId: acc.oauthClientId || null,
    oauthClientSecret: acc.oauthClientSecret || null,
    imapHost: acc.imapHost || null,
    imapPort: acc.imapPort || null,
    imapUser: acc.imapUser || null,
    imapPassword: acc.imapPassword || null,
    imapSecure: acc.imapSecure ? 1 : 0,
    smtpHost: acc.smtpHost || null,
    smtpPort: acc.smtpPort || null,
    smtpUser: acc.smtpUser || null,
    smtpPassword: acc.smtpPassword || null,
    smtpSecure: acc.smtpSecure ? 1 : 0,
    color: acc.color,
    avatar: acc.avatar || null,
    isDefault: acc.isDefault ? 1 : 0,
    signature: acc.signature || null,
    syncInterval: acc.syncInterval || 60,
    lastSyncedAt: acc.lastSyncedAt || new Date().toISOString()
  });
  return acc;
}

export function updateAccount(id: string, acc: Partial<Account>): Account | undefined {
  if (!isNativeSqlite) {
    const idx = memStore.accounts.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    if (acc.isDefault) {
      memStore.accounts.forEach(a => a.isDefault = false);
    }
    memStore.accounts[idx] = { ...memStore.accounts[idx], ...acc };
    saveJsonStore();
    return memStore.accounts[idx];
  }

  const existing = getAccountById(id);
  if (!existing) return undefined;

  if (acc.isDefault) {
    db.prepare('UPDATE accounts SET isDefault = 0').run();
  }

  const updated: Account = { ...existing, ...acc };
  const stmt = db.prepare(`
    UPDATE accounts SET
      name = @name,
      email = @email,
      provider = @provider,
      authType = @authType,
      oauthAccessToken = @oauthAccessToken,
      oauthRefreshToken = @oauthRefreshToken,
      oauthExpiresAt = @oauthExpiresAt,
      oauthClientId = @oauthClientId,
      oauthClientSecret = @oauthClientSecret,
      imapHost = @imapHost,
      imapPort = @imapPort,
      imapUser = @imapUser,
      imapPassword = @imapPassword,
      imapSecure = @imapSecure,
      smtpHost = @smtpHost,
      smtpPort = @smtpPort,
      smtpUser = @smtpUser,
      smtpPassword = @smtpPassword,
      smtpSecure = @smtpSecure,
      color = @color,
      avatar = @avatar,
      isDefault = @isDefault,
      signature = @signature,
      syncInterval = @syncInterval,
      lastSyncedAt = @lastSyncedAt
    WHERE id = @id
  `);

  stmt.run({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    provider: updated.provider,
    authType: updated.authType || 'password',
    oauthAccessToken: updated.oauthAccessToken || null,
    oauthRefreshToken: updated.oauthRefreshToken || null,
    oauthExpiresAt: updated.oauthExpiresAt || null,
    oauthClientId: updated.oauthClientId || null,
    oauthClientSecret: updated.oauthClientSecret || null,
    imapHost: updated.imapHost || null,
    imapPort: updated.imapPort || null,
    imapUser: updated.imapUser || null,
    imapPassword: updated.imapPassword || null,
    imapSecure: updated.imapSecure ? 1 : 0,
    smtpHost: updated.smtpHost || null,
    smtpPort: updated.smtpPort || null,
    smtpUser: updated.smtpUser || null,
    smtpPassword: updated.smtpPassword || null,
    smtpSecure: updated.smtpSecure ? 1 : 0,
    color: updated.color,
    avatar: updated.avatar || null,
    isDefault: updated.isDefault ? 1 : 0,
    signature: updated.signature || null,
    syncInterval: updated.syncInterval || 60,
    lastSyncedAt: updated.lastSyncedAt || null
  });

  return updated;
}

export function deleteAccount(id: string): boolean {
  if (!isNativeSqlite) {
    const prevLen = memStore.accounts.length;
    memStore.accounts = memStore.accounts.filter(a => a.id !== id);
    memStore.emails = memStore.emails.filter(e => e.accountId !== id);
    saveJsonStore();
    return memStore.accounts.length < prevLen;
  }
  db.prepare('DELETE FROM emails WHERE accountId = ?').run(id);
  const res = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return res.changes > 0;
}

// ----------------- EMAILS -----------------
function parseEmailRow(r: any): Email {
  const account = r.acc_name !== undefined ? {
    name: r.acc_name || 'Bilinmeyen',
    email: r.acc_email || '',
    color: r.acc_color || '#94a3b8'
  } : undefined;

  return {
    id: r.id,
    accountId: r.accountId,
    threadId: r.threadId,
    messageId: r.messageId,
    inReplyTo: r.inReplyTo,
    references: r.references_header || r.references,
    fromName: r.fromName,
    fromEmail: r.fromEmail,
    to: JSON.parse(r.to_json || '[]'),
    cc: JSON.parse(r.cc_json || '[]'),
    bcc: JSON.parse(r.bcc_json || '[]'),
    replyTo: r.replyTo_json ? JSON.parse(r.replyTo_json) : undefined,
    subject: r.subject,
    bodyText: r.bodyText,
    bodyHtml: r.bodyHtml,
    snippet: r.snippet,
    date: r.date,
    isRead: Boolean(r.isRead),
    isStarred: Boolean(r.isStarred),
    isArchived: Boolean(r.isArchived),
    isDeleted: Boolean(r.isDeleted),
    isDraft: Boolean(r.isDraft),
    isSpam: Boolean(r.isSpam),
    folder: r.folder,
    labels: JSON.parse(r.labels_json || '[]'),
    priority: r.priority,
    attachments: JSON.parse(r.attachments_json || '[]'),
    meetingInvite: r.meetingInvite_json ? JSON.parse(r.meetingInvite_json) : null,
    aiSummary: r.aiSummary,
    aiSmartReplies: r.aiSmartReplies_json ? JSON.parse(r.aiSmartReplies_json) : null,
    aiCategory: r.aiCategory,
    account: account || { name: 'Bilinmeyen', email: '', color: '#94a3b8' }
  };
}

export function getEmails(params: {
  accountId?: string;
  folder?: string;
  isStarred?: boolean;
  isUnread?: boolean;
  label?: string;
  search?: string;
}): Email[] {
  if (!isNativeSqlite) {
    return memStore.emails.filter(e => {
      if (params.accountId && params.accountId !== 'all' && e.accountId !== params.accountId) return false;
      if (params.folder === 'TRASH') {
        if (e.folder !== 'TRASH' && !e.isDeleted) return false;
      } else if (params.folder === 'STARRED') {
        if (!e.isStarred || e.isDeleted) return false;
      } else if (params.folder) {
        if (e.folder !== params.folder || e.isDeleted) return false;
      } else {
        if (e.isDeleted) return false;
      }
      if (params.isStarred !== undefined && e.isStarred !== params.isStarred) return false;
      if (params.isUnread !== undefined && e.isRead) return false;
      if (params.label && (!e.labels || !e.labels.includes(params.label))) return false;
      if (params.search && params.search.trim()) {
        const s = params.search.trim().toLowerCase();
        const inSub = e.subject.toLowerCase().includes(s);
        const inSender = e.fromName.toLowerCase().includes(s) || e.fromEmail.toLowerCase().includes(s);
        const inText = (e.bodyText || '').toLowerCase().includes(s);
        if (!inSub && !inSender && !inText) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => {
      const acc = memStore.accounts.find(a => a.id === e.accountId);
      return {
        ...e,
        account: acc ? { name: acc.name, email: acc.email, color: acc.color } : undefined
      };
    });
  }

  let query = `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    LEFT JOIN accounts ON emails.accountId = accounts.id
    WHERE 1=1
  `;
  const conditions: any[] = [];

  if (params.accountId && params.accountId !== 'all') {
    query += ' AND emails.accountId = ?';
    conditions.push(params.accountId);
  }

  if (params.folder) {
    if (params.folder === 'TRASH') {
      query += " AND (emails.folder = 'TRASH' OR emails.isDeleted = 1)";
    } else if (params.folder === 'STARRED') {
      query += " AND emails.isStarred = 1 AND emails.isDeleted = 0";
    } else {
      query += " AND emails.folder = ? AND emails.isDeleted = 0";
      conditions.push(params.folder);
    }
  } else {
    query += " AND emails.isDeleted = 0";
  }

  if (params.isStarred !== undefined) {
    query += ' AND emails.isStarred = ?';
    conditions.push(params.isStarred ? 1 : 0);
  }

  if (params.isUnread !== undefined) {
    query += ' AND emails.isRead = 0';
  }

  if (params.label) {
    query += ' AND emails.labels_json LIKE ?';
    conditions.push(`%"${params.label}"%`);
  }

  if (params.search && params.search.trim()) {
    const s = `%${params.search.trim()}%`;
    query += ' AND (emails.subject LIKE ? OR emails.fromName LIKE ? OR emails.fromEmail LIKE ? OR emails.snippet LIKE ? OR emails.bodyText LIKE ?)';
    conditions.push(s, s, s, s, s);
  }

  query += ' ORDER BY emails.date DESC LIMIT 1000';

  const rows = db.prepare(query).all(...conditions) as any[];
  return rows.map(parseEmailRow);
}

export function getEmailById(id: string): Email | undefined {
  const rawId = decodeURIComponent(id);
  if (!isNativeSqlite) {
    const found = memStore.emails.find(e => e.id === id || e.id === rawId || decodeURIComponent(e.id) === rawId || (e.messageId && (e.messageId === id || e.messageId === rawId)));
    if (!found) return undefined;
    const acc = memStore.accounts.find(a => a.id === found.accountId);
    return {
      ...found,
      account: acc ? { name: acc.name, email: acc.email, color: acc.color } : undefined
    };
  }
  const query = `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    LEFT JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.id = ? OR emails.id = ? OR emails.messageId = ?
    LIMIT 1
  `;
  const row = db.prepare(query).get(id, rawId, id);
  if (!row) return undefined;
  return parseEmailRow(row);
}

export function getEmailByMessageId(messageId: string): Email | undefined {
  if (!messageId) return undefined;
  const cleanMid = messageId.replace(/[<>]/g, '').trim();
  if (!cleanMid) return undefined;

  if (!isNativeSqlite) {
    const found = memStore.emails.find(e => {
      if (!e.messageId) return false;
      const m = e.messageId.replace(/[<>]/g, '').trim();
      return m === cleanMid || e.messageId === messageId;
    });
    if (!found) return undefined;
    const acc = memStore.accounts.find(a => a.id === found.accountId);
    return {
      ...found,
      account: acc ? { name: acc.name, email: acc.email, color: acc.color } : undefined
    };
  }

  const query = `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    LEFT JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.messageId = ? OR emails.messageId = ? OR emails.messageId = ?
    LIMIT 1
  `;
  const row = db.prepare(query).get(messageId, cleanMid, `<${cleanMid}>`);
  if (!row) return undefined;
  return parseEmailRow(row);
}

export function getEmailThread(threadId: string): Email[] {
  if (!isNativeSqlite) {
    return memStore.emails
      .filter(e => e.threadId === threadId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(e => {
        const acc = memStore.accounts.find(a => a.id === e.accountId);
        return {
          ...e,
          account: acc ? { name: acc.name, email: acc.email, color: acc.color } : undefined
        };
      });
  }

  const query = `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    LEFT JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.threadId = ?
    ORDER BY emails.date ASC
  `;
  const rows = db.prepare(query).all(threadId) as any[];
  return rows.map(parseEmailRow);
}

// Persistent deleted message tracking (both ID and RFC Message-ID)
export function markDeletedLocally(item: string | { id: string; accountId?: string; messageId?: string; imapUid?: number; mailboxPath?: string }) {
  const id = typeof item === 'string' ? item : item.id;
  if (!id || id.trim().length < 3) return;
  const rawId = decodeURIComponent(id);
  const messageId = typeof item === 'string' ? null : (item.messageId || null);
  const cleanMid = messageId ? messageId.replace(/[<>]/g, '').trim() : null;
  const accountId = typeof item === 'string' ? null : (item.accountId || null);
  const imapUid = typeof item === 'string' ? null : (item.imapUid || null);
  const mailboxPath = typeof item === 'string' ? null : (item.mailboxPath || null);
  const deletedAt = new Date().toISOString();

  if (!isNativeSqlite) {
    if (!memStore.deletedRecords) memStore.deletedRecords = [];
    if (!memStore.deletedRecords.some(r => r.id === id || r.id === rawId || (cleanMid && r.messageId && r.messageId.replace(/[<>]/g, '') === cleanMid))) {
      memStore.deletedRecords.push({ id, messageId: messageId || undefined, accountId: accountId || undefined, imapUid: imapUid || undefined, mailboxPath: mailboxPath || undefined, deletedAt });
      saveJsonStore();
    }
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO deleted_records (id, accountId, messageId, imapUid, mailboxPath, deletedAt)
      VALUES (@id, @accountId, @messageId, @imapUid, @mailboxPath, @deletedAt)
    `);
    stmt.run({ id, accountId, messageId, imapUid, mailboxPath, deletedAt });
    if (cleanMid && cleanMid !== messageId && cleanMid.length > 3) {
      stmt.run({ id: cleanMid, accountId, messageId: cleanMid, imapUid, mailboxPath, deletedAt });
    }
  } catch (err) {
    console.warn('Failed to insert into deleted_records:', err);
  }
}

export function isDeletedLocally(
  identifier?: string,
  messageId?: string,
  accountId?: string,
  imapUid?: number,
  mailboxPath?: string
): boolean {
  // Check by ID
  if (identifier && identifier.trim().length >= 3) {
    const cleanId = identifier.replace(/[<>]/g, '').trim();
    if (!isNativeSqlite) {
      if ((memStore.deletedRecords || []).some(r => r.id === identifier || r.id === cleanId || decodeURIComponent(r.id) === cleanId)) {
        return true;
      }
    } else {
      try {
        const row = db.prepare('SELECT 1 FROM deleted_records WHERE id = ? OR id = ?').get(identifier, cleanId);
        if (row) return true;
      } catch {}
    }
  }

  // Check by RFC Message-ID
  if (messageId && messageId.trim().length >= 4) {
    const cleanMid = messageId.replace(/[<>]/g, '').trim();
    if (!isNativeSqlite) {
      if ((memStore.deletedRecords || []).some(r => r.messageId && (r.messageId === messageId || r.messageId.replace(/[<>]/g, '').trim() === cleanMid))) {
        return true;
      }
    } else {
      try {
        const row = db.prepare('SELECT 1 FROM deleted_records WHERE messageId = ? OR messageId = ? OR messageId = ?').get(messageId, cleanMid, `<${cleanMid}>`);
        if (row) return true;
      } catch {}
    }
  }

  // Check by accountId + imapUid
  if (accountId && imapUid) {
    if (!isNativeSqlite) {
      if ((memStore.deletedRecords || []).some(r => r.accountId === accountId && r.imapUid === imapUid && (!mailboxPath || !r.mailboxPath || r.mailboxPath === mailboxPath))) {
        return true;
      }
    } else {
      try {
        const row = db.prepare('SELECT 1 FROM deleted_records WHERE accountId = ? AND imapUid = ?').get(accountId, imapUid);
        if (row) return true;
      } catch {}
    }
  }

  return false;
}

export function pruneMissingServerUids(
  accountId: string,
  mailboxPath: string,
  validUids: number[],
  minUid: number,
  targetFolder?: string
): number {
  const validSet = new Set(validUids);
  let deletedCount = 0;
  const isTrashMailbox = (targetFolder === 'TRASH' || mailboxPath.toLowerCase().includes('trash') || mailboxPath.toLowerCase().includes('çöp'));

  if (!isNativeSqlite) {
    const removedIds: string[] = [];
    for (const e of memStore.emails) {
      if (e.accountId === accountId) {
        if (isTrashMailbox && (e.folder === 'TRASH' || e.isDeleted)) {
          if (validUids.length === 0) {
            removedIds.push(e.id);
          } else if (!e.imapUid || !validSet.has(e.imapUid)) {
            removedIds.push(e.id);
          }
        } else if (
          (e.mailboxPath === mailboxPath || (!e.mailboxPath && mailboxPath.toUpperCase() === 'INBOX')) &&
          (targetFolder ? e.folder === targetFolder : true)
        ) {
          if (validUids.length === 0) {
            removedIds.push(e.id);
          } else if (e.imapUid && e.imapUid >= minUid && !validSet.has(e.imapUid)) {
            removedIds.push(e.id);
          }
        }
      }
    }
    if (removedIds.length > 0) {
      const remSet = new Set(removedIds);
      memStore.emails = memStore.emails.filter(e => !remSet.has(e.id));
      saveJsonStore();
      deletedCount = removedIds.length;
    }
    return deletedCount;
  }

  try {
    let idsToDelete: string[] = [];
    if (isTrashMailbox) {
      if (validUids.length === 0) {
        const rows = db.prepare(`SELECT id FROM emails WHERE accountId = ? AND (folder = 'TRASH' OR isDeleted = 1)`).all(accountId) as any[];
        idsToDelete = rows.map(r => r.id);
      } else {
        const rows = db.prepare(`SELECT id, imapUid FROM emails WHERE accountId = ? AND (folder = 'TRASH' OR isDeleted = 1)`).all(accountId) as any[];
        for (const row of rows) {
          if (!row.imapUid || !validSet.has(row.imapUid)) {
            idsToDelete.push(row.id);
          }
        }
      }
    } else {
      if (validUids.length === 0) {
        const rows = db.prepare(`SELECT id FROM emails WHERE accountId = ? AND (mailboxPath = ? OR (mailboxPath IS NULL AND UPPER(?) = 'INBOX'))`).all(accountId, mailboxPath, mailboxPath) as any[];
        idsToDelete = rows.map(r => r.id);
      } else {
        const rows = db.prepare(`
          SELECT id, imapUid FROM emails 
          WHERE accountId = ? AND (mailboxPath = ? OR (mailboxPath IS NULL AND UPPER(?) = 'INBOX')) AND imapUid >= ?
        `).all(accountId, mailboxPath, mailboxPath, minUid) as any[];
        for (const row of rows) {
          if (row.imapUid && !validSet.has(row.imapUid)) {
            idsToDelete.push(row.id);
          }
        }
      }
    }

    if (idsToDelete.length > 0) {
      const deleteStmt = db.prepare(`DELETE FROM emails WHERE id = ?`);
      const trans = db.transaction((ids: string[]) => {
        for (const id of ids) {
          deleteStmt.run(id);
        }
      });
      trans(idsToDelete);
      deletedCount = idsToDelete.length;
    }
  } catch (err) {
    console.warn('Failed to prune missing server UIDs:', err);
  }
  return deletedCount;
}

export function saveEmail(email: Email, isFromImapSync = false): Email {
  // Reject completely blank/phantom emails
  const isBlank = (!email.fromEmail || email.fromEmail === 'unknown@example.com') &&
    (!email.fromName || email.fromName === 'Bilinmeyen Gönderici') &&
    (!email.subject || email.subject === '(Konusuz)' || email.subject.trim() === '') &&
    !email.bodyText?.trim() && !email.bodyHtml?.trim();
  if (isBlank) {
    return email;
  }

  // If coming from IMAP synchronization, respect local user actions (deletions, trash, archive, spam)
  if (isFromImapSync) {
    if (email.folder !== 'TRASH' && !email.isDeleted && isDeletedLocally(email.id, email.messageId, email.accountId, email.imapUid, email.mailboxPath)) {
      return email;
    }
    const existing = getEmailById(email.id) || (email.messageId ? getEmailByMessageId(email.messageId) : undefined);
    if (existing) {
      if (existing.folder === 'TRASH' || existing.isDeleted) {
        return existing; // Strictly prevent resurrecting deleted emails
      } else if (existing.folder === 'ARCHIVE' || existing.isArchived) {
        email.folder = 'ARCHIVE';
        email.isArchived = true;
      } else if (existing.folder === 'SPAM' || existing.isSpam) {
        email.folder = 'SPAM';
        email.isSpam = true;
      }
    }
  }

  if (!isNativeSqlite) {
    const idx = memStore.emails.findIndex(e => e.id === email.id || (email.messageId && e.messageId === email.messageId));
    if (idx !== -1) {
      memStore.emails[idx] = { ...memStore.emails[idx], ...email };
    } else {
      memStore.emails.unshift(email);
    }
    saveJsonStore();
    return email;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO emails (
      id, accountId, threadId, messageId, inReplyTo, references_header,
      fromName, fromEmail, to_json, cc_json, bcc_json, replyTo_json,
      subject, bodyText, bodyHtml, snippet, date, isRead, isStarred,
      isArchived, isDeleted, isDraft, isSpam, folder, labels_json,
      priority, attachments_json, meetingInvite_json, aiSummary,
      aiSmartReplies_json, aiCategory
    ) VALUES (
      @id, @accountId, @threadId, @messageId, @inReplyTo, @references_header,
      @fromName, @fromEmail, @to_json, @cc_json, @bcc_json, @replyTo_json,
      @subject, @bodyText, @bodyHtml, @snippet, @date, @isRead, @isStarred,
      @isArchived, @isDeleted, @isDraft, @isSpam, @folder, @labels_json,
      @priority, @attachments_json, @meetingInvite_json, @aiSummary,
      @aiSmartReplies_json, @aiCategory
    )
  `);

  stmt.run({
    id: email.id,
    accountId: email.accountId,
    threadId: email.threadId,
    messageId: email.messageId || null,
    inReplyTo: email.inReplyTo || null,
    references_header: email.references || null,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    to_json: JSON.stringify(email.to || []),
    cc_json: JSON.stringify(email.cc || []),
    bcc_json: JSON.stringify(email.bcc || []),
    replyTo_json: email.replyTo ? JSON.stringify(email.replyTo) : null,
    subject: email.subject,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    snippet: email.snippet,
    date: email.date,
    isRead: email.isRead ? 1 : 0,
    isStarred: email.isStarred ? 1 : 0,
    isArchived: email.isArchived ? 1 : 0,
    isDeleted: email.isDeleted ? 1 : 0,
    isDraft: email.isDraft ? 1 : 0,
    isSpam: email.isSpam ? 1 : 0,
    folder: email.folder,
    labels_json: JSON.stringify(email.labels || []),
    priority: email.priority || 'normal',
    attachments_json: JSON.stringify(email.attachments || []),
    meetingInvite_json: email.meetingInvite ? JSON.stringify(email.meetingInvite) : null,
    aiSummary: email.aiSummary || null,
    aiSmartReplies_json: email.aiSmartReplies ? JSON.stringify(email.aiSmartReplies) : null,
    aiCategory: email.aiCategory || null
  });

  return getEmailById(email.id)!;
}

export function updateEmailFlags(id: string, updates: Partial<{
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isSpam: boolean;
  folder: string;
  labels: string[];
  mailboxPath?: string;
  imapUid?: number;
}>): Email | undefined {
  // Normalize folder and isDeleted flags
  if (updates.folder === 'TRASH' || updates.isDeleted === true) {
    updates.folder = 'TRASH';
    updates.isDeleted = true;
  } else if (updates.folder && updates.folder !== 'TRASH' && updates.isDeleted === undefined) {
    updates.isDeleted = false;
  }

  const rawId = decodeURIComponent(id);

  if (!isNativeSqlite) {
    const idx = memStore.emails.findIndex(e => e.id === id || e.id === rawId || decodeURIComponent(e.id) === rawId || (e.messageId && (e.messageId === id || e.messageId === rawId)));
    if (idx === -1) return undefined;
    memStore.emails[idx] = { ...memStore.emails[idx], ...updates };
    if (updates.isDeleted || updates.folder === 'TRASH') {
      const e = memStore.emails[idx];
      markDeletedLocally({ id: e.id, messageId: e.messageId, accountId: e.accountId, imapUid: e.imapUid, mailboxPath: e.mailboxPath });
    }
    saveJsonStore();
    return memStore.emails[idx];
  }

  let current = getEmailById(id) || getEmailById(rawId);
  if (!current) return undefined;

  const targetId = current.id;
  if (updates.isDeleted || updates.folder === 'TRASH') {
    markDeletedLocally({ id: current.id, messageId: current.messageId, accountId: current.accountId, imapUid: current.imapUid, mailboxPath: current.mailboxPath });
  }

  const sets: string[] = [];
  const params: any = { id: targetId };

  if (updates.isRead !== undefined) {
    sets.push('isRead = @isRead');
    params.isRead = updates.isRead ? 1 : 0;
  }
  if (updates.isStarred !== undefined) {
    sets.push('isStarred = @isStarred');
    params.isStarred = updates.isStarred ? 1 : 0;
  }
  if (updates.isArchived !== undefined) {
    sets.push('isArchived = @isArchived');
    params.isArchived = updates.isArchived ? 1 : 0;
  }
  if (updates.isDeleted !== undefined) {
    sets.push('isDeleted = @isDeleted');
    params.isDeleted = updates.isDeleted ? 1 : 0;
  }
  if (updates.isSpam !== undefined) {
    sets.push('isSpam = @isSpam');
    params.isSpam = updates.isSpam ? 1 : 0;
  }
  if (updates.folder !== undefined) {
    sets.push('folder = @folder');
    params.folder = updates.folder;
  }
  if (updates.labels !== undefined) {
    sets.push('labels_json = @labels_json');
    params.labels_json = JSON.stringify(updates.labels);
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE emails SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  return getEmailById(targetId);
}

export function deleteEmailPermanent(id: string): boolean {
  const rawId = decodeURIComponent(id);
  const email = getEmailById(id) || getEmailById(rawId);
  if (email) {
    markDeletedLocally({ id: email.id, messageId: email.messageId, accountId: email.accountId, imapUid: email.imapUid, mailboxPath: email.mailboxPath });
  } else {
    markDeletedLocally(id);
  }

  if (!isNativeSqlite) {
    const prevLen = memStore.emails.length;
    memStore.emails = memStore.emails.filter(e => e.id !== id && e.id !== rawId && decodeURIComponent(e.id) !== rawId && (!e.messageId || (e.messageId !== id && e.messageId !== rawId)));
    saveJsonStore();
    return memStore.emails.length < prevLen;
  }
  const targetId = email ? email.id : id;
  const res = db.prepare('DELETE FROM emails WHERE id = ? OR id = ?').run(targetId, rawId);
  return res.changes > 0;
}

// Discovered Server Folders Registry
export interface ServerFolderRecord {
  id: string;
  accountId: string;
  path: string;
  name: string;
  folderKey: string;
  delimiter?: string;
  specialUse?: string;
}

const serverFoldersMap = new Map<string, ServerFolderRecord>();

export function registerServerFolder(record: ServerFolderRecord) {
  const key = `${record.accountId}:::${record.path}`;
  serverFoldersMap.set(key, record);
}

export function getServerFolders(accountId?: string): ServerFolderRecord[] {
  const all = Array.from(serverFoldersMap.values());
  if (accountId && accountId !== 'all') {
    return all.filter(f => f.accountId === accountId);
  }
  return all;
}

export function bulkUpdateEmailFlags(ids: string[], updates: Partial<{
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isSpam: boolean;
  folder: string;
  labels: string[];
}>): number {
  let count = 0;
  for (const id of ids) {
    if (updateEmailFlags(id, updates)) count++;
  }
  return count;
}

export function bulkDeleteEmails(ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    if (deleteEmailPermanent(id)) count++;
  }
  return count;
}

export function emptyTrash(accountId?: string): number {
  if (!isNativeSqlite) {
    const toDelete = memStore.emails.filter(e => {
      if (accountId && accountId !== 'all' && e.accountId !== accountId) return false;
      return e.folder === 'TRASH' || e.isDeleted;
    });
    for (const e of toDelete) {
      markDeletedLocally({ id: e.id, messageId: e.messageId, accountId: e.accountId, imapUid: e.imapUid, mailboxPath: e.mailboxPath });
    }
    memStore.emails = memStore.emails.filter(e => !toDelete.some(d => d.id === e.id));
    saveJsonStore();
    return toDelete.length;
  }

  let selectQuery = "SELECT id, accountId, messageId, imapUid, mailboxPath FROM emails WHERE folder = 'TRASH' OR isDeleted = 1";
  const params: any[] = [];
  if (accountId && accountId !== 'all') {
    selectQuery += ' AND accountId = ?';
    params.push(accountId);
  }
  const rows = db.prepare(selectQuery).all(...params) as any[];
  for (const r of rows) {
    markDeletedLocally({ id: r.id, messageId: r.messageId, accountId: r.accountId, imapUid: r.imapUid, mailboxPath: r.mailboxPath });
  }

  let deleteQuery = "DELETE FROM emails WHERE folder = 'TRASH' OR isDeleted = 1";
  const delParams: any[] = [];
  if (accountId && accountId !== 'all') {
    deleteQuery += ' AND accountId = ?';
    delParams.push(accountId);
  }
  const res = db.prepare(deleteQuery).run(...delParams);
  return res.changes;
}

export function getFolderStats(accountId?: string): FolderStat[] {
  const baseFolders = [
    { folder: 'INBOX', displayName: 'Gelen Kutusu', icon: 'Inbox' },
    { folder: 'STARRED', displayName: 'Yıldızlı', icon: 'Star' },
    { folder: 'SENT', displayName: 'Gönderilenler', icon: 'Send' },
    { folder: 'DRAFTS', displayName: 'Taslaklar', icon: 'FileEdit' },
    { folder: 'ARCHIVE', displayName: 'Arşiv', icon: 'Archive' },
    { folder: 'SPAM', displayName: 'İstenmeyen', icon: 'AlertOctagon' },
    { folder: 'TRASH', displayName: 'Çöp Kutusu', icon: 'Trash2' },
  ];

  // Get all discovered server custom folders
  const registeredCustomFolders = getServerFolders(accountId);
  const discoveredNames = new Set(registeredCustomFolders.map(rf => rf.folderKey));

  if (!isNativeSqlite) {
    // Find all custom folders in memory
    const memoryCustomFolders = Array.from(new Set(
      memStore.emails
        .map(e => e.folder)
        .filter(f => !baseFolders.some(b => b.folder === f))
    ));

    const combinedCustomFolders = Array.from(new Set([...discoveredNames, ...memoryCustomFolders]));

    const allFolders = [
      ...baseFolders,
      ...combinedCustomFolders.map(cf => ({ folder: cf, displayName: cf, icon: 'Folder' }))
    ];

    return allFolders.map(f => {
      const filtered = memStore.emails.filter(e => {
        if (accountId && accountId !== 'all' && e.accountId !== accountId) return false;
        if (f.folder === 'STARRED') return e.isStarred && !e.isDeleted;
        if (f.folder === 'TRASH') return e.folder === 'TRASH' || e.isDeleted;
        return e.folder === f.folder && !e.isDeleted;
      });

      const unreadCount = filtered.filter(e => !e.isRead).length;

      return {
        folder: f.folder,
        displayName: f.displayName,
        icon: f.icon,
        count: filtered.length,
        unreadCount
      };
    });
  }

  // Fast single aggregated query in SQLite
  const statsQuery = `
    SELECT 
      folder,
      COUNT(*) as totalCount,
      SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) as unreadCount
    FROM emails
    ${accountId && accountId !== 'all' ? 'WHERE accountId = ?' : ''}
    GROUP BY folder
  `;
  const statsParams = accountId && accountId !== 'all' ? [accountId] : [];
  const statsRows = db.prepare(statsQuery).all(...statsParams) as any[];
  const statsMap = new Map<string, { count: number; unreadCount: number }>();
  for (const r of statsRows) {
    statsMap.set(r.folder, { count: Number(r.totalCount) || 0, unreadCount: Number(r.unreadCount) || 0 });
  }

  // Starred stats
  const starredQuery = `
    SELECT 
      COUNT(*) as totalCount,
      SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) as unreadCount
    FROM emails
    WHERE isStarred = 1 ${accountId && accountId !== 'all' ? 'AND accountId = ?' : ''}
  `;
  const starredRow = db.prepare(starredQuery).get(...statsParams) as any;
  statsMap.set('STARRED', { count: Number(starredRow?.totalCount) || 0, unreadCount: Number(starredRow?.unreadCount) || 0 });

  const dbCustomFolders = Array.from(statsMap.keys()).filter(f => !baseFolders.some(b => b.folder === f) && f !== 'STARRED');
  const combinedCustomFolders = Array.from(new Set([...discoveredNames, ...dbCustomFolders]));

  const allFolders = [
    ...baseFolders,
    ...combinedCustomFolders.map(cf => ({ folder: cf, displayName: cf, icon: 'Folder' }))
  ];

  return allFolders.map(f => {
    const s = statsMap.get(f.folder) || { count: 0, unreadCount: 0 };
    return {
      folder: f.folder,
      displayName: f.displayName,
      icon: f.icon,
      count: s.count,
      unreadCount: s.unreadCount
    };
  });
}

// ----------------- CONTACTS -----------------
export function getContacts(): Contact[] {
  if (!isNativeSqlite) {
    return memStore.contacts;
  }
  const rows = db.prepare('SELECT * FROM contacts ORDER BY isStarred DESC, name ASC').all() as any[];
  return rows.map(r => ({
    ...r,
    isStarred: Boolean(r.isStarred)
  }));
}

export function createContact(c: Contact): Contact {
  if (!isNativeSqlite) {
    const idx = memStore.contacts.findIndex(x => x.id === c.id);
    if (idx !== -1) memStore.contacts[idx] = c;
    else memStore.contacts.push(c);
    saveJsonStore();
    return c;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contacts (id, name, email, avatar, company, role, phone, notes, isStarred, lastContactedAt)
    VALUES (@id, @name, @email, @avatar, @company, @role, @phone, @notes, @isStarred, @lastContactedAt)
  `);
  stmt.run({
    id: c.id,
    name: c.name,
    email: c.email,
    avatar: c.avatar || null,
    company: c.company || null,
    role: c.role || null,
    phone: c.phone || null,
    notes: c.notes || null,
    isStarred: c.isStarred ? 1 : 0,
    lastContactedAt: c.lastContactedAt || null
  });
  return c;
}

export function updateContact(id: string, updates: Partial<Contact>): Contact | undefined {
  if (!isNativeSqlite) {
    const idx = memStore.contacts.findIndex(x => x.id === id);
    if (idx === -1) return undefined;
    memStore.contacts[idx] = { ...memStore.contacts[idx], ...updates };
    saveJsonStore();
    return memStore.contacts[idx];
  }

  const current = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as any;
  if (!current) return undefined;
  const merged = { ...current, ...updates, isStarred: updates.isStarred !== undefined ? (updates.isStarred ? 1 : 0) : current.isStarred };
  db.prepare(`
    UPDATE contacts SET
      name = @name, email = @email, avatar = @avatar, company = @company, role = @role,
      phone = @phone, notes = @notes, isStarred = @isStarred, lastContactedAt = @lastContactedAt
    WHERE id = @id
  `).run({
    id: merged.id,
    name: merged.name,
    email: merged.email,
    avatar: merged.avatar || null,
    company: merged.company || null,
    role: merged.role || null,
    phone: merged.phone || null,
    notes: merged.notes || null,
    isStarred: merged.isStarred ? 1 : 0,
    lastContactedAt: merged.lastContactedAt || null
  });
  return { ...merged, isStarred: Boolean(merged.isStarred) };
}

export function deleteContact(id: string): boolean {
  if (!isNativeSqlite) {
    const prevLen = memStore.contacts.length;
    memStore.contacts = memStore.contacts.filter(x => x.id !== id);
    saveJsonStore();
    return memStore.contacts.length < prevLen;
  }
  const res = db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  return res.changes > 0;
}

// ----------------- CALENDAR EVENTS -----------------
export function getCalendarEvents(): CalendarEvent[] {
  if (!isNativeSqlite) {
    return memStore.calendar_events;
  }
  const rows = db.prepare('SELECT * FROM calendar_events ORDER BY startTime ASC').all() as any[];
  return rows.map(r => ({
    ...r,
    isAllDay: Boolean(r.isAllDay),
    organizer: r.organizer_json ? JSON.parse(r.organizer_json) : undefined,
    attendees: r.attendees_json ? JSON.parse(r.attendees_json) : undefined
  }));
}

export function createCalendarEvent(event: CalendarEvent): CalendarEvent {
  if (!isNativeSqlite) {
    const idx = memStore.calendar_events.findIndex(x => x.id === event.id);
    if (idx !== -1) memStore.calendar_events[idx] = event;
    else memStore.calendar_events.push(event);
    saveJsonStore();
    return event;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO calendar_events (
      id, uid, title, description, location, startTime, endTime, isAllDay, color, accountId, organizer_json, attendees_json, status, emailId
    ) VALUES (
      @id, @uid, @title, @description, @location, @startTime, @endTime, @isAllDay, @color, @accountId, @organizer_json, @attendees_json, @status, @emailId
    )
  `);
  stmt.run({
    id: event.id,
    uid: event.uid || null,
    title: event.title,
    description: event.description || null,
    location: event.location || null,
    startTime: event.startTime,
    endTime: event.endTime,
    isAllDay: event.isAllDay ? 1 : 0,
    color: event.color || '#3b82f6',
    accountId: event.accountId || null,
    organizer_json: event.organizer ? JSON.stringify(event.organizer) : null,
    attendees_json: event.attendees ? JSON.stringify(event.attendees) : null,
    status: event.status || 'CONFIRMED',
    emailId: event.emailId || null
  });
  return event;
}

export function updateCalendarEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | undefined {
  if (!isNativeSqlite) {
    const idx = memStore.calendar_events.findIndex(x => x.id === id);
    if (idx === -1) return undefined;
    memStore.calendar_events[idx] = { ...memStore.calendar_events[idx], ...updates };
    saveJsonStore();
    return memStore.calendar_events[idx];
  }

  const current = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as any;
  if (!current) return undefined;
  const merged = { ...current, ...updates };
  db.prepare(`
    UPDATE calendar_events SET
      title = @title, description = @description, location = @location,
      startTime = @startTime, endTime = @endTime, isAllDay = @isAllDay,
      color = @color, status = @status
    WHERE id = @id
  `).run({
    id: merged.id,
    title: merged.title,
    description: merged.description || null,
    location: merged.location || null,
    startTime: merged.startTime,
    endTime: merged.endTime,
    isAllDay: merged.isAllDay ? 1 : 0,
    color: merged.color || '#3b82f6',
    status: merged.status || 'CONFIRMED'
  });
  return merged;
}

export function deleteCalendarEvent(id: string): boolean {
  if (!isNativeSqlite) {
    const prevLen = memStore.calendar_events.length;
    memStore.calendar_events = memStore.calendar_events.filter(x => x.id !== id);
    saveJsonStore();
    return memStore.calendar_events.length < prevLen;
  }
  const res = db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  return res.changes > 0;
}
