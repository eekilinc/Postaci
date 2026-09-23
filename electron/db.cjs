// electron/db.cjs - Postacı yerel SQLite katmanı (better-sqlite3, senkron)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function initDb(userDataPath) {
  if (db) return db;
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  const file = path.join(userDataPath, 'postaci.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,          -- google | microsoft | yahoo | imap
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      unread_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(account_id, path)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      uid TEXT NOT NULL,
      subject TEXT,
      from_addr TEXT,
      to_addr TEXT,
      date TEXT,
      snippet TEXT,
      body_html TEXT,
      body_text TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      has_att INTEGER NOT NULL DEFAULT 0,
      UNIQUE(account_id, folder_path, uid)
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      msg_uid TEXT NOT NULL,
      idx INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      UNIQUE(account_id, folder_path, msg_uid, idx)
    );
    CREATE INDEX IF NOT EXISTS idx_att_msg ON attachments(account_id, folder_path, msg_uid);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      phone TEXT,
      company TEXT,
      notes TEXT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

    -- OAuth token sütunları (safeStorage ile şifreli saklanır, base64)
    -- Eski DB'lerle uyumlu olması için IF NOT EXISTS yok; PRAGMA kontrolü:
  `);
  const cols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
  const addCol = (name, def) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${def}`);
  };
  addCol('refresh_token_enc', 'TEXT');
  addCol('access_token_enc', 'TEXT');
  addCol('token_expiry', 'TEXT');
  // Genel IMAP/SMTP hesapları (şifreli giriş)
  addCol('auth_type', `TEXT NOT NULL DEFAULT 'oauth'`);
  addCol('imap_host', 'TEXT');
  addCol('imap_port', 'INTEGER');
  addCol('smtp_host', 'TEXT');
  addCol('smtp_port', 'INTEGER');
  addCol('smtp_secure', 'INTEGER');
  addCol('password_enc', 'TEXT');
  // Yanlışlıkla accounts'a eklenmiş olabilecek sütunları temizle (v0.1 ara sürüm)
  for (const stray of ['message_id', 'refs']) {
    if (cols.includes(stray)) db.exec(`ALTER TABLE accounts DROP COLUMN ${stray}`);
  }
  // messages tablosu migration'ları (ayrı tablo!)
  // Kodun dokunduğu TÜM sütunlar reconciled edilir: eski DB'lerde "no such column" bitmesi için.
  const msgCols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  const addMsgCol = (name, def) => {
    if (!msgCols.includes(name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${def}`);
  };
  addMsgCol('subject', 'TEXT');
  addMsgCol('from_addr', 'TEXT');
  addMsgCol('to_addr', 'TEXT');
  addMsgCol('date', 'TEXT');
  addMsgCol('snippet', 'TEXT');
  addMsgCol('body_html', 'TEXT');
  addMsgCol('body_text', 'TEXT');
  addMsgCol('is_read', `INTEGER NOT NULL DEFAULT 0`);
  // İleti kimliği (yanıt zinciri / threading için)
  addMsgCol('message_id', 'TEXT');
  addMsgCol('refs', 'TEXT');
  addMsgCol('starred', 'INTEGER NOT NULL DEFAULT 0');
  addMsgCol('has_att', 'INTEGER NOT NULL DEFAULT 0');
  // folders tablosu migration'ları
  const folderCols = db.prepare('PRAGMA table_info(folders)').all().map((c) => c.name);
  if (!folderCols.includes('flags')) {
    db.exec(`ALTER TABLE folders ADD COLUMN flags TEXT`);
  }

  // İndeksler sütunlar garanti edildikten SONRA (eski DB uyumu)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(account_id, folder_path, date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_search ON messages(subject, from_addr, snippet);
    CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(account_id, folder_path, is_read);
    CREATE INDEX IF NOT EXISTS idx_messages_att ON messages(account_id, folder_path, has_att);
    CREATE INDEX IF NOT EXISTS idx_accounts_email_nocase ON accounts(email COLLATE NOCASE);
  `);

  // Geçmişten gelen kayıtlı ekler varsa has_att=1 olarak senkronize et
  try {
    db.exec(`
      UPDATE messages SET has_att = 1 
      WHERE (has_att IS NULL OR has_att = 0) AND EXISTS (
        SELECT 1 FROM attachments att 
        WHERE att.account_id = messages.account_id 
          AND att.folder_path = messages.folder_path 
          AND att.msg_uid = messages.uid
      );
    `);
  } catch {}

  return db;
}

function getDb() {
  if (!db) throw new Error('DB init edilmedi. Önce initDb() çağır.');
  return db;
}

function getStats() {
  const d = getDb();
  const accounts = d.prepare('SELECT COUNT(*) v FROM accounts').get().v;
  const folders = d.prepare('SELECT COUNT(*) v FROM folders').get().v;
  const messages = d.prepare('SELECT COUNT(*) v FROM messages').get().v;
  return { accounts, folders, messages };
}

function getDbPath() {
  return db ? db.name : null;
}

function vacuumDb() {
  const d = getDb();
  d.exec('VACUUM');
  d.exec('PRAGMA optimize');
  return true;
}

function listAccounts() {
  return getDb().prepare('SELECT id, provider, email, display_name, auth_type, imap_host, imap_port, smtp_host, smtp_port, smtp_secure, created_at FROM accounts ORDER BY id').all();
}

function getAccountById(id) {
  return getDb().prepare('SELECT * FROM accounts WHERE id=?').get(id);
}

function getAccountByEmail(email) {
  if (!email) return null;
  const trimmed = String(email).trim();
  return getDb().prepare('SELECT * FROM accounts WHERE email=? COLLATE NOCASE').get(trimmed)
    || getDb().prepare('SELECT * FROM accounts WHERE email=?').get(trimmed);
}

function updateAccount(id, { displayName, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, passwordEnc }) {
  const d = getDb();
  const sets = [];
  const args = [];
  if (displayName !== undefined) { sets.push('display_name=?'); args.push(displayName || null); }
  if (imapHost !== undefined) { sets.push('imap_host=?'); args.push(imapHost || null); }
  if (imapPort !== undefined) { sets.push('imap_port=?'); args.push(imapPort ? Number(imapPort) : null); }
  if (smtpHost !== undefined) { sets.push('smtp_host=?'); args.push(smtpHost || null); }
  if (smtpPort !== undefined) { sets.push('smtp_port=?'); args.push(smtpPort ? Number(smtpPort) : null); }
  if (smtpSecure !== undefined) { sets.push('smtp_secure=?'); args.push(smtpSecure ? 1 : 0); }
  if (passwordEnc !== undefined) { sets.push('password_enc=?'); args.push(passwordEnc); }
  if (sets.length === 0) return true;
  args.push(id);
  d.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id=?`).run(...args);
  return true;
}

function deleteAccount(id) {
  const d = getDb();
  d.prepare('DELETE FROM accounts WHERE id=?').run(id);
  return true;
}

function updateTokens(email, { refreshTokenEnc, accessTokenEnc, tokenExpiry }) {
  getDb()
    .prepare('UPDATE accounts SET refresh_token_enc=?, access_token_enc=?, token_expiry=? WHERE email=? COLLATE NOCASE')
    .run(refreshTokenEnc, accessTokenEnc, tokenExpiry, (email || '').trim());
}

function isDraftFolder(folderPath) {
  return /draft|taslak/i.test(folderPath || '');
}

function listMessages(email, folderPath, limit = 50, offset = 0) {
  const db = getDb();
  if (isDraftFolder(folderPath)) {
    return db
      .prepare(
        `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.starred, m.folder_path,
                a.email AS account_email, a.provider AS account_provider,
                (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
         FROM messages m JOIN accounts a ON a.id = m.account_id
         WHERE a.email=? COLLATE NOCASE AND (m.folder_path=? COLLATE NOCASE OR m.uid LIKE 'draft-%' OR lower(m.folder_path) LIKE '%draft%' OR lower(m.folder_path) LIKE '%taslak%')
         ORDER BY m.date DESC LIMIT ? OFFSET ?`,
      )
      .all(email, folderPath, limit, offset);
  }
  return db
    .prepare(
      `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.starred, m.folder_path,
              a.email AS account_email, a.provider AS account_provider,
              (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND m.folder_path=? COLLATE NOCASE ORDER BY m.date DESC LIMIT ? OFFSET ?`,
    )
    .all(email, folderPath, limit, offset);
}

function countFolderMessages(email, folderPath) {
  const db = getDb();
  if (isDraftFolder(folderPath)) {
    const row = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
         FROM messages m JOIN accounts a ON a.id = m.account_id
         WHERE a.email=? COLLATE NOCASE AND (m.folder_path=? COLLATE NOCASE OR m.uid LIKE 'draft-%' OR lower(m.folder_path) LIKE '%draft%' OR lower(m.folder_path) LIKE '%taslak%')`,
      )
      .get(email, folderPath);
    return {
      total: row?.total || 0,
      unread: row?.unread || 0,
    };
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND m.folder_path=? COLLATE NOCASE`,
    )
    .get(email, folderPath);
  return {
    total: row?.total || 0,
    unread: row?.unread || 0,
  };
}

function listUnifiedMessages(limit = 50, offset = 0) {
  return getDb()
    .prepare(
      `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.starred, m.folder_path,
              a.email AS account_email, a.provider AS account_provider,
              (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%'
       ORDER BY m.date DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
}

function countUnifiedMessages() {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
       FROM messages m
       WHERE upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%'`,
    )
    .get();
  return {
    total: row?.total || 0,
    unread: row?.unread || 0,
  };
}

function searchUnifiedMessages(query, limit = 100) {
  const pattern = `%${query.toLowerCase()}%`;
  return getDb()
    .prepare(
      `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.starred, m.folder_path,
              a.email AS account_email, a.provider AS account_provider,
              (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE (upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%')
         AND (lower(m.subject) LIKE ? OR lower(m.from_addr) LIKE ? OR lower(m.snippet) LIKE ?)
       ORDER BY m.date DESC LIMIT ?`,
    )
    .all(pattern, pattern, pattern, limit);
}

function searchMessages(email, folderPath, query, limit = 100) {
  const pattern = `%${query.toLowerCase()}%`;
  const db = getDb();
  if (!folderPath || folderPath === '*') {
    return db.prepare(
      `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.folder_path, m.starred,
              a.email AS account_email, a.provider AS account_provider,
              (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND (lower(m.subject) LIKE ? OR lower(m.from_addr) LIKE ? OR lower(m.snippet) LIKE ?)
       ORDER BY m.date DESC LIMIT ?`,
    ).all(email, pattern, pattern, pattern, limit);
  }
  if (isDraftFolder(folderPath)) {
    return db.prepare(
      `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.folder_path, m.starred,
              a.email AS account_email, a.provider AS account_provider,
              (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
       FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND (m.folder_path=? COLLATE NOCASE OR m.uid LIKE 'draft-%' OR lower(m.folder_path) LIKE '%draft%' OR lower(m.folder_path) LIKE '%taslak%')
         AND (lower(m.subject) LIKE ? OR lower(m.from_addr) LIKE ? OR lower(m.snippet) LIKE ?)
       ORDER BY m.date DESC LIMIT ?`,
    ).all(email, folderPath, pattern, pattern, pattern, limit);
  }
  return db.prepare(
    `SELECT m.uid, m.subject, m.from_addr, m.to_addr, m.date, m.snippet, m.is_read, m.folder_path, m.starred,
            a.email AS account_email, a.provider AS account_provider,
            (m.has_att = 1 OR EXISTS(SELECT 1 FROM attachments att WHERE att.account_id = m.account_id AND att.folder_path = m.folder_path AND att.msg_uid = m.uid)) AS has_att
     FROM messages m JOIN accounts a ON a.id = m.account_id
     WHERE a.email=? COLLATE NOCASE AND m.folder_path=? COLLATE NOCASE AND (lower(m.subject) LIKE ? OR lower(m.from_addr) LIKE ? OR lower(m.snippet) LIKE ?)
     ORDER BY m.date DESC LIMIT ?`,
  ).all(email, folderPath, pattern, pattern, pattern, limit);
}

function getThreadMessages(email, folderPath, messageId) {
  const db = getDb();
  const msgs = [];
  const stack = [messageId];
  const seen = new Set();
  while (stack.length && msgs.length < 200) {
    const mid = stack.pop();
    if (!mid || seen.has(mid)) continue;
    seen.add(mid);
    const row = db.prepare(`SELECT m.uid, m.message_id, m.refs, m.subject, m.from_addr, m.date, m.is_read FROM messages m JOIN accounts a ON a.id=m.account_id WHERE a.email=? COLLATE NOCASE AND m.folder_path=? AND m.message_id=?`).get(email, folderPath, mid);
    if (row) {
      msgs.push(row);
      if (row.refs) {
        row.refs.split(' ').filter(Boolean).forEach(r => stack.push(r));
      }
    }
    // child messages whose refs contain mid
    const children = db.prepare(`SELECT message_id FROM messages m JOIN accounts a ON a.id=m.account_id WHERE a.email=? COLLATE NOCASE AND m.folder_path=? AND m.refs LIKE ?`).all(email, folderPath, `%${mid}%`);
    children.forEach(c => { if (c.message_id) stack.push(c.message_id); });
  }
  return msgs;
}

function getMessageMeta(email, folderPath, uid) {
  return getDb()
    .prepare(
      `SELECT m.subject, m.from_addr, m.date FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND m.folder_path=? AND m.uid=?`,
    )
    .get(email, folderPath, String(uid));
}

function getMessageBody(email, folderPath, uid) {
  let row = getDb()
    .prepare(
      `SELECT m.body_html, m.body_text, m.message_id, m.refs FROM messages m JOIN accounts a ON a.id = m.account_id
       WHERE a.email=? COLLATE NOCASE AND m.folder_path=? AND m.uid=?`,
    )
    .get(email, folderPath, String(uid));
  if (!row) {
    row = getDb()
      .prepare(
        `SELECT m.body_html, m.body_text, m.message_id, m.refs FROM messages m JOIN accounts a ON a.id = m.account_id
         WHERE a.email=? COLLATE NOCASE AND m.uid=?`,
      )
      .get(email, String(uid));
  }
  if (!row) return row;
  return { ...row, references: row.refs ? row.refs.split(' ') : [] };
}

function saveMessageBody(email, folderPath, uid, { html, text, messageId, references }) {
  getDb()
    .prepare(
      `UPDATE messages SET body_html=?, body_text=?,
         message_id=COALESCE(?, message_id), refs=COALESCE(?, refs)
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
       AND folder_path=? AND uid=?`,
    )
    .run(html || null, text || null, messageId || null,
      references?.length ? references.join(' ') : null,
      email, folderPath, String(uid));
}

function listAttachments(email, folderPath, uid) {
  return getDb()
    .prepare(
      `SELECT t.idx, t.filename, t.content_type, t.size FROM attachments t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.email=? COLLATE NOCASE AND t.folder_path=? AND t.msg_uid=? ORDER BY t.idx`,
    )
    .all(email, folderPath, String(uid));
}

function saveAttachments(email, folderPath, uid, list) {
  const d = getDb();
  const del = d.prepare(
    `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND msg_uid=?`,
  );
  const ins = d.prepare(
    `INSERT INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
     VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, ?, ?, ?)`,
  );
  const txn = d.transaction((items) => {
    del.run(email, folderPath, String(uid));
    items.forEach((a, i) => ins.run(email, folderPath, String(uid), i, a.filename, a.contentType || null, a.size || 0));
    if (items && items.length > 0) {
      try {
        d.prepare(`UPDATE messages SET has_att=1 WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`).run(email, folderPath, String(uid));
      } catch {}
    }
  });
  txn(list || []);
}

function markReadDb(email, folderPath, uid) {
  getDb()
    .prepare(
      `UPDATE messages SET is_read=1 WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
       AND folder_path=? AND uid=?`,
    )
    .run(email, folderPath, String(uid));
}

function markUnreadDb(email, folderPath, uid) {
  getDb()
    .prepare(
      `UPDATE messages SET is_read=0 WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
       AND folder_path=? AND uid=?`,
    )
    .run(email, folderPath, String(uid));
}

function toggleStarDb(email, folderPath, uid) {
  const db = getDb();
  const row = db.prepare(`SELECT starred FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`).get(email, folderPath, String(uid));
  const next = row && row.starred ? 0 : 1;
  db.prepare(`UPDATE messages SET starred=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`).run(next, email, folderPath, String(uid));
  return next;
}

function saveSentMessage(email, { to, subject, text, html }) {
  const uid = `local-${Date.now()}`;
  const folderPath = getSentFolder(email);
  getDb()
    .prepare(
      `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_text, body_html, is_read)
       VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(email, folderPath, uid, subject || '(konusuz)', email, to, new Date().toISOString(), (text || '').slice(0, 200), text || null, html || null);
  return uid;
}

function addAccount({ provider, email, displayName, refreshTokenEnc, accessTokenEnc, tokenExpiry, authType, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, passwordEnc }) {
  const d = getDb();
  const cleanEmail = (email || '').trim().toLowerCase();
  const existing = getAccountByEmail(cleanEmail);
  const targetEmail = existing ? existing.email : cleanEmail;
  const row = d
    .prepare(
      `INSERT INTO accounts (provider, email, display_name, refresh_token_enc, access_token_enc, token_expiry,
         auth_type, imap_host, imap_port, smtp_host, smtp_port, smtp_secure, password_enc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         provider=coalesce(excluded.provider, accounts.provider),
         display_name=coalesce(excluded.display_name, accounts.display_name),
         refresh_token_enc=coalesce(excluded.refresh_token_enc, accounts.refresh_token_enc),
         access_token_enc=coalesce(excluded.access_token_enc, accounts.access_token_enc),
         token_expiry=coalesce(excluded.token_expiry, accounts.token_expiry),
         auth_type=coalesce(excluded.auth_type, accounts.auth_type),
         imap_host=coalesce(excluded.imap_host, accounts.imap_host),
         imap_port=coalesce(excluded.imap_port, accounts.imap_port),
         smtp_host=coalesce(excluded.smtp_host, accounts.smtp_host),
         smtp_port=coalesce(excluded.smtp_port, accounts.smtp_port),
         smtp_secure=coalesce(excluded.smtp_secure, accounts.smtp_secure),
         password_enc=coalesce(excluded.password_enc, accounts.password_enc)`,
    )
    .run(provider, targetEmail, displayName || null, refreshTokenEnc || null, accessTokenEnc || null, tokenExpiry || null,
      authType || 'oauth', imapHost || null, imapPort || null, smtpHost || null, smtpPort || null,
      smtpSecure == null ? null : (smtpSecure ? 1 : 0), passwordEnc || null);
  return row.lastInsertRowid;
}

function getSetting(key, defaultValue = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, str);
}

function syncContactsFromMessages() {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT DISTINCT from_addr as raw FROM messages WHERE from_addr IS NOT NULL
      UNION
      SELECT DISTINCT to_addr as raw FROM messages WHERE to_addr IS NOT NULL
      LIMIT 350
    `).all();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO contacts (email, name, is_manual)
      VALUES (?, ?, 0)
    `);

    const tx = db.transaction(() => {
      for (const r of rows) {
        if (!r.raw) continue;
        const parts = r.raw.split(/[,;]/);
        for (const part of parts) {
          const clean = part.trim();
          if (!clean || !clean.includes('@')) continue;
          const match = clean.match(/^(?:"?([^"<]*)"?\s*)?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?$/);
          if (match) {
            const name = (match[1] || '').trim();
            const email = (match[2] || '').trim().toLowerCase();
            if (email) insertStmt.run(email, name || null);
          } else if (clean.includes('@')) {
            const email = clean.toLowerCase();
            insertStmt.run(email, null);
          }
        }
      }
    });
    tx();
  } catch (err) {
    console.warn('[db:syncContacts] Hata:', err?.message);
  }
}

function listContacts(query = '') {
  const db = getDb();
  try {
    // İlk açılışta veya tablo boşken e-postalardan otomatik keşfet
    const count = db.prepare('SELECT count(*) as count FROM contacts').get()?.count || 0;
    if (count === 0) {
      syncContactsFromMessages();
    }
    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      return db.prepare(`
        SELECT * FROM contacts 
        WHERE lower(coalesce(name, '')) LIKE ? OR lower(email) LIKE ? OR lower(coalesce(company, '')) LIKE ?
        ORDER BY is_manual DESC, updated_at DESC, coalesce(name, email) ASC
        LIMIT 150
      `).all(q, q, q);
    }
    return db.prepare(`
      SELECT * FROM contacts 
      ORDER BY is_manual DESC, updated_at DESC, coalesce(name, email) ASC
      LIMIT 250
    `).all();
  } catch (err) {
    console.error('[db:listContacts] Hata:', err);
    return [];
  }
}

function upsertContact({ id, email, name, phone, company, notes }) {
  const db = getDb();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Geçerli bir e-posta adresi zorunludur.');
  const cleanName = (name || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanCompany = (company || '').trim();
  const cleanNotes = (notes || '').trim();

  if (id) {
    db.prepare(`
      UPDATE contacts 
      SET email = ?, name = ?, phone = ?, company = ?, notes = ?, is_manual = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(cleanEmail, cleanName || null, cleanPhone || null, cleanCompany || null, cleanNotes || null, Number(id));
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(Number(id));
  } else {
    const res = db.prepare(`
      INSERT INTO contacts (email, name, phone, company, notes, is_manual, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(email) DO UPDATE SET 
        name = excluded.name, 
        phone = excluded.phone, 
        company = excluded.company, 
        notes = excluded.notes, 
        is_manual = 1, 
        updated_at = datetime('now')
    `).run(cleanEmail, cleanName || null, cleanPhone || null, cleanCompany || null, cleanNotes || null);
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(res.lastInsertRowid) || db.prepare('SELECT * FROM contacts WHERE email = ?').get(cleanEmail);
  }
}

function deleteContact(id) {
  const db = getDb();
  try {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(Number(id));
    return true;
  } catch (err) {
    console.error('[db:deleteContact] Hata:', err);
    return false;
  }
}

function searchContacts(query, limit = 8) {
  if (!query || typeof query !== 'string' || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const db = getDb();
  const results = [];
  const seen = new Set();

  // 1. Öncelik: Kullanıcının düzenlediği ve rehbere kayıtlı kişiler
  try {
    const contactRows = db.prepare(`
      SELECT id, email, name, phone, company FROM contacts
      WHERE lower(coalesce(name, '')) LIKE ? OR lower(email) LIKE ?
      ORDER BY is_manual DESC, updated_at DESC
      LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit);
    for (const c of contactRows) {
      if (!c.email) continue;
      const lowerEmail = c.email.toLowerCase();
      seen.add(lowerEmail);
      results.push({ id: c.id, name: c.name || c.email.split('@')[0], email: c.email });
      if (results.length >= limit) return results;
    }
  } catch {}

  // 2. İkinci Öncelik: Gelen/giden iletilerdeki dinamik adresler
  try {
    const rows = db.prepare(`
      SELECT DISTINCT from_addr, to_addr 
      FROM messages 
      WHERE (from_addr LIKE ? OR to_addr LIKE ?) 
      ORDER BY id DESC
      LIMIT 60
    `).all(`%${q}%`, `%${q}%`);

    function addContact(raw) {
      if (!raw) return false;
      const parts = raw.split(/[,;]/);
      for (const part of parts) {
        const clean = part.trim();
        if (!clean) continue;
        const match = clean.match(/^(?:"?([^"<]*)"?\s*)?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?$/);
        let name = '';
        let email = '';
        if (match) {
          name = (match[1] || '').trim();
          email = (match[2] || '').trim().toLowerCase();
        } else if (clean.includes('@')) {
          email = clean.toLowerCase();
        }
        if (!email || seen.has(email)) continue;
        if (email.includes(q) || name.toLowerCase().includes(q)) {
          seen.add(email);
          results.push({ name: name || email.split('@')[0], email });
          if (results.length >= limit) return true;
        }
      }
      return false;
    }

    for (const r of rows) {
      if (addContact(r.from_addr)) break;
      if (addContact(r.to_addr)) break;
    }
  } catch {}

  return results;
}

function batchMarkReadDb(email, folderPath, uids, isRead = 1) {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE messages SET is_read=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
  );
  const trans = db.transaction((list) => {
    for (const uid of list) {
      stmt.run(isRead ? 1 : 0, email, folderPath, String(uid));
    }
  });
  trans(uids);
}

function batchToggleStarDb(email, folderPath, uids, starred = 1) {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE messages SET starred=? WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? AND uid=?`
  );
  const trans = db.transaction((list) => {
    for (const uid of list) {
      stmt.run(starred ? 1 : 0, email, folderPath, String(uid));
    }
  });
  trans(uids);
}

function getSentFolder(email) {
  const acc = getAccountByEmail(email);
  if (acc?.provider === 'google') return '[Gmail]/Sent Mail';
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT path FROM folders 
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) 
         AND (lower(path) LIKE '%sent%' OR lower(path) LIKE '%gönder%')`
    ).all(email);
    if (rows && rows.length > 0) {
      const found =
        rows.find((r) => /^(\[gmail\]\/)?sent( mail)?$/i.test(r.path)) ||
        rows.find((r) => /^(\[gmail\]\/)?gönderilen(ler| postalar)?$/i.test(r.path)) ||
        rows[0];
      return found.path;
    }
  } catch {}
  return 'Sent';
}

function getDraftFolder(email) {
  const acc = getAccountByEmail(email);
  if (acc?.provider === 'google') return '[Gmail]/Taslaklar';
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT path FROM folders 
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) 
         AND (lower(path) LIKE '%draft%' OR lower(path) LIKE '%taslak%')`
    ).all(email);
    if (rows && rows.length > 0) {
      const found =
        rows.find((r) => /^(\[gmail\]\/)?drafts$/i.test(r.path)) ||
        rows.find((r) => /^(\[gmail\]\/)?taslaklar$/i.test(r.path)) ||
        rows[0];
      return found.path;
    }
  } catch {}
  if (acc?.provider === 'microsoft') return 'Drafts';
  return 'Drafts';
}

function saveDraftMessage(email, { to, subject, text, html }) {
  const uid = `draft-${Date.now()}`;
  const db = getDb();
  const folderPath = getDraftFolder(email);

  db.prepare(
    `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_text, body_html, is_read)
     VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(email, folderPath, uid, subject || '(Taslak)', email, to || '', new Date().toISOString(), (text || '').slice(0, 200), text || null, html || null);
  return { uid, folderPath };
}

function getAllUnreadCounts() {
  const db = getDb();
  try {
    // 1. Hesap bazında gelen kutusu okunmamış sayıları (AccountRail için)
    const accountRows = db.prepare(`
      SELECT a.email,
             SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM messages m
      JOIN accounts a ON a.id = m.account_id
      WHERE upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%'
      GROUP BY a.email
    `).all();

    // 2. Her hesabın her klasöründeki okunmamış sayısı (FolderNav için)
    const folderRows = db.prepare(`
      SELECT a.email, m.folder_path,
             SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM messages m
      JOIN accounts a ON a.id = m.account_id
      GROUP BY a.email, m.folder_path
    `).all();

    // 3. Birleşik gelen kutusu okunmamış sayısı
    const unifiedRow = db.prepare(`
      SELECT SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM messages m
      WHERE upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%'
    `).get();

    const byAccount = {};
    for (const r of accountRows) {
      if (r.email) byAccount[r.email] = r.unread || 0;
    }

    const byFolder = {};
    for (const r of folderRows) {
      if (r.email && r.folder_path) {
        byFolder[`${r.email}:${r.folder_path}`] = r.unread || 0;
        // Küçük harfe normalize edilmiş anahtar (büyük/küçük harf uyumsuzluğunu önler)
        byFolder[`${r.email.toLowerCase()}:${r.folder_path.toLowerCase()}`] = r.unread || 0;
      }
    }

    return {
      byAccount,
      byFolder,
      unified: unifiedRow?.unread || 0,
    };
  } catch (err) {
    console.warn('[db:unreadCounts] Hata:', err?.message);
    return { byAccount: {}, byFolder: {}, unified: 0 };
  }
}

module.exports = { initDb, getDb, getStats, getDbPath, vacuumDb, listAccounts, getAccountById, getAccountByEmail, updateAccount, deleteAccount, updateTokens, addAccount, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, saveMessageBody, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, searchContacts, listContacts, upsertContact, deleteContact, saveSentMessage, saveDraftMessage, getSentFolder, getDraftFolder, listAttachments, saveAttachments, getSetting, setSetting, getAllUnreadCounts };
