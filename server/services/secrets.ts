import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { dataDir } from './storagePaths.js';

export const secretFields = ['imapPassword', 'smtpPassword', 'oauthAccessToken', 'oauthRefreshToken', 'oauthClientSecret'] as const;
export class CredentialError extends Error {}
const prefix = 'postaci:v1:';
let key: Buffer | undefined;
type Keychain = { encrypt: (value: string) => string; decrypt: (value: string) => string };
const keyPath = path.join(dataDir, 'credentials.key');

export function atomicWrite(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, value, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

function masterKey(): Buffer {
  if (key) return key;
  const keychain = (globalThis as any).__postaciKeychain as Keychain | undefined;
  if (fs.existsSync(keyPath)) {
    const saved = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    if (saved.provider === 'os' && !keychain) throw new Error('İşletim sistemi anahtar kasası açılamadı. Hesaplar değiştirilmedi.');
    key = Buffer.from(saved.provider === 'os' ? keychain!.decrypt(saved.value) : saved.value, 'base64');
    if (key.length !== 32) throw new Error('Geçersiz kimlik bilgisi şifreleme anahtarı.');
    if (saved.provider === 'file' && keychain) atomicWrite(keyPath, JSON.stringify({ provider: 'os', value: keychain.encrypt(key.toString('base64')) }));
  } else {
    key = randomBytes(32);
    atomicWrite(keyPath, JSON.stringify({ provider: keychain ? 'os' : 'file', value: keychain ? keychain.encrypt(key.toString('base64')) : key.toString('base64') }));
  }
  return key;
}

function seal(value: string, encryptionKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function unseal(value: string, encryptionKey: Buffer): string {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 28) throw new Error('Geçersiz şifreli veri.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export function encryptSecret(value?: string | null): string | null {
  if (!value) return null;
  return prefix + seal(value, masterKey());
}
export function decryptSecret(value?: string | null): string | undefined {
  if (!value) return undefined;
  try { return value.startsWith(prefix) ? unseal(value.slice(prefix.length), masterKey()) : value; }
  catch { throw new CredentialError('Saklanan kimlik bilgileri çözülemedi. Anahtar dosyasını ve işletim sistemi kasasını kontrol edin; veriler değiştirilmedi.'); }
}
export function encodeAccount<T extends object>(account: T): T {
  const copy: any = { ...account };
  for (const field of secretFields) copy[field] = encryptSecret(copy[field]);
  return copy;
}
export function decodeAccount<T extends object>(account: T): T {
  const copy: any = { ...account };
  for (const field of secretFields) copy[field] = decryptSecret(copy[field]);
  return copy;
}
export function publicAccount<T extends object>(account: T): T {
  const copy: any = { ...account };
  copy.hasImapPassword = Boolean(copy.imapPassword);
  copy.hasSmtpPassword = Boolean(copy.smtpPassword);
  for (const field of secretFields) delete copy[field];
  delete copy.password;
  return copy;
}
export function encryptBackup(payload: unknown, passphrase: string) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Yedek parolası en az 12 karakter olmalı.');
  const salt = randomBytes(16);
  const backupKey = scryptSync(passphrase, salt, 32);
  return { format: 'postaci-encrypted', version: 1, salt: salt.toString('base64'), data: seal(JSON.stringify(payload), backupKey) };
}
export function decryptBackup(envelope: any, passphrase: string): any {
  if (envelope?.format !== 'postaci-encrypted' || envelope.version !== 1 || typeof envelope.salt !== 'string' || typeof envelope.data !== 'string') throw new Error('Geçersiz şifreli yedek.');
  const salt = Buffer.from(envelope.salt, 'base64');
  if (salt.length !== 16 || typeof passphrase !== 'string') throw new Error('Geçersiz yedek parolası veya dosya.');
  try { return JSON.parse(unseal(envelope.data, scryptSync(passphrase, salt, 32))); }
  catch { throw new Error('Yedek açılamadı. Parola yanlış veya dosya bozuk.'); }
}
