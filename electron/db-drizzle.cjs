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

const clients = new WeakMap();

function client(db) {
  let dz = clients.get(db);
  if (!dz) {
    dz = drizzle(db, { schema: { settings, accounts } });
    clients.set(db, dz);
  }
  return dz;
}

function settingGet(db, key, defaultValue = null) {
  const rows = client(db).select().from(settings).where(eq(settings.key, key)).all();
  if (rows.length === 0) return defaultValue;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
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

module.exports = { settingGet, settingSet, listAccounts, getAccountById, getAccountByEmail, addAccount, updateAccount, deleteAccount, updateTokens };
