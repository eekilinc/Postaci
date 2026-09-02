import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { Account, Email, Contact, CalendarEvent, FolderStat, Attachment } from '../types.js';
import { initialAccounts, initialContacts, initialEmails, initialCalendarEvents } from './demoData.js';

let nativeRequire: NodeRequire;
try {
  nativeRequire = typeof require === 'function' ? require : createRequire(typeof __filename !== 'undefined' ? __filename : (typeof import.meta !== 'undefined' && (import.meta as any)?.url ? (import.meta as any).url : `file://${process.cwd()}/index.js`));
} catch {
  nativeRequire = createRequire(`file://${process.cwd()}/index.js`);
}

import { dataDir } from './storagePaths.js';
import { encodeAccount, decodeAccount, encryptSecret, atomicWrite, CredentialError } from './secrets.js';
export { dataDir };
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {}
}

export const dbPath = path.join(dataDir, 'postaci.db');
export const jsonDbPath = path.join(dataDir, 'postaci_store.json');
export const accountsJsonPath = path.join(dataDir, 'accounts.json');

export function loadAccountsBackup(): Account[] {
  if (fs.existsSync(accountsJsonPath)) {
    try {
      const data = fs.readFileSync(accountsJsonPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) throw new Error('Hesap yedeği bir dizi olmalı.');
      if (parsed.length > 0) {
        return parsed.map(decodeAccount);
      }
    } catch (e) {
      if (e instanceof CredentialError) throw e;
      throw new Error('Hesap yedeği okunamadı; dosya değiştirilmedi.', { cause: e });
    }
  }
  return [];
}

export function saveAccountsBackup(accounts: Account[]) {
  if (!Array.isArray(accounts) || restoring) return;
  atomicWrite(accountsJsonPath, JSON.stringify(accounts.map(encodeAccount), null, 2));
}

let restoring = false;
const serverFoldersMap = new Map<string, ServerFolderRecord>();
let isNativeSqlite = false;
let db: any = null;

// In-Memory / File-based Store fallback if better-sqlite3 native addon fails to load
interface MemoryStore {
  accounts: Account[];
  emails: Email[];
  contacts: Contact[];
  calendar_events: CalendarEvent[];
  serverFolders?: ServerFolderRecord[];
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
  let loaded = false;
  if (fs.existsSync(jsonDbPath)) {
    try {
      const content = fs.readFileSync(jsonDbPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Geçersiz veri dosyası.');
      for (const field of ['accounts', 'emails', 'contacts', 'calendar_events']) {
        if (parsed[field] !== undefined && !Array.isArray(parsed[field])) throw new Error('Geçersiz veri alanı: ' + field);
      }
      if (parsed && typeof parsed === 'object') {
        memStore = {
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map(decodeAccount) : [],
          emails: Array.isArray(parsed.emails) ? parsed.emails : [],
          contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
          calendar_events: Array.isArray(parsed.calendar_events) ? parsed.calendar_events : [],
          serverFolders: Array.isArray(parsed.serverFolders) ? parsed.serverFolders : [],
          deletedRecords: Array.isArray(parsed.deletedRecords) ? parsed.deletedRecords : []
        };
        loaded = true;
      }
    } catch (err) {
      if (err instanceof CredentialError) throw err;
      throw new Error('JSON veri dosyası okunamadı; dosya değiştirilmedi.', { cause: err });
    }
  }

  // Double redundancy: If memStore accounts is empty, load from accounts.json!
  const backedUp = loadAccountsBackup();
  if (memStore.accounts.length === 0 && backedUp.length > 0) {
    memStore.accounts = backedUp;
    loaded = true;
  }

  if (!loaded && memStore.accounts.length === 0) {
    memStore = {
      accounts: process.env.POSTACI_SEED_DEMO === '0' ? [] : [...initialAccounts],
      emails: process.env.POSTACI_SEED_DEMO === '0' ? [] : [...initialEmails],
      contacts: process.env.POSTACI_SEED_DEMO === '0' ? [] : [...initialContacts],
      calendar_events: process.env.POSTACI_SEED_DEMO === '0' ? [] : [...initialCalendarEvents],
      deletedRecords: []
    };
  }
  for (const folder of memStore.serverFolders || []) serverFoldersMap.set(folder.accountId + ':::' + folder.path, folder);
  saveJsonStore(true);
}

let saveTimer: NodeJS.Timeout | null = null;
export function saveJsonStore(forceSync = false) {
  if (restoring) return;
  if (isNativeSqlite) { saveAccountsBackup(getAccounts()); return; }
  saveAccountsBackup(memStore.accounts);
  const flush = () => {
    saveTimer = null;
    atomicWrite(jsonDbPath, JSON.stringify({ ...memStore, accounts: memStore.accounts.map(encodeAccount) }));
  };
  if (forceSync) { if (saveTimer) clearTimeout(saveTimer); flush(); }
  else if (!saveTimer) saveTimer = setTimeout(flush, 200);
}

try {
  if (process.env.POSTACI_STORAGE === 'json') throw new Error('JSON storage selected');
  const Database = nativeRequire('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('secure_delete = ON');
  isNativeSqlite = true;
} catch (err: any) {
  if (process.env.POSTACI_STORAGE !== 'json' && (db || fs.existsSync(dbPath))) {
    throw new Error('Mevcut SQLite veritabanı açılamadı; farklı bir depoya geçilmedi ve veriler değiştirilmedi.', { cause: err });
  }
  console.warn('⚠️ Native SQLite not available, using JSON/In-Memory fallback store:', err.message || err);
  isNativeSqlite = false;
  loadJsonStore();
}

export function resetDatabase(seedDemo: boolean = false) {
  serverFoldersMap.clear();
  if (!isNativeSqlite) {
    memStore = {
      accounts: seedDemo ? [...initialAccounts] : [],
      emails: seedDemo ? [...initialEmails] : [],
      contacts: seedDemo ? [...initialContacts] : [],
      calendar_events: seedDemo ? [...initialCalendarEvents] : [],
      deletedRecords: []
    };
    saveJsonStore(true);
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
    if (seedDemo) {
      seedDemoData();
    }
    saveAccountsBackup(getAccounts());
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
    saveJsonStore(true);
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

export function initDatabase() {
  if (!isNativeSqlite) {
    console.log('🌱 JSON Storage active. Loaded', memStore.accounts.length, 'accounts,', memStore.emails.length, 'emails.');
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

      CREATE TABLE IF NOT EXISTS server_folders (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);

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

    for (const row of db.prepare('SELECT record_json FROM server_folders').all()) {
      const folder = JSON.parse(row.record_json);
      serverFoldersMap.set(folder.accountId + ':::' + folder.path, folder);
    }

    // Dynamic schema migrations for emails table
    try { db.prepare('ALTER TABLE emails ADD COLUMN imapUid INTEGER').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE emails ADD COLUMN mailboxPath TEXT').run(); } catch (_) {}
    try { db.prepare('ALTER TABLE emails ADD COLUMN isPinned INTEGER DEFAULT 0').run(); } catch {}
    try { db.prepare('ALTER TABLE emails ADD COLUMN snoozedUntil TEXT').run(); } catch {}
    try { db.prepare('ALTER TABLE emails ADD COLUMN hasFullBody INTEGER DEFAULT 1').run(); } catch (_) {}

    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_emails_acc_box ON emails(accountId, mailboxPath, imapUid);
        CREATE INDEX IF NOT EXISTS idx_emails_acc_folder ON emails(accountId, folder, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(accountId, folder, isRead, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_emails_uid ON emails(imapUid);
      `);
    } catch (_) {}

    // Migrate only secret columns; preserve all mail and account IDs.
    const secretColumns = ['imapPassword', 'smtpPassword', 'oauthAccessToken', 'oauthRefreshToken', 'oauthClientSecret'];
    const legacyRows = db.prepare('SELECT * FROM accounts').all().filter((r: any) =>
      secretColumns.some(k => r[k] && !r[k].startsWith('postaci:v1:')));
    if (legacyRows.length) {
      db.transaction(() => {
        const stmt = db.prepare('UPDATE accounts SET ' + secretColumns.map(k => k + ' = @' + k).join(', ') + ' WHERE id = @id');
        for (const row of legacyRows) stmt.run(encodeAccount(decodeAccount(row)));
      })();
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM');
      db.pragma('wal_checkpoint(TRUNCATE)');
    }
    // Also encrypt a legacy JSON fallback store, without discarding its other data.
    if (fs.existsSync(jsonDbPath)) {
      const legacy = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
      if (Array.isArray(legacy.accounts)) atomicWrite(jsonDbPath, JSON.stringify({ ...legacy, accounts: legacy.accounts.map((a: Account) => encodeAccount(decodeAccount(a))) }));
    }

    const accountCount = (db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number })?.count || 0;
    if (accountCount === 0) {
      const backedUp = loadAccountsBackup();
      if (backedUp.length > 0) {
        console.log(`🔄 Restoring ${backedUp.length} accounts from accounts.json backup into SQLite...`);
        for (const acc of backedUp) {
          saveAccount(acc);
        }
      } else {
        console.log('🌱 Seeding initial demo accounts, emails, contacts and calendar events...');
        if (process.env.POSTACI_SEED_DEMO !== '0') seedDemoData();
      }
    } else {
      saveAccountsBackup(getAccounts());
    }

    // Auto-clean orphaned emails only if accounts are present
    const currentAccCount = (db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number })?.count || 0;
    if (currentAccCount > 0) {
      try {
        db.prepare('DELETE FROM emails WHERE accountId NOT IN (SELECT id FROM accounts)').run();
        db.prepare('DELETE FROM deleted_records WHERE accountId IS NOT NULL AND accountId NOT IN (SELECT id FROM accounts)').run();
        db.prepare('DELETE FROM calendar_events WHERE accountId NOT IN (SELECT id FROM accounts)').run();
      } catch (_) {}
    }

    console.log(`📦 SQLite database initialized. ${currentAccCount} accounts active.`);
  } catch (err: any) {
    if (err instanceof CredentialError) throw err;
    throw new Error('SQLite başlatılamadı; mevcut veriler değiştirilmedi.', { cause: err });
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
      imapPassword: encryptSecret(acc.imapPassword),
      imapSecure: acc.imapSecure ? 1 : 0,
      smtpHost: acc.smtpHost || null,
      smtpPort: acc.smtpPort || null,
      smtpUser: acc.smtpUser || null,
      smtpPassword: encryptSecret(acc.smtpPassword),
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
    return memStore.accounts.map(a => {
      const unread = memStore.emails.filter(e =>
        e.accountId === a.id &&
        !e.isRead &&
        (e.folder === 'INBOX' || (e.folder && e.folder.toUpperCase() === 'INBOX')) &&
        !e.isDeleted
      ).length;
      return {
        ...a,
        unreadCount: unread
      };
    });
  }

  const rows = db.prepare('SELECT * FROM accounts ORDER BY isDefault DESC, name ASC').all() as any[];
  return rows.map(r => {
    const unread = (db.prepare("SELECT COUNT(*) as c FROM emails WHERE accountId = ? AND isRead = 0 AND (folder = 'INBOX' OR UPPER(folder) = 'INBOX') AND isDeleted = 0").get(r.id) as any)?.c || 0;
    return {
      ...decodeAccount(r),
      isDefault: Boolean(r.isDefault),
      imapSecure: Boolean(r.imapSecure),
      smtpSecure: Boolean(r.smtpSecure),
      unreadCount: unread
    };
  });
}

export function getAccountById(id: string): Account | undefined {
  if (!isNativeSqlite) {
    const a = memStore.accounts.find(acc => acc.id === id);
    if (!a) return undefined;
    const unread = memStore.emails.filter(e =>
      e.accountId === a.id &&
      !e.isRead &&
      (e.folder === 'INBOX' || (e.folder && e.folder.toUpperCase() === 'INBOX')) &&
      !e.isDeleted
    ).length;
    return { ...a, unreadCount: unread };
  }
  const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
  if (!r) return undefined;
  const unread = (db.prepare("SELECT COUNT(*) as c FROM emails WHERE accountId = ? AND isRead = 0 AND (folder = 'INBOX' OR UPPER(folder) = 'INBOX') AND isDeleted = 0").get(r.id) as any)?.c || 0;
  return {
    ...decodeAccount(r),
    isDefault: Boolean(r.isDefault),
    imapSecure: Boolean(r.imapSecure),
    smtpSecure: Boolean(r.smtpSecure),
    unreadCount: unread
  };
}

export function getAccountByEmail(email: string): Account | undefined {
  if (!isNativeSqlite) {
    return memStore.accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  }
  const r = db.prepare('SELECT * FROM accounts WHERE LOWER(email) = LOWER(?)').get(email) as any;
  if (!r) return undefined;
  return {
    ...decodeAccount(r),
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
    oauthAccessToken: encryptSecret(acc.oauthAccessToken),
    oauthRefreshToken: encryptSecret(acc.oauthRefreshToken),
    oauthExpiresAt: acc.oauthExpiresAt || null,
    oauthClientId: acc.oauthClientId || null,
    oauthClientSecret: encryptSecret(acc.oauthClientSecret),
    imapHost: acc.imapHost || null,
    imapPort: acc.imapPort || null,
    imapUser: acc.imapUser || null,
    imapPassword: encryptSecret(acc.imapPassword),
    imapSecure: acc.imapSecure ? 1 : 0,
    smtpHost: acc.smtpHost || null,
    smtpPort: acc.smtpPort || null,
    smtpUser: acc.smtpUser || null,
    smtpPassword: encryptSecret(acc.smtpPassword),
    smtpSecure: acc.smtpSecure ? 1 : 0,
    color: acc.color,
    avatar: acc.avatar || null,
    isDefault: acc.isDefault ? 1 : 0,
    signature: acc.signature || null,
    syncInterval: acc.syncInterval || 60,
    lastSyncedAt: acc.lastSyncedAt || new Date().toISOString()
  });
  saveAccountsBackup(getAccounts());
  return acc;
}

export function updateAccount(id: string, acc: Partial<Account>): Account | undefined {
  if (!isNativeSqlite) {
    const idx = memStore.accounts.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    if (acc.isDefault) {
      memStore.accounts.forEach(a => a.isDefault = false);
    }
    memStore.accounts[idx] = { ...memStore.accounts[idx], ...acc, id };
    saveJsonStore();
    saveAccountsBackup(memStore.accounts);
    return memStore.accounts[idx];
  }

  const existing = getAccountById(id);
  if (!existing) return undefined;

  if (acc.isDefault) {
    db.prepare('UPDATE accounts SET isDefault = 0').run();
  }

  const updated: Account = { ...existing, ...acc, id };
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
    oauthAccessToken: encryptSecret(updated.oauthAccessToken),
    oauthRefreshToken: encryptSecret(updated.oauthRefreshToken),
    oauthExpiresAt: updated.oauthExpiresAt || null,
    oauthClientId: updated.oauthClientId || null,
    oauthClientSecret: encryptSecret(updated.oauthClientSecret),
    imapHost: updated.imapHost || null,
    imapPort: updated.imapPort || null,
    imapUser: updated.imapUser || null,
    imapPassword: encryptSecret(updated.imapPassword),
    imapSecure: updated.imapSecure ? 1 : 0,
    smtpHost: updated.smtpHost || null,
    smtpPort: updated.smtpPort || null,
    smtpUser: updated.smtpUser || null,
    smtpPassword: encryptSecret(updated.smtpPassword),
    smtpSecure: updated.smtpSecure ? 1 : 0,
    color: updated.color,
    avatar: updated.avatar || null,
    isDefault: updated.isDefault ? 1 : 0,
    signature: updated.signature || null,
    syncInterval: updated.syncInterval || 60,
    lastSyncedAt: updated.lastSyncedAt || null
  });

  saveAccountsBackup(getAccounts());
  return updated;
}

export function deleteAccount(id: string): boolean {
  const acc = getAccountById(id);
  const accountEmail = acc?.email;

  // 1. Clean in-memory server folders cache
  for (const [key, folder] of serverFoldersMap.entries()) {
    if (folder.accountId === id || (accountEmail && folder.accountId === accountEmail)) {
      serverFoldersMap.delete(key);
    }
  }

  if (!isNativeSqlite) {
    const prevLen = memStore.accounts.length;
    memStore.accounts = memStore.accounts.filter(a => a.id !== id && (!accountEmail || a.email !== accountEmail));
    const activeIds = new Set(memStore.accounts.map(a => a.id));
    memStore.emails = memStore.emails.filter(e => activeIds.has(e.accountId));
    memStore.deletedRecords = (memStore.deletedRecords || []).filter((d: any) => !d.accountId || activeIds.has(d.accountId));
    memStore.calendar_events = (memStore.calendar_events || []).filter((c: any) => activeIds.has(c.accountId));
    saveJsonStore();
    saveAccountsBackup(memStore.accounts);
    return memStore.accounts.length < prevLen;
  }

  // 2. Clean SQLite tables for this account AND its email address
  try {
    if (accountEmail) {
      db.prepare('DELETE FROM emails WHERE accountId = ? OR accountId = ?').run(id, accountEmail);
      db.prepare('DELETE FROM deleted_records WHERE accountId = ? OR accountId = ?').run(id, accountEmail);
      db.prepare('DELETE FROM calendar_events WHERE accountId = ? OR accountId = ?').run(id, accountEmail);
    } else {
      db.prepare('DELETE FROM emails WHERE accountId = ?').run(id);
      db.prepare('DELETE FROM deleted_records WHERE accountId = ?').run(id);
      db.prepare('DELETE FROM calendar_events WHERE accountId = ?').run(id);
    }
  } catch (err) {
    console.warn('Error cleaning up tables for deleted account:', err);
  }

  const res = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

  // 3. Purge all orphaned rows in SQLite so no leftovers remain
  try {
    db.prepare('DELETE FROM emails WHERE accountId NOT IN (SELECT id FROM accounts)').run();
    db.prepare('DELETE FROM deleted_records WHERE accountId IS NOT NULL AND accountId NOT IN (SELECT id FROM accounts)').run();
    db.prepare('DELETE FROM calendar_events WHERE accountId NOT IN (SELECT id FROM accounts)').run();
  } catch (_) {}

  saveAccountsBackup(getAccounts());
  return res.changes > 0;
}

// ----------------- EMAILS -----------------
function parseEmailRow(r: any, isListView = false): Email {
  const account = r.acc_name !== undefined ? {
    name: r.acc_name || 'Bilinmeyen',
    email: r.acc_email || '',
    color: r.acc_color || '#94a3b8'
  } : undefined;

  let attachments: Attachment[] = [];
  try {
    const rawAtts = JSON.parse(r.attachments_json || '[]');
    if (isListView) {
      // In list view: strip heavy base64 to prevent memory bloat and renderer crashes
      attachments = rawAtts.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        isInline: a.isInline,
        contentId: a.contentId,
      }));
    } else {
      attachments = rawAtts;
    }
  } catch {
    attachments = [];
  }

  const rawBodyText = r.bodyText || '';
  const bodyText = (isListView && rawBodyText.length > 500)
    ? rawBodyText.substring(0, 500)
    : rawBodyText;

  const bodyHtml = isListView
    ? (r.snippet ? `<p>${r.snippet}</p>` : '')
    : r.bodyHtml;

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
    bodyText,
    bodyHtml,
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
    attachments,
    meetingInvite: r.meetingInvite_json ? JSON.parse(r.meetingInvite_json) : null,
    aiSummary: r.aiSummary,
    aiSmartReplies: r.aiSmartReplies_json ? JSON.parse(r.aiSmartReplies_json) : null,
    aiCategory: r.aiCategory,
    imapUid: r.imapUid !== null && r.imapUid !== undefined ? Number(r.imapUid) : undefined,
    mailboxPath: r.mailboxPath || undefined,
    isPinned: Boolean(r.isPinned),
    snoozedUntil: r.snoozedUntil || null,
    hasFullBody: r.hasFullBody !== undefined ? Boolean(r.hasFullBody) : true,
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
  limit?: number;
  offset?: number;
  sort?: string;
  hasAttachment?: boolean;
}): Email[] {
  const limit = Math.max(1, Math.min(501, Math.floor(params.limit || 100)));
  const offset = Math.max(0, Math.floor(params.offset || 0));
  if (!isNativeSqlite) {
    const activeAccountIds = new Set(memStore.accounts.map(a => a.id));
    return memStore.emails.filter(e => {
      if (!activeAccountIds.has(e.accountId)) return false;
      if (params.hasAttachment && !e.attachments?.length) return false;
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
    }).sort((a, b) => {
      const ta = !a.date ? 0 : (isNaN(new Date(a.date).getTime()) ? 0 : new Date(a.date).getTime());
      const tb = !b.date ? 0 : (isNaN(new Date(b.date).getTime()) ? 0 : new Date(b.date).getTime());
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (params.sort === 'oldest') return ta - tb || a.id.localeCompare(b.id);
      if (params.sort === 'from-asc' || params.sort === 'from-desc') {
        const order = (a.fromName || a.fromEmail).localeCompare(b.fromName || b.fromEmail);
        if (order) return params.sort === 'from-desc' ? -order : order;
      }
      if (params.sort === 'subject-asc') { const order = a.subject.localeCompare(b.subject); if (order) return order; }
      if (params.sort === 'unread-first' && a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      if (params.sort === 'starred-first' && a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
      const diff = tb - ta;
      if (diff !== 0) return diff;
      return (b.imapUid || 0) - (a.imapUid || 0) || a.id.localeCompare(b.id);
    }).slice(offset, offset + limit).map(e => {
      const acc = memStore.accounts.find(a => a.id === e.accountId);
      return {
        ...e,
        attachments: (e.attachments || []).map(a => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          isInline: a.isInline,
          contentId: a.contentId
        })),
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
    INNER JOIN accounts ON emails.accountId = accounts.id
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

  if (params.hasAttachment) query += " AND emails.attachments_json IS NOT NULL AND emails.attachments_json != '[]'";
  const orders: Record<string, string> = {
    newest: 'emails.date DESC', oldest: 'emails.date ASC',
    'from-asc': 'emails.fromName COLLATE NOCASE ASC, emails.date DESC',
    'from-desc': 'emails.fromName COLLATE NOCASE DESC, emails.date DESC',
    'subject-asc': 'emails.subject COLLATE NOCASE ASC, emails.date DESC',
    'unread-first': 'emails.isRead ASC, emails.date DESC', 'starred-first': 'emails.isStarred DESC, emails.date DESC',
  };
  query += ' ORDER BY emails.isPinned DESC, ' + (orders[params.sort || 'newest'] || orders.newest) + ', emails.imapUid DESC, emails.id ASC LIMIT ? OFFSET ?';
  conditions.push(limit, offset);

  const rows = db.prepare(query).all(...conditions) as any[];
  return rows.map(r => parseEmailRow(r, true));
}

export function getEmailById(id: string): Email | undefined {
  const rawId = decodeURIComponent(id);
  if (!isNativeSqlite) {
    const activeAccountIds = new Set(memStore.accounts.map(a => a.id));
    const found = memStore.emails.find(e => activeAccountIds.has(e.accountId) && (e.id === id || e.id === rawId || decodeURIComponent(e.id) === rawId || (e.messageId && (e.messageId === id || e.messageId === rawId))));
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
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.id = ? OR emails.id = ? OR emails.messageId = ?
    LIMIT 1
  `;
  const row = db.prepare(query).get(id, rawId, id);
  if (!row) return undefined;
  return parseEmailRow(row);
}

export function getEmailByMessageId(messageId: string, accountId?: string): Email | undefined {
  if (!messageId) return undefined;
  const cleanMid = messageId.replace(/[<>]/g, '').trim();
  if (!cleanMid) return undefined;

  if (!isNativeSqlite) {
    const activeAccountIds = new Set(memStore.accounts.map(a => a.id));
    const found = memStore.emails.find(e => {
      if (!activeAccountIds.has(e.accountId)) return false;
      if (!e.messageId) return false;
      if (accountId && e.accountId !== accountId) return false;
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

  const query = accountId
    ? `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE (emails.messageId = ? OR emails.messageId = ? OR emails.messageId = ?) AND emails.accountId = ?
    LIMIT 1
  `
    : `
    SELECT 
      emails.*,
      accounts.name AS acc_name,
      accounts.email AS acc_email,
      accounts.color AS acc_color
    FROM emails
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.messageId = ? OR emails.messageId = ? OR emails.messageId = ?
    LIMIT 1
  `;
  const params = accountId ? [messageId, cleanMid, `<${cleanMid}>`, accountId] : [messageId, cleanMid, `<${cleanMid}>`];
  const row = db.prepare(query).get(...params);
  if (!row) return undefined;
  return parseEmailRow(row);
}

export function getEmailThread(threadId: string): Email[] {
  if (!isNativeSqlite) {
    const activeAccountIds = new Set(memStore.accounts.map(a => a.id));
    return memStore.emails
      .filter(e => activeAccountIds.has(e.accountId) && e.threadId === threadId)
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
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.threadId = ?
    ORDER BY emails.date ASC
  `;
  const rows = db.prepare(query).all(threadId) as any[];
  return rows.map(r => parseEmailRow(r, false));
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
    if (rawId && rawId !== id) {
      stmt.run({ id: rawId, accountId, messageId, imapUid, mailboxPath, deletedAt });
    }
    if (cleanMid && cleanMid.length > 3) {
      stmt.run({ id: cleanMid, accountId, messageId: cleanMid, imapUid, mailboxPath, deletedAt });
      stmt.run({ id: `<${cleanMid}>`, accountId, messageId: `<${cleanMid}>`, imapUid, mailboxPath, deletedAt });
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
    const rawId = decodeURIComponent(identifier);
    const cleanRawId = rawId.replace(/[<>]/g, '').trim();
    if (!isNativeSqlite) {
      if ((memStore.deletedRecords || []).some(r => (r.id === identifier || r.id === cleanId || r.id === rawId || r.id === cleanRawId) && (!accountId || !r.accountId || r.accountId === accountId))) {
        return true;
      }
    } else {
      try {
        const query = accountId
          ? 'SELECT 1 FROM deleted_records WHERE (id = ? OR id = ? OR id = ? OR id = ?) AND (accountId = ? OR accountId IS NULL)'
          : 'SELECT 1 FROM deleted_records WHERE id = ? OR id = ? OR id = ? OR id = ?';
        const params = accountId ? [identifier, cleanId, rawId, cleanRawId, accountId] : [identifier, cleanId, rawId, cleanRawId];
        const row = db.prepare(query).get(...params);
        if (row) return true;
      } catch {}
    }
  }

  // Check by RFC Message-ID
  if (messageId && messageId.trim().length >= 4) {
    const cleanMid = messageId.replace(/[<>]/g, '').trim();
    if (!isNativeSqlite) {
      if ((memStore.deletedRecords || []).some(r => r.messageId && (r.messageId === messageId || r.messageId.replace(/[<>]/g, '').trim() === cleanMid) && (!accountId || !r.accountId || r.accountId === accountId))) {
        return true;
      }
    } else {
      try {
        const query = accountId
          ? 'SELECT 1 FROM deleted_records WHERE (messageId = ? OR messageId = ? OR messageId = ? OR id = ? OR id = ?) AND (accountId = ? OR accountId IS NULL)'
          : 'SELECT 1 FROM deleted_records WHERE messageId = ? OR messageId = ? OR messageId = ? OR id = ? OR id = ?';
        const params = accountId
          ? [messageId, cleanMid, `<${cleanMid}>`, messageId, cleanMid, accountId]
          : [messageId, cleanMid, `<${cleanMid}>`, messageId, cleanMid];
        const row = db.prepare(query).get(...params);
        if (row) return true;
      } catch {}
    }
  }

  // Check by accountId + imapUid + mailboxPath (UID is per-mailbox, must include path)
  if (accountId && imapUid) {
    if (!isNativeSqlite) {
      // Must match mailboxPath too — UIDs are per-mailbox, not globally unique
      if ((memStore.deletedRecords || []).some(r =>
        r.accountId === accountId &&
        r.imapUid === imapUid &&
        (!r.mailboxPath || !mailboxPath || r.mailboxPath === mailboxPath)
      )) {
        return true;
      }
    } else {
      try {
        // Include mailboxPath constraint to prevent cross-mailbox false positives
        const row = mailboxPath
          ? db.prepare('SELECT 1 FROM deleted_records WHERE accountId = ? AND imapUid = ? AND (mailboxPath = ? OR mailboxPath IS NULL)').get(accountId, imapUid, mailboxPath)
          : db.prepare('SELECT 1 FROM deleted_records WHERE accountId = ? AND imapUid = ?').get(accountId, imapUid);
        if (row) return true;
      } catch {}
    }
  }

  return false;
}

export function getEmailMaxUid(accountId: string, mailboxPath: string): number {
  if (!isNativeSqlite) {
    const matching = memStore.emails.filter(e => e.accountId === accountId && (e.mailboxPath === mailboxPath || (!e.mailboxPath && mailboxPath.toUpperCase() === 'INBOX')));
    return matching.reduce((max, e) => Math.max(max, e.imapUid || 0), 0);
  }
  try {
    const row = db.prepare(`
      SELECT MAX(imapUid) as maxUid FROM emails 
      WHERE accountId = ? AND (mailboxPath = ? OR (mailboxPath IS NULL AND UPPER(?) = 'INBOX'))
    `).get(accountId, mailboxPath, mailboxPath) as any;
    return row?.maxUid || 0;
  } catch {
    return 0;
  }
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

export function saveEmailWithStatus(email: Email, isFromImapSync = false): { email: Email; isNew: boolean } {
  const isBlank = (!email.fromEmail || email.fromEmail === 'unknown@example.com') &&
    (!email.fromName || email.fromName === 'Bilinmeyen Gönderici') &&
    (!email.subject || email.subject === '(Konusuz)' || email.subject.trim() === '') &&
    !email.bodyText?.trim() && !email.bodyHtml?.trim();
  if (isBlank) {
    return { email, isNew: false };
  }

  const existing = getEmailById(email.id) || (email.messageId ? getEmailByMessageId(email.messageId, email.accountId) : undefined);
  const isNew = !existing;

  if (isFromImapSync) {
    if (email.folder !== 'TRASH' && !email.isDeleted && isDeletedLocally(email.id, email.messageId, email.accountId, email.imapUid, email.mailboxPath)) {
      return { email, isNew: false };
    }
    if (existing) {
      if (existing.folder === 'TRASH' || existing.isDeleted) {
        return { email: existing, isNew: false };
      } else if (existing.folder === 'ARCHIVE' || existing.isArchived) {
        email.folder = 'ARCHIVE';
        email.isArchived = true;
      } else if (existing.folder === 'SPAM' || existing.isSpam) {
        email.folder = 'SPAM';
        email.isSpam = true;
      }
    }
  }

  const saved = saveEmail(email, isFromImapSync);
  return { email: saved, isNew };
}

function preserveLocalEmail(incoming: Email, existing: Email): Email {
  const result = { ...incoming, id: existing.id, isPinned: existing.isPinned, snoozedUntil: existing.snoozedUntil };
  if (incoming.hasFullBody === false && existing.hasFullBody) {
    result.bodyText = existing.bodyText; result.bodyHtml = existing.bodyHtml; result.snippet = existing.snippet;
    result.attachments = existing.attachments; result.hasFullBody = true; result.meetingInvite = existing.meetingInvite;
  }
  result.aiSummary = existing.aiSummary; result.aiSmartReplies = existing.aiSmartReplies;
  return result;
}

export function saveEmail(email: Email, isFromImapSync = false): Email {
  if (isFromImapSync) { const existing = getEmailById(email.id); if (existing) email = preserveLocalEmail(email, existing); }
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
    const existing = getEmailById(email.id) || (email.messageId ? getEmailByMessageId(email.messageId, email.accountId) : undefined);
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
    const idx = memStore.emails.findIndex(e => e.id === email.id || (email.messageId && e.messageId === email.messageId && e.accountId === email.accountId));
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
      aiSmartReplies_json, aiCategory, imapUid, mailboxPath, hasFullBody, isPinned, snoozedUntil
    ) VALUES (
      @id, @accountId, @threadId, @messageId, @inReplyTo, @references_header,
      @fromName, @fromEmail, @to_json, @cc_json, @bcc_json, @replyTo_json,
      @subject, @bodyText, @bodyHtml, @snippet, @date, @isRead, @isStarred,
      @isArchived, @isDeleted, @isDraft, @isSpam, @folder, @labels_json,
      @priority, @attachments_json, @meetingInvite_json, @aiSummary,
      @aiSmartReplies_json, @aiCategory, @imapUid, @mailboxPath, @hasFullBody, @isPinned, @snoozedUntil
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
    aiCategory: email.aiCategory || null,
    imapUid: email.imapUid !== undefined ? email.imapUid : null,
    mailboxPath: email.mailboxPath || null,
    isPinned: email.isPinned ? 1 : 0,
      snoozedUntil: email.snoozedUntil || null,
      hasFullBody: email.hasFullBody !== undefined ? (email.hasFullBody ? 1 : 0) : 1
  });

  return getEmailById(email.id)!;
}

export function saveEmailsBatch(emails: Email[], isFromImapSync = false): { savedCount: number; newEmails: Email[] } {
  if (!emails || emails.length === 0) return { savedCount: 0, newEmails: [] };

  const validEmails = emails.filter(email => {
    const isBlank = (!email.fromEmail || email.fromEmail === 'unknown@example.com') &&
      (!email.fromName || email.fromName === 'Bilinmeyen Gönderici') &&
      (!email.subject || email.subject === '(Konusuz)' || email.subject.trim() === '') &&
      !email.bodyText?.trim() && !email.bodyHtml?.trim();
    if (isBlank) return false;
    if (isFromImapSync && email.folder !== 'TRASH' && !email.isDeleted && isDeletedLocally(email.id, email.messageId, email.accountId, email.imapUid, email.mailboxPath)) {
      return false;
    }
    return true;
  });

  if (validEmails.length === 0) return { savedCount: 0, newEmails: [] };

  if (!isNativeSqlite) {
    const newEmails: Email[] = [];
    for (const email of validEmails) {
      if (isFromImapSync && isDeletedLocally(email.id, email.messageId, email.accountId, email.imapUid, email.mailboxPath)) {
        continue;
      }
      const idx = memStore.emails.findIndex(e => e.id === email.id || (email.messageId && e.messageId === email.messageId && e.accountId === email.accountId));
      if (idx !== -1) {
        const existing = memStore.emails[idx];
        if (isFromImapSync) {
          Object.assign(email, preserveLocalEmail(email, existing));
          if (existing.folder === 'TRASH' || existing.isDeleted) {
            if (email.folder !== 'TRASH' && !email.isDeleted) {
              continue;
            }
            email.folder = 'TRASH';
            email.isDeleted = true;
          }
          if (existing.folder === 'ARCHIVE' || existing.isArchived) {
            email.folder = 'ARCHIVE';
            email.isArchived = true;
          } else if (existing.folder === 'SPAM' || existing.isSpam) {
            email.folder = 'SPAM';
            email.isSpam = true;
          }
        }
        memStore.emails[idx] = { ...memStore.emails[idx], ...email };
      } else {
        memStore.emails.unshift(email);
        newEmails.push(email);
      }
    }
    saveJsonStore();
    return { savedCount: validEmails.length, newEmails };
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO emails (
      id, accountId, threadId, messageId, inReplyTo, references_header,
      fromName, fromEmail, to_json, cc_json, bcc_json, replyTo_json,
      subject, bodyText, bodyHtml, snippet, date, isRead, isStarred,
      isArchived, isDeleted, isDraft, isSpam, folder, labels_json,
      priority, attachments_json, meetingInvite_json, aiSummary,
      aiSmartReplies_json, aiCategory, imapUid, mailboxPath, hasFullBody, isPinned, snoozedUntil
    ) VALUES (
      @id, @accountId, @threadId, @messageId, @inReplyTo, @references_header,
      @fromName, @fromEmail, @to_json, @cc_json, @bcc_json, @replyTo_json,
      @subject, @bodyText, @bodyHtml, @snippet, @date, @isRead, @isStarred,
      @isArchived, @isDeleted, @isDraft, @isSpam, @folder, @labels_json,
      @priority, @attachments_json, @meetingInvite_json, @aiSummary,
      @aiSmartReplies_json, @aiCategory, @imapUid, @mailboxPath, @hasFullBody, @isPinned, @snoozedUntil
    )
  `);

  const checkStmt = db.prepare(`
    SELECT *
    FROM emails 
    WHERE id = ? OR id = ? OR (messageId IS NOT NULL AND length(messageId) > 3 AND (messageId = ? OR messageId = ? OR messageId = ?) AND accountId = ?)
    LIMIT 1
  `);

  const newEmails: Email[] = [];
  const runTx = db.transaction((items: Email[]) => {
    for (const email of items) {
      if (isFromImapSync && isDeletedLocally(email.id, email.messageId, email.accountId, email.imapUid, email.mailboxPath)) {
        continue;
      }

      const rawId = decodeURIComponent(email.id);
      const cleanMid = email.messageId ? email.messageId.replace(/[<>]/g, '').trim() : '';
      const existing = checkStmt.get(email.id, rawId, email.messageId || '', cleanMid, `<${cleanMid}>`, email.accountId) as any;

      if (isFromImapSync && existing) {
        Object.assign(email, preserveLocalEmail(email, parseEmailRow(existing)));
        if (existing.folder === 'TRASH' || existing.isDeleted) {
          // If local record is in TRASH/deleted but sync email comes from a non-TRASH folder,
          // skip entirely — do NOT overwrite with INSERT OR REPLACE (prevents ghost resurrection)
          if (email.folder !== 'TRASH' && !email.isDeleted) {
            continue;
          }
          // If sync email ALSO comes from TRASH folder, allow update but preserve TRASH status
          email.folder = 'TRASH';
          email.isDeleted = true;
        }
        if (existing.folder === 'ARCHIVE' || existing.isArchived) {
          email.folder = 'ARCHIVE';
          email.isArchived = true;
        } else if (existing.folder === 'SPAM' || existing.isSpam) {
          email.folder = 'SPAM';
          email.isSpam = true;
        }
      } else if (!existing) {
        newEmails.push(email);
      }

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
        aiCategory: email.aiCategory || null,
        imapUid: email.imapUid !== undefined ? email.imapUid : null,
        mailboxPath: email.mailboxPath || null,
        isPinned: email.isPinned ? 1 : 0,
      snoozedUntil: email.snoozedUntil || null,
      hasFullBody: email.hasFullBody !== undefined ? (email.hasFullBody ? 1 : 0) : 1
      });
    }
  });

  runTx(validEmails);
  return { savedCount: validEmails.length, newEmails };
}

export function updateEmailBody(id: string, updates: {
  bodyText: string;
  bodyHtml: string;
  snippet?: string;
  attachments?: Attachment[];
  hasFullBody?: boolean;
}): boolean {
  if (!isNativeSqlite) {
    const e = memStore.emails.find(m => m.id === id);
    if (e) {
      e.bodyText = updates.bodyText;
      e.bodyHtml = updates.bodyHtml;
      if (updates.snippet) e.snippet = updates.snippet;
      if (updates.attachments) e.attachments = updates.attachments;
      e.hasFullBody = updates.hasFullBody !== undefined ? updates.hasFullBody : true;
      saveJsonStore();
      return true;
    }
    return false;
  }

  try {
    const stmt = db.prepare(`
      UPDATE emails 
      SET bodyText = @bodyText, bodyHtml = @bodyHtml, snippet = COALESCE(@snippet, snippet),
          attachments_json = COALESCE(@attachments_json, attachments_json), hasFullBody = @hasFullBody
      WHERE id = @id
    `);
    const res = stmt.run({
      id,
      bodyText: updates.bodyText,
      bodyHtml: updates.bodyHtml,
      snippet: updates.snippet || null,
      attachments_json: updates.attachments ? JSON.stringify(updates.attachments) : null,
      hasFullBody: updates.hasFullBody !== undefined ? (updates.hasFullBody ? 1 : 0) : 1
    });
    return res.changes > 0;
  } catch (err) {
    console.warn('Failed to update email body:', err);
    return false;
  }
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
  isPinned?: boolean;
  snoozedUntil?: string | null;
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
    saveJsonStore();

    // If email is moved to TRASH, mark it as deleted locally to prevent resurrection during sync
    if (updates.isDeleted === true && updates.folder === 'TRASH') {
      const email = memStore.emails[idx];
      markDeletedLocally({ id: email.id, messageId: email.messageId, accountId: email.accountId, imapUid: email.imapUid, mailboxPath: email.mailboxPath });
    }

    return memStore.emails[idx];
  }

  let current = getEmailById(id) || getEmailById(rawId);
  if (!current) return undefined;

  const targetId = current.id;

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
  if (updates.mailboxPath !== undefined) {
    sets.push('mailboxPath = @mailboxPath');
    params.mailboxPath = updates.mailboxPath;
  }
  if (updates.imapUid !== undefined) {
    sets.push('imapUid = @imapUid');
    params.imapUid = updates.imapUid;
  }
  if (updates.isPinned !== undefined) { sets.push('isPinned = @isPinned'); params.isPinned = updates.isPinned ? 1 : 0; }
  if (updates.snoozedUntil !== undefined) { sets.push('snoozedUntil = @snoozedUntil'); params.snoozedUntil = updates.snoozedUntil; }
  if (updates.labels !== undefined) {
    sets.push('labels_json = @labels_json');
    params.labels_json = JSON.stringify(updates.labels);
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE emails SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  // If email is moved to TRASH, mark it as deleted locally to prevent resurrection during sync
  if (updates.isDeleted === true && updates.folder === 'TRASH') {
    const email = getEmailById(targetId);
    if (email) {
      markDeletedLocally({ id: email.id, messageId: email.messageId, accountId: email.accountId, imapUid: email.imapUid, mailboxPath: email.mailboxPath });
    }
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
  const cleanMid = email?.messageId ? email.messageId.replace(/[<>]/g, '').trim() : '';
  const res = db.prepare(`
    DELETE FROM emails 
    WHERE id = ? OR id = ? 
    OR (messageId IS NOT NULL AND messageId != '' AND (messageId = ? OR messageId = ? OR messageId = ?))
  `).run(targetId, rawId, email?.messageId || '', cleanMid, `<${cleanMid}>`);
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

export function registerServerFolder(record: ServerFolderRecord) {
  const key = `${record.accountId}:::${record.path}`;
  serverFoldersMap.set(key, record);
  if (isNativeSqlite) db.prepare('INSERT OR REPLACE INTO server_folders(id, record_json) VALUES (?, ?)').run(record.id, JSON.stringify(record));
  else { memStore.serverFolders = Array.from(serverFoldersMap.values()); saveJsonStore(); }
}

export function getServerFolders(accountId?: string): ServerFolderRecord[] {
  const activeAccountIds = new Set(getAccounts().map(a => a.id));
  const all = Array.from(serverFoldersMap.values()).filter(f => activeAccountIds.has(f.accountId));
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

export function syncFolderReadFlags(accountId: string, folder: string, unseenUids: number[], allUids: number[], minUid: number) {
  const unseenSet = new Set(unseenUids);
  if (!isNativeSqlite) {
    for (const e of memStore.emails) {
      if (e.accountId === accountId && e.folder === folder && e.imapUid && e.imapUid >= minUid) {
        if (unseenSet.has(e.imapUid)) {
          e.isRead = false;
        } else if (allUids.includes(e.imapUid)) {
          e.isRead = true;
        }
      }
    }
    saveJsonStore();
    return;
  }

  try {
    const emailsInFolder = db.prepare(`
      SELECT id, imapUid, isRead FROM emails 
      WHERE accountId = ? AND folder = ? AND imapUid >= ? AND imapUid IS NOT NULL
    `).all(accountId, folder, minUid) as Array<{ id: string; imapUid: number; isRead: number }>;

    const updateReadStmt = db.prepare('UPDATE emails SET isRead = ? WHERE id = ?');
    const updateTx = db.transaction((rows: typeof emailsInFolder) => {
      for (const row of rows) {
        const isServerUnseen = unseenSet.has(row.imapUid);
        const shouldBeRead = isServerUnseen ? 0 : 1;
        if (row.isRead !== shouldBeRead) {
          updateReadStmt.run(shouldBeRead, row.id);
        }
      }
    });
    updateTx(emailsInFolder);
  } catch (err) {
    console.warn('Failed to sync folder read flags:', err);
  }
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
    const activeAccountIds = new Set(memStore.accounts.map(a => a.id));
    // Find all custom folders in memory strictly for the selected account(s)
    const memoryCustomFolders = Array.from(new Set(
      memStore.emails
        .filter(e => {
          if (!activeAccountIds.has(e.accountId)) return false;
          if (accountId && accountId !== 'all' && e.accountId !== accountId) return false;
          return !e.isDeleted;
        })
        .map(e => e.folder)
        .filter(f => !baseFolders.some(b => b.folder === f) && f !== 'STARRED')
    ));

    const combinedCustomFolders = Array.from(new Set([...discoveredNames, ...memoryCustomFolders]));

    const allFolders = [
      ...baseFolders,
      ...combinedCustomFolders.map(cf => ({ folder: cf, displayName: cf, icon: 'Folder' }))
    ];

    return allFolders.map(f => {
      const filtered = memStore.emails.filter(e => {
        if (!activeAccountIds.has(e.accountId)) return false;
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

  // Fast single aggregated query in SQLite with accurate isDeleted filtering
  const statsQuery = `
    SELECT 
      emails.folder,
      COUNT(*) as totalCount,
      SUM(CASE WHEN emails.isRead = 0 THEN 1 ELSE 0 END) as unreadCount
    FROM emails
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.isDeleted = 0
    ${accountId && accountId !== 'all' ? 'AND emails.accountId = ?' : ''}
    GROUP BY emails.folder
  `;
  const statsParams = accountId && accountId !== 'all' ? [accountId] : [];
  const statsRows = db.prepare(statsQuery).all(...statsParams) as any[];
  const statsMap = new Map<string, { count: number; unreadCount: number }>();
  for (const r of statsRows) {
    statsMap.set(r.folder, { count: Number(r.totalCount) || 0, unreadCount: Number(r.unreadCount) || 0 });
  }

  // TRASH stats (includes both folder = 'TRASH' and isDeleted = 1)
  const trashQuery = `
    SELECT 
      COUNT(*) as totalCount,
      SUM(CASE WHEN emails.isRead = 0 THEN 1 ELSE 0 END) as unreadCount
    FROM emails
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE (emails.folder = 'TRASH' OR emails.isDeleted = 1)
    ${accountId && accountId !== 'all' ? 'AND emails.accountId = ?' : ''}
  `;
  const trashRow = db.prepare(trashQuery).get(...statsParams) as any;
  statsMap.set('TRASH', { count: Number(trashRow?.totalCount) || 0, unreadCount: Number(trashRow?.unreadCount) || 0 });

  // Starred stats (must not be deleted)
  const starredQuery = `
    SELECT 
      COUNT(*) as totalCount,
      SUM(CASE WHEN emails.isRead = 0 THEN 1 ELSE 0 END) as unreadCount
    FROM emails
    INNER JOIN accounts ON emails.accountId = accounts.id
    WHERE emails.isStarred = 1 AND emails.isDeleted = 0
    ${accountId && accountId !== 'all' ? 'AND emails.accountId = ?' : ''}
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

export function searchRecipients(query: string): Array<{ name: string; email: string; source: 'contact' | 'history' }> {
  const q = (query || '').trim().toLowerCase();
  const results: Map<string, { name: string; email: string; source: 'contact' | 'history' }> = new Map();

  // 1. From saved contacts
  const contacts = getContacts();
  for (const c of contacts) {
    if (!c.email) continue;
    const matchName = c.name?.toLowerCase().includes(q);
    const matchEmail = c.email.toLowerCase().includes(q);
    if (!q || matchName || matchEmail) {
      results.set(c.email.toLowerCase(), { name: c.name || c.email.split('@')[0], email: c.email, source: 'contact' });
    }
  }

  // 2. From past emails (from, to, cc)
  if (!isNativeSqlite) {
    for (const e of memStore.emails) {
      if (e.fromEmail && !e.fromEmail.includes('unknown@')) {
        const matchName = e.fromName?.toLowerCase().includes(q);
        const matchEmail = e.fromEmail.toLowerCase().includes(q);
        if (!q || matchName || matchEmail) {
          if (!results.has(e.fromEmail.toLowerCase())) {
            results.set(e.fromEmail.toLowerCase(), { name: e.fromName || e.fromEmail.split('@')[0], email: e.fromEmail, source: 'history' });
          }
        }
      }
      for (const t of (e.to || [])) {
        if (t.email) {
          const matchName = t.name?.toLowerCase().includes(q);
          const matchEmail = t.email.toLowerCase().includes(q);
          if (!q || matchName || matchEmail) {
            if (!results.has(t.email.toLowerCase())) {
              results.set(t.email.toLowerCase(), { name: t.name || t.email.split('@')[0], email: t.email, source: 'history' });
            }
          }
        }
      }
    }
  } else {
    try {
      const param = `%${q}%`;
      const emailRows = db.prepare(`
        SELECT DISTINCT fromName AS name, fromEmail AS email 
        FROM emails 
        WHERE (fromName LIKE ? OR fromEmail LIKE ?) AND fromEmail IS NOT NULL AND fromEmail != '' AND fromEmail NOT LIKE '%unknown%'
        LIMIT 40
      `).all(param, param) as any[];

      for (const r of emailRows) {
        if (r.email && !results.has(r.email.toLowerCase())) {
          results.set(r.email.toLowerCase(), { name: r.name || r.email.split('@')[0], email: r.email, source: 'history' });
        }
      }

      // Also search past recipients in to_json
      const toRows = db.prepare(`
        SELECT to_json FROM emails 
        WHERE to_json LIKE ? 
        LIMIT 40
      `).all(param) as any[];

      for (const row of toRows) {
        try {
          const list = JSON.parse(row.to_json || '[]');
          for (const item of list) {
            if (item.email && (item.email.toLowerCase().includes(q) || item.name?.toLowerCase().includes(q))) {
              if (!results.has(item.email.toLowerCase())) {
                results.set(item.email.toLowerCase(), { name: item.name || item.email.split('@')[0], email: item.email, source: 'history' });
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to search email history for recipients:', err);
    }
  }

  return Array.from(results.values()).slice(0, 15);
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

export interface DataSnapshot {
  accounts: Account[];
  emails?: Email[];
  contacts?: Contact[];
  calendarEvents?: CalendarEvent[];
  customFolders?: ServerFolderRecord[];
}
export function exportData(): DataSnapshot {
  return {
    accounts: getAccounts(),
    emails: isNativeSqlite ? db.prepare('SELECT * FROM emails').all().map((r: any) => parseEmailRow(r)) : structuredClone(memStore.emails),
    contacts: getContacts(), calendarEvents: getCalendarEvents(), customFolders: getServerFolders(),
  };
}
export function restoreData(payload: DataSnapshot) {
  for (const key of ['accounts','emails','contacts','calendarEvents','customFolders'] as const) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) throw new Error('Yedekte geçersiz alan: ' + key);
    if ((payload[key]?.length || 0) > 200000) throw new Error('Yedek boyutu sınırı aşıldı.');
  }
  const accountIds = new Set<string>();
  const accountEmails = new Set<string>();
  for (const a of payload.accounts) {
    if (!a || typeof a.id !== 'string' || !a.id || typeof a.email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(a.email) ||
      typeof a.name !== 'string' || !['demo','custom','gmail','outlook','yahoo','icloud'].includes(a.provider)) throw new Error('Yedekte geçersiz hesap var.');
    if (accountIds.has(a.id) || accountEmails.has(a.email.toLowerCase())) throw new Error('Yedekte yinelenen hesap var.');
    accountIds.add(a.id); accountEmails.add(a.email.toLowerCase());
  }
  const emailIds = new Set<string>();
  for (const e of payload.emails || []) {
    if (!e || typeof e.id !== 'string' || !e.id || emailIds.has(e.id) || !accountIds.has(e.accountId) ||
      typeof e.subject !== 'string' || typeof e.bodyText !== 'string' || typeof e.bodyHtml !== 'string' ||
      !Array.isArray(e.to) || !Array.isArray(e.attachments) || !e.threadId || !e.date) throw new Error('Yedekte geçersiz ileti var.');
    emailIds.add(e.id);
  }
  for (const c of payload.contacts || []) if (!c?.id || typeof c.name !== 'string' || typeof c.email !== 'string') throw new Error('Yedekte geçersiz kişi var.');
  for (const e of payload.calendarEvents || []) if (!e?.id || typeof e.title !== 'string' || !Number.isFinite(Date.parse(e.startTime)) || !Number.isFinite(Date.parse(e.endTime)) || (e.accountId && !accountIds.has(e.accountId))) throw new Error('Yedekte geçersiz takvim kaydı var.');
  for (const f of payload.customFolders || []) if (!f?.id || !accountIds.has(f.accountId) || typeof f.path !== 'string' || typeof f.folderKey !== 'string' || typeof f.name !== 'string') throw new Error('Yedekte geçersiz klasör var.');
  const before = structuredClone(memStore);
  const beforeFolders = new Map(serverFoldersMap);
  const apply = () => {
    const ids = new Map<string, string>();
    for (const input of payload.accounts) {
      const existing = getAccountByEmail(input.email);
      const idCollision = getAccountById(input.id);
      if (idCollision && idCollision.email.toLowerCase() !== input.email.toLowerCase()) throw new Error('Hesap kimliği başka bir hesaba ait.');
      const account = { ...input, color: input.color || '#3b82f6', syncInterval: input.syncInterval || 60, id: existing?.id || input.id };
      ids.set(input.id, account.id);
      saveAccount(account);
    }
    for (const e of payload.emails || []) {
      const accountId = ids.get(e.accountId)!;
      const existing = getEmailById(e.id);
      if (existing && existing.accountId !== accountId) throw new Error('İleti kimliği başka bir hesaba ait.');
      saveEmail({ ...e, accountId });
    }
    const contacts = getContacts();
    for (const c of payload.contacts || []) {
      const existing = contacts.find(p => p.id === c.id || p.email.toLowerCase() === c.email.toLowerCase());
      if (existing) updateContact(existing.id, { ...c, id: existing.id }); else createContact(c);
    }
    const events = getCalendarEvents();
    for (const e of payload.calendarEvents || []) {
      const event = { ...e, accountId: e.accountId ? ids.get(e.accountId) : undefined };
      if (events.some(c => c.id === e.id)) updateCalendarEvent(e.id, event); else createCalendarEvent(event);
    }
    for (const f of payload.customFolders || []) registerServerFolder({ ...f, accountId: ids.get(f.accountId)! });
  };
  restoring = true;
  try {
    if (isNativeSqlite) db.transaction(apply)(); else apply();
  } catch (err) {
    memStore = before; serverFoldersMap.clear();
    for (const [key, folder] of beforeFolders) serverFoldersMap.set(key, folder);
    throw err;
  } finally { restoring = false; }
  saveJsonStore(true);
  return { restoredAccounts: payload.accounts.length, restoredEmails: payload.emails?.length || 0 };
}
export function getStorageStatus() { return { engine: isNativeSqlite ? 'sqlite' : 'json', accountCount: getAccounts().length }; }

export function getEmailMinUid(accountId: string, mailboxPath: string): number {
  if (isNativeSqlite) return db.prepare('SELECT MIN(imapUid) AS uid FROM emails WHERE accountId = ? AND mailboxPath = ? AND imapUid > 0').get(accountId, mailboxPath)?.uid || 0;
  let min = Infinity;
  for (const e of memStore.emails) if (e.accountId === accountId && e.mailboxPath === mailboxPath && e.imapUid && e.imapUid > 0) min = Math.min(min, e.imapUid);
  return Number.isFinite(min) ? min : 0;
}

export function closeDatabase() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveJsonStore(true);
  if (db) db.close();
}
