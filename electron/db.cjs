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
  return require('./db-drizzle.cjs').listAccounts(getDb());
}

function getAccountById(id) {
  return require('./db-drizzle.cjs').getAccountById(getDb(), id);
}

function getAccountByEmail(email) {
  return require('./db-drizzle.cjs').getAccountByEmail(getDb(), email);
}

function updateAccount(id, updates) {
  return require('./db-drizzle.cjs').updateAccount(getDb(), id, updates);
}

function deleteAccount(id) {
  return require('./db-drizzle.cjs').deleteAccount(getDb(), id);
}

function updateTokens(email, tokens) {
  return require('./db-drizzle.cjs').updateTokens(getDb(), email, tokens);
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
  return require('./db-drizzle.cjs').getMessageBody(getDb(), email, folderPath, uid);
}

function saveMessageBody(email, folderPath, uid, { html, text, messageId, references }) {
  return require('./db-drizzle.cjs').saveMessageBody(getDb(), email, folderPath, uid, { html, text, messageId, references });
}

function listAttachments(email, folderPath, uid) {
  return require('./db-drizzle.cjs').listAttachments(getDb(), email, folderPath, uid);
}

function saveAttachments(email, folderPath, uid, list) {
  return require('./db-drizzle.cjs').saveAttachments(getDb(), email, folderPath, uid, list);
}

function markReadDb(email, folderPath, uid) {
  return require('./db-drizzle.cjs').markReadDb(getDb(), email, folderPath, uid);
}

function markUnreadDb(email, folderPath, uid) {
  return require('./db-drizzle.cjs').markUnreadDb(getDb(), email, folderPath, uid);
}

function toggleStarDb(email, folderPath, uid) {
  return require('./db-drizzle.cjs').toggleStarDb(getDb(), email, folderPath, uid);
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

function addAccount(acc) {
  return require('./db-drizzle.cjs').addAccount(getDb(), acc);
}

function getSetting(key, defaultValue = null) {
  return require('./db-drizzle.cjs').settingGet(getDb(), key, defaultValue);
}

function setSetting(key, value) {
  require('./db-drizzle.cjs').settingSet(getDb(), key, value);
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
  try {
    const db = getDb();
    const count = db.prepare('SELECT count(*) as count FROM contacts').get()?.count || 0;
    if (count === 0) {
      syncContactsFromMessages();
    }
  } catch {}
  return require('./db-drizzle.cjs').listContacts(getDb(), query);
}

function upsertContact(c) {
  return require('./db-drizzle.cjs').upsertContact(getDb(), c);
}

function deleteContact(id) {
  return require('./db-drizzle.cjs').deleteContact(getDb(), id);
}

function searchContacts(query, limit = 8) {
  return require('./db-drizzle.cjs').searchContacts(getDb(), query, limit);
}

function batchMarkReadDb(email, folderPath, uids, isRead = 1) {
  return require('./db-drizzle.cjs').batchMarkReadDb(getDb(), email, folderPath, uids, isRead);
}

function batchToggleStarDb(email, folderPath, uids, starred = 1) {
  return require('./db-drizzle.cjs').batchToggleStarDb(getDb(), email, folderPath, uids, starred);
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
             COALESCE(SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END), 0) as unread
      FROM accounts a
      LEFT JOIN messages m ON m.account_id = a.id AND (upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%')
      GROUP BY a.email
    `).all();

    // 2. Her hesabın her klasöründeki okunmamış sayısı (FolderNav için)
    // Tüm kayıtlı klasörleri baz al — böylece içi boş veya okunmamış iletisi kalmayan klasörler de kesinlikle 0 döner!
    const folderRows = db.prepare(`
      SELECT a.email, f.path AS folder_path,
             COALESCE((
               SELECT SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END)
               FROM messages m
               WHERE m.account_id = f.account_id AND lower(m.folder_path) = lower(f.path)
             ), 0) AS unread
      FROM folders f
      JOIN accounts a ON a.id = f.account_id
    `).all();

    // folders tablosunda henüz kaydı bulunmayan ancak messages tablosunda yer alan klasörleri de kapsa
    const extraFolderRows = db.prepare(`
      SELECT a.email, m.folder_path,
             COALESCE(SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END), 0) as unread
      FROM messages m
      JOIN accounts a ON a.id = m.account_id
      WHERE lower(m.folder_path) NOT IN (SELECT lower(path) FROM folders WHERE account_id = m.account_id)
      GROUP BY a.email, m.folder_path
    `).all();

    // 3. Birleşik gelen kutusu okunmamış sayısı
    const unifiedRow = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END), 0) as unread
      FROM messages m
      WHERE upper(m.folder_path) = 'INBOX' OR lower(m.folder_path) LIKE '%gelen%'
    `).get();

    const byAccount = {};
    for (const r of accountRows) {
      if (r.email) byAccount[r.email] = r.unread || 0;
    }

    const byFolder = {};
    for (const r of [...folderRows, ...extraFolderRows]) {
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
