// electron/db-drizzle.cjs - Drizzle destekli sorgu yardımcıları (Faz 2)
//
// db.cjs'teki ham SQL fonksiyonları buraya tek tek taşınır. Kurallar:
// - Ham `db` handle dışarıdan alınır (döngüsel require yok).
// - Tablo tanımları electron/db-schema.ts ile AYNI ad/sütunlarda tutulur;
//   parlama testi (db-schema.test.ts) sapmayı yakalar.
// - Davranış birebir korunur (JSON serileştirme dahil).
const { eq, sql } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { integer, text, sqliteTable } = require('drizzle-orm/sqlite-core');

const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  email: text('email').notNull().unique(),
  display_name: text('display_name'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  refresh_token_enc: text('refresh_token_enc'),
  access_token_enc: text('access_token_enc'),
  token_expiry: text('token_expiry'),
  auth_type: text('auth_type').notNull().default('oauth'),
  imap_host: text('imap_host'),
  imap_port: integer('imap_port'),
  smtp_host: text('smtp_host'),
  smtp_port: integer('smtp_port'),
  smtp_secure: integer('smtp_secure'),
  password_enc: text('password_enc'),
});

const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull(),
  folder_path: text('folder_path').notNull(),
  uid: text('uid').notNull(),
  subject: text('subject'),
  from_addr: text('from_addr'),
  to_addr: text('to_addr'),
  date: text('date'),
  snippet: text('snippet'),
  body_html: text('body_html'),
  body_text: text('body_text'),
  is_read: integer('is_read').notNull().default(0),
  message_id: text('message_id'),
  refs: text('refs'),
  starred: integer('starred').notNull().default(0),
  has_att: integer('has_att').notNull().default(0),
});

const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull(),
  folder_path: text('folder_path').notNull(),
  msg_uid: text('msg_uid').notNull(),
  idx: integer('idx').notNull(),
  filename: text('filename').notNull(),
  content_type: text('content_type'),
  size: integer('size').notNull().default(0),
});

const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  company: text('company'),
  notes: text('notes'),
  is_manual: integer('is_manual').notNull().default(0),
  updated_at: text('updated_at').notNull(),
});

const clients = new WeakMap();

function client(db) {
  let dz = clients.get(db);
  if (!dz) {
    dz = drizzle(db, { schema: { settings, accounts, messages, attachments, contacts } });
    clients.set(db, dz);
  }
  return dz;
}

function settingGet(db, key, defaultValue = null) {
  const rows = client(db).select().from(settings).where(eq(settings.key, key)).all();
  if (rows.length === 0) return defaultValue;
  let parsed;
  try {
    parsed = JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
  // Kayıtlı ayar nesnesini varsayılanlarla BİRLEŞTİR.
  // Aksi halde eski sürümden kalan eksik anahtarlar sessizce kayboluyor:
  // örn. `syncIntervalMinutes` yoksa runBackgroundSync her turda erken dönüyor
  // (arka plan senkronu hiç çalışmıyor) ama updateBackgroundSyncSchedule
  // "devrede" logu basıyor. `notificationsEnabled` yoksa tüm bildirimler
  // sessizce kapanıyor. Eksik anahtarların default'tan gelmesi şart.
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    defaultValue &&
    typeof defaultValue === 'object' &&
    !Array.isArray(defaultValue)
  ) {
    return { ...defaultValue, ...parsed };
  }
  return parsed;
}

function settingSet(db, key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  client(db)
    .insert(settings)
    .values({ key, value: str })
    .onConflictDoUpdate({ target: settings.key, set: { value: str } })
    .run();
}

// --- accounts (Faz 2: db.cjs'ten taşındı) ---

const ACCOUNT_PUBLIC_COLUMNS = {
  id: accounts.id,
  provider: accounts.provider,
  email: accounts.email,
  display_name: accounts.display_name,
  auth_type: accounts.auth_type,
  imap_host: accounts.imap_host,
  imap_port: accounts.imap_port,
  smtp_host: accounts.smtp_host,
  smtp_port: accounts.smtp_port,
  smtp_secure: accounts.smtp_secure,
  created_at: accounts.created_at,
};

function listAccounts(db) {
  return client(db).select(ACCOUNT_PUBLIC_COLUMNS).from(accounts).orderBy(accounts.id).all();
}

function getAccountById(db, id) {
  return client(db).select().from(accounts).where(eq(accounts.id, id)).get();
}

function getAccountByEmail(db, email) {
  if (!email) return null;
  const trimmed = String(email).trim();
  return (
    client(db).select().from(accounts).where(sql`${accounts.email} = ${trimmed} COLLATE NOCASE`).get() ||
    client(db).select().from(accounts).where(eq(accounts.email, trimmed)).get() ||
    null
  );
}

function addAccount(db, { provider, email, displayName, refreshTokenEnc, accessTokenEnc, tokenExpiry, authType, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, passwordEnc }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const existing = getAccountByEmail(db, cleanEmail);
  const targetEmail = existing ? existing.email : cleanEmail;
  const row = client(db)
    .insert(accounts)
    .values({
      provider,
      email: targetEmail,
      display_name: displayName || null,
      refresh_token_enc: refreshTokenEnc || null,
      access_token_enc: accessTokenEnc || null,
      token_expiry: tokenExpiry || null,
      auth_type: authType || 'oauth',
      imap_host: imapHost || null,
      imap_port: imapPort || null,
      smtp_host: smtpHost || null,
      smtp_port: smtpPort || null,
      smtp_secure: smtpSecure == null ? null : smtpSecure ? 1 : 0,
      password_enc: passwordEnc || null,
    })
    .onConflictDoUpdate({
      target: accounts.email,
      set: {
        provider: sql`coalesce(excluded.provider, ${accounts.provider})`,
        display_name: sql`coalesce(excluded.display_name, ${accounts.display_name})`,
        refresh_token_enc: sql`coalesce(excluded.refresh_token_enc, ${accounts.refresh_token_enc})`,
        access_token_enc: sql`coalesce(excluded.access_token_enc, ${accounts.access_token_enc})`,
        token_expiry: sql`coalesce(excluded.token_expiry, ${accounts.token_expiry})`,
        auth_type: sql`coalesce(excluded.auth_type, ${accounts.auth_type})`,
        imap_host: sql`coalesce(excluded.imap_host, ${accounts.imap_host})`,
        imap_port: sql`coalesce(excluded.imap_port, ${accounts.imap_port})`,
        smtp_host: sql`coalesce(excluded.smtp_host, ${accounts.smtp_host})`,
        smtp_port: sql`coalesce(excluded.smtp_port, ${accounts.smtp_port})`,
        smtp_secure: sql`coalesce(excluded.smtp_secure, ${accounts.smtp_secure})`,
        password_enc: sql`coalesce(excluded.password_enc, ${accounts.password_enc})`,
      },
    })
    .run();
  return row.lastInsertRowid;
}

function updateAccount(db, id, { displayName, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, passwordEnc }) {
  const sets = {};
  if (displayName !== undefined) sets.display_name = displayName || null;
  if (imapHost !== undefined) sets.imap_host = imapHost || null;
  if (imapPort !== undefined) sets.imap_port = imapPort ? Number(imapPort) : null;
  if (smtpHost !== undefined) sets.smtp_host = smtpHost || null;
  if (smtpPort !== undefined) sets.smtp_port = smtpPort ? Number(smtpPort) : null;
  if (smtpSecure !== undefined) sets.smtp_secure = smtpSecure ? 1 : 0;
  if (passwordEnc !== undefined) sets.password_enc = passwordEnc;
  if (Object.keys(sets).length === 0) return true;
  client(db).update(accounts).set(sets).where(eq(accounts.id, id)).run();
  return true;
}

function deleteAccount(db, id) {
  client(db).delete(accounts).where(eq(accounts.id, id)).run();
  return true;
}

function updateTokens(db, email, { refreshTokenEnc, accessTokenEnc, tokenExpiry }) {
  const e = (email || '').trim();
  client(db)
    .update(accounts)
    .set({ refresh_token_enc: refreshTokenEnc, access_token_enc: accessTokenEnc, token_expiry: tokenExpiry })
    .where(sql`${accounts.email} = ${e} COLLATE NOCASE`)
    .run();
}


// --- messages & attachments (Faz 2) ---

function _accountIdByEmail(db, email) {
  return client(db).select({ id: accounts.id }).from(accounts).where(sql`${accounts.email} = ${email} COLLATE NOCASE`).get();
}

// ── Okunmamış sayacı (folders.unread_count) bakımı ──────────────────────────
// folders.unread_count, sunucudan IMAP STATUS ile gelen gerçek değerin ÜZERİNE
// yerel okundu/okunmadı değişikliklerinin ARTMALI olarak yansıtıldığı bir
// sayacıdır. Önceden okundu/okunmadı bu alana HİÇ dokunmuyordu -> bir e-postayı
// okuduğunda rozet ANINDA düşmüyordu. Buna karşılık silme/taşıma handler'ları
// unread_count'u yerel alt kümenin sayısıyla EZİYORDU (900 okunmamış → 50).
// Kural: sunucu STATUS değerini yazar (mail.cjs), yerel işlemler delta uygular.
function adjustFolderUnread(db, email, folderPath, delta) {
  if (!delta || !folderPath) return;
  try {
    db.prepare(
      `UPDATE folders
       SET unread_count = MAX(0, COALESCE(unread_count, 0) + ?)
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
         AND (path = ? COLLATE NOCASE OR ltr(path) = ltr(?))`
    ).run(delta, email, folderPath, folderPath);
  } catch (e) {
    // Sayaç güncellenemezse rozet bir sonraki sunucu senkronunda düzelir
    console.warn('[unread] klasör sayacı güncellenemedi:', e?.message);
  }
}

function setReadState(db, email, folderPath, uid, nextIsRead) {
  const prev = client(db).select({ is_read: messages.is_read }).from(messages)
    .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .get();
  const wasRead = prev ? !!prev.is_read : null;
  client(db).update(messages).set({ is_read: nextIsRead ? 1 : 0 })
    .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .run();
  // Gerçekten durum değiştiyse sayacı güncelle (ayni duruma tekrar yazma etkisiz)
  if (wasRead !== null && wasRead !== !!nextIsRead) {
    adjustFolderUnread(db, email, folderPath, nextIsRead ? -1 : 1);
  }
}

function markReadDb(db, email, folderPath, uid) {
  setReadState(db, email, folderPath, uid, true);
}

function markUnreadDb(db, email, folderPath, uid) {
  setReadState(db, email, folderPath, uid, false);
}

function toggleStarDb(db, email, folderPath, uid) {
  const row = client(db).select({ starred: messages.starred }).from(messages)
    .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .get();
  const next = row && row.starred ? 0 : 1;
  client(db).update(messages).set({ starred: next })
    .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .run();
  return next;
}

function batchMarkReadDb(db, email, folderPath, uids, isRead = 1) {
  const list = uids || [];
  const trans = db.transaction((arr) => {
    let delta = 0;
    for (const uid of arr) {
      const prev = client(db).select({ is_read: messages.is_read }).from(messages)
        .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
        .get();
      const wasRead = prev ? !!prev.is_read : null;
      client(db).update(messages).set({ is_read: isRead ? 1 : 0 })
        .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
        .run();
      // Yalnızca GERÇEKTEN durum değişen iletiler sayacı etkiler
      if (wasRead !== null && wasRead !== !!isRead) delta += isRead ? -1 : 1;
    }
    return delta;
  });
  const delta = trans(list);
  if (delta) adjustFolderUnread(db, email, folderPath, delta);
}

function batchToggleStarDb(db, email, folderPath, uids, starred = 1) {
  const trans = db.transaction((list) => {
    for (const uid of list || []) {
    client(db).update(messages).set({ starred: starred ? 1 : 0 })
      .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
      .run();
    }
  });
  trans(uids);
}

function getMessageBody(db, email, folderPath, uid) {
  let row = client(db)
    .select({ body_html: messages.body_html, body_text: messages.body_text, message_id: messages.message_id, refs: messages.refs })
    .from(messages)
    .innerJoin(accounts, eq(messages.account_id, accounts.id))
    .where(sql`${accounts.email}=${email} COLLATE NOCASE AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .get();
  if (!row) {
    row = client(db)
      .select({ body_html: messages.body_html, body_text: messages.body_text, message_id: messages.message_id, refs: messages.refs })
      .from(messages)
      .innerJoin(accounts, eq(messages.account_id, accounts.id))
      .where(sql`${accounts.email}=${email} COLLATE NOCASE AND ${messages.uid}=${String(uid)}`)
      .get();
  }
  if (!row) return row;
  return { ...row, references: row.refs ? row.refs.split(' ') : [] };
}

function saveMessageBody(db, email, folderPath, uid, { html, text, messageId, references }) {
  client(db).update(messages)
    .set({
      body_html: html || null,
      body_text: text || null,
      message_id: sql`coalesce(${messageId || null}, ${messages.message_id})`,
      refs: sql`coalesce(${references?.length ? references.join(' ') : null}, ${messages.refs})`,
    })
    .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
    .run();
}

function listAttachments(db, email, folderPath, uid) {
  return client(db)
    .select({ idx: attachments.idx, filename: attachments.filename, content_type: attachments.content_type, size: attachments.size })
    .from(attachments)
    .innerJoin(accounts, eq(attachments.account_id, accounts.id))
    .where(sql`${accounts.email}=${email} COLLATE NOCASE AND ${attachments.folder_path}=${folderPath} AND ${attachments.msg_uid}=${String(uid)}`)
    .orderBy(attachments.idx)
    .all();
}

function saveAttachments(db, email, folderPath, uid, list) {
  client(db).delete(attachments)
    .where(sql`${attachments.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${attachments.folder_path}=${folderPath} AND ${attachments.msg_uid}=${String(uid)}`)
    .run();
  const accRow = _accountIdByEmail(db, email);
  if (!accRow) return;
  const txn = db.transaction(() => {
    const rows = (list || []).map((a, i) => ({ account_id: accRow.id, folder_path: folderPath, msg_uid: String(uid), idx: i, filename: a.filename, content_type: a.contentType || null, size: a.size || 0 }));
    for (const r of rows) client(db).insert(attachments).values(r).run();
    if (rows.length > 0) {
      try {
        client(db).update(messages).set({ has_att: 1 })
          .where(sql`${messages.account_id}=(SELECT id FROM accounts WHERE email=${email} COLLATE NOCASE) AND ${messages.folder_path}=${folderPath} AND ${messages.uid}=${String(uid)}`)
          .run();
      } catch {}
    }
  });
  txn();
}

// --- contacts (Faz 2) ---

function listContacts(db, query = '') {
  try {
    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      return client(db).select().from(contacts)
        .where(sql`lower(coalesce(${contacts.name}, '')) LIKE ${q} OR lower(${contacts.email}) LIKE ${q} OR lower(coalesce(${contacts.company}, '')) LIKE ${q}`)
        .orderBy(sql`${contacts.is_manual} DESC, ${contacts.updated_at} DESC, coalesce(${contacts.name}, ${contacts.email}) ASC`)
        .limit(150).all();
    }
    return client(db).select().from(contacts)
      .orderBy(sql`${contacts.is_manual} DESC, ${contacts.updated_at} DESC, coalesce(${contacts.name}, ${contacts.email}) ASC`)
      .limit(250).all();
  } catch (err) {
    console.error('[db:listContacts] Hata:', err);
    return [];
  }
}

function upsertContact(db, { id, email, name, phone, company, notes }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Geçerli bir e-posta adresi zorunludur.');
  const cleanName = (name || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanCompany = (company || '').trim();
  const cleanNotes = (notes || '').trim();
  if (id) {
    client(db).update(contacts)
      .set({ email: cleanEmail, name: cleanName || null, phone: cleanPhone || null, company: cleanCompany || null, notes: cleanNotes || null, is_manual: 1, updated_at: sql`datetime('now')` })
      .where(eq(contacts.id, Number(id))).run();
    return client(db).select().from(contacts).where(eq(contacts.id, Number(id))).get();
  }
  const res = client(db).insert(contacts)
    .values({ email: cleanEmail, name: cleanName || null, phone: cleanPhone || null, company: cleanCompany || null, notes: cleanNotes || null, is_manual: 1, updated_at: sql`datetime('now')` })
    .onConflictDoUpdate({ target: contacts.email, set: { name: sql`excluded.name`, phone: sql`excluded.phone`, company: sql`excluded.company`, notes: sql`excluded.notes`, is_manual: 1, updated_at: sql`datetime('now')` } })
    .run();
  return client(db).select().from(contacts).where(eq(contacts.id, Number(res.lastInsertRowid))).get()
    || client(db).select().from(contacts).where(eq(contacts.email, cleanEmail)).get();
}

function deleteContact(db, id) {
  try {
    client(db).delete(contacts).where(eq(contacts.id, Number(id))).run();
    return true;
  } catch (err) {
    console.error('[db:deleteContact] Hata:', err);
    return false;
  }
}

function searchContacts(db, query, limit = 8) {
  if (!query || typeof query !== 'string' || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const results = [];
  const seen = new Set();
  try {
    const contactRows = client(db).select({ id: contacts.id, email: contacts.email, name: contacts.name, phone: contacts.phone, company: contacts.company })
      .from(contacts)
      .where(sql`lower(coalesce(${contacts.name}, '')) LIKE ${'%' + q + '%'} OR lower(${contacts.email}) LIKE ${'%' + q + '%'}`)
      .orderBy(sql`${contacts.is_manual} DESC, ${contacts.updated_at} DESC`)
      .limit(limit).all();
    for (const c of contactRows) {
      if (!c.email) continue;
      seen.add(c.email.toLowerCase());
      results.push({ id: c.id, name: c.name || c.email.split('@')[0], email: c.email });
      if (results.length >= limit) return results;
    }
  } catch {}
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
        if (match) { name = (match[1] || '').trim(); email = (match[2] || '').trim().toLowerCase(); }
        else if (clean.includes('@')) { email = clean.toLowerCase(); }
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


module.exports = { settingGet, settingSet, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, adjustFolderUnread, getMessageBody, saveMessageBody, listAttachments, saveAttachments, listContacts, upsertContact, deleteContact, searchContacts, listAccounts, getAccountById, getAccountByEmail, addAccount, updateAccount, deleteAccount, updateTokens };
