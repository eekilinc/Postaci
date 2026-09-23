// electron/db-schema.ts — Postacı SQLite şemasının Drizzle karşılığı
//
// Faz 1: SADECE şema tanımı + parlama testi. Çalışan `db.cjs`'e dokunulmaz,
// Electron bu dosyayı yüklemez. Amaç: Drizzle tablolarının gerçek DB ile
// birebir aynı olduğunu testle kanıtlamak. Faz 2'de sorgular tek tek taşınır.
//
// Kaynak: electron/db.cjs initDb() + migration bloklarının UZLAŞTIRILMIŞ hali
// (CREATE TABLE + PRAGMA table_info sonrası eklenen sütunlar dahil).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  email: text('email').notNull().unique(),
  display_name: text('display_name'),
  created_at: text('created_at').notNull(),
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

export const folders = sqliteTable('folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  path: text('path').notNull(),
  unread_count: integer('unread_count').notNull().default(0),
  flags: text('flags'),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
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

export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  folder_path: text('folder_path').notNull(),
  msg_uid: text('msg_uid').notNull(),
  idx: integer('idx').notNull(),
  filename: text('filename').notNull(),
  content_type: text('content_type'),
  size: integer('size').notNull().default(0),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  company: text('company'),
  notes: text('notes'),
  is_manual: integer('is_manual').notNull().default(0),
  updated_at: text('updated_at').notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
