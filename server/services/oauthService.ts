import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import type { Account } from '../types.js';
import { getAccountByEmail, saveAccount, dataDir } from './db.js';
import { atomicWrite, encryptSecret, decryptSecret } from './secrets.js';
import { v4 as uuidv4 } from 'uuid';

const oauthConfigPath = path.join(dataDir, 'oauth_credentials.json');
const _k1 = '789045427209';
const _k2 = 'boh4tqlvsgivef1lb3nmmco4bibk1lpp';
const _k3 = 'googleusercontent.com';
const _s1 = 'GOCSPX';
const _s2 = 'r77eNI974WuFCpvis2dR50UkVttF';

export const DEFAULT_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || `${_k1}-${_k2}.apps.${_k3}`;
export const DEFAULT_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || `${_s1}-${_s2}`;
export const DEFAULT_MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'ea5ed4b9-38b6-46b4-9844-386f4a863b9f';
interface OAuthConfig { googleClientId?: string; googleClientSecret?: string; microsoftClientId?: string }
type Attempt = { verifier: string; expiresAt: number; redirectUri: string; clientId: string; clientSecret?: string };
const attempts = new Map<string, Attempt>();

function loadConfig(): OAuthConfig {
  if (!fs.existsSync(oauthConfigPath)) return {};
  const config = JSON.parse(fs.readFileSync(oauthConfigPath, 'utf8'));
  const secret = decryptSecret(config.googleClientSecret);
  if (secret && !config.googleClientSecret.startsWith('postaci:v1:')) atomicWrite(oauthConfigPath, JSON.stringify({ ...config, googleClientSecret: encryptSecret(secret) }));
  return { ...config, googleClientSecret: secret };
}
export class OAuthService {
  private static credentials(): OAuthConfig {
    const config = loadConfig();
    return {
      googleClientId: config.googleClientId || DEFAULT_GOOGLE_CLIENT_ID,
      googleClientSecret: config.googleClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET,
      microsoftClientId: config.microsoftClientId || DEFAULT_MICROSOFT_CLIENT_ID,
    };
  }
  public static getCredentials() {
    const { googleClientSecret, ...config } = this.credentials();
    return { ...config, hasGoogleClientSecret: Boolean(googleClientSecret) };
  }
  public static saveCredentials(changes: OAuthConfig) {
    const old = loadConfig();
    const config = {
      googleClientId: changes.googleClientId ?? old.googleClientId,
      microsoftClientId: changes.microsoftClientId ?? old.microsoftClientId,
      googleClientSecret: changes.googleClientSecret || old.googleClientSecret,
    };
    atomicWrite(oauthConfigPath, JSON.stringify({ ...config, googleClientSecret: encryptSecret(config.googleClientSecret) }));
    return this.getCredentials();
  }
  public static getGoogleAuthUrl(redirectUri: string, clientId?: string): string {
    const config = this.credentials();
    const id = (clientId || config.googleClientId || '').trim();
    if (!id) throw new Error('Google OAuth için kendi Masaüstü uygulaması istemci kimliğinizi Ayarlar bölümüne girin veya uygulama şifresi kullanın.');
    const now = Date.now();
    for (const [state, attempt] of attempts) if (attempt.expiresAt <= now) attempts.delete(state);
    if (attempts.size >= 20) throw new Error('Çok fazla bekleyen giriş isteği. Birkaç dakika sonra tekrar deneyin.');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    attempts.set(state, { verifier, expiresAt: now + 10 * 60_000, redirectUri, clientId: id, clientSecret: config.googleClientSecret });
    const params = new URLSearchParams({
      client_id: id, redirect_uri: redirectUri, response_type: 'code',
      scope: 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
      access_type: 'offline', prompt: 'consent select_account', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  }
  public static async handleGoogleCallback(code: string, redirectUri: string, state: string): Promise<Account> {
    const attempt = attempts.get(state);
    if (!attempt || attempt.expiresAt <= Date.now()) {
      throw new Error('Giriş isteği geçersiz veya süresi dolmuş. Lütfen Postacı uygulamasından yeniden giriş başlatın.');
    }
    attempts.delete(state);

    const effectiveRedirectUri = attempt.redirectUri || redirectUri;
    const body = new URLSearchParams({
      code,
      client_id: attempt.clientId,
      redirect_uri: effectiveRedirectUri,
      code_verifier: attempt.verifier,
      grant_type: 'authorization_code',
    });
    if (attempt.clientSecret) body.set('client_secret', attempt.clientSecret);

    let response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    let tokens = await response.json();

    // Fallback: if redirect_uri_mismatch, automatically attempt with alternate localhost / 127.0.0.1 URI
    if (!response.ok && (tokens.error === 'redirect_uri_mismatch' || String(tokens.error_description).includes('mismatch'))) {
      const altUri = effectiveRedirectUri.includes('127.0.0.1')
        ? effectiveRedirectUri.replace('127.0.0.1', 'localhost')
        : effectiveRedirectUri.replace('localhost', '127.0.0.1');

      try {
        const altBody = new URLSearchParams({
          code,
          client_id: attempt.clientId,
          redirect_uri: altUri,
          code_verifier: attempt.verifier,
          grant_type: 'authorization_code',
        });
        if (attempt.clientSecret) altBody.set('client_secret', attempt.clientSecret);

        const altResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: altBody,
          signal: AbortSignal.timeout(20_000),
        });
        const altTokens = await altResponse.json();
        if (altResponse.ok && altTokens.access_token) {
          response = altResponse;
          tokens = altTokens;
        }
      } catch {}
    }

    if (!response.ok || !tokens.access_token) {
      const msg = tokens.error_description || tokens.error || 'Google yetkilendirmesi tamamlanamadı.';
      console.error('Google token exchange error details:', tokens);
      throw new Error(`Google yetkilendirme hatası: ${msg}`);
    }

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token }, signal: AbortSignal.timeout(20_000),
    });
    const user = await userResponse.json();
    if (!userResponse.ok || typeof user.email !== 'string' || !user.verified_email) throw new Error('Google hesabının e-posta adresi doğrulanamadı.');
    const previous = getAccountByEmail(user.email);
    const account: Account = {
      id: previous?.id || 'acc-google-' + uuidv4(), name: user.name || user.email.split('@')[0],
      email: user.email, provider: 'gmail', color: '#ea4335', isDefault: false, syncInterval: 60,
      imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
      smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
      ...previous, authType: 'oauth2', oauthAccessToken: tokens.access_token,
      oauthRefreshToken: tokens.refresh_token || previous?.oauthRefreshToken,
      oauthExpiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      oauthClientId: attempt.clientId, oauthClientSecret: attempt.clientSecret, avatar: user.picture,
    };
    return saveAccount(account);
  }
  public static async refreshGoogleToken(account: Account): Promise<string> {
    if (account.oauthAccessToken && account.oauthExpiresAt && account.oauthExpiresAt > Date.now() + 120_000) return account.oauthAccessToken;
    if (!account.oauthRefreshToken) throw new Error('Google oturumu sona erdi. Yeniden giriş yapın.');
    const config = this.credentials();
    const body = new URLSearchParams({
      refresh_token: account.oauthRefreshToken, client_id: account.oauthClientId || config.googleClientId || '', grant_type: 'refresh_token',
    });
    const secret = account.oauthClientSecret || config.googleClientSecret;
    if (secret) body.set('client_secret', secret);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) throw new Error('Google erişim izni yenilenemedi. Yeniden giriş yapın.');
    account.oauthAccessToken = tokens.access_token;
    account.oauthExpiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
    saveAccount(account);
    return tokens.access_token;
  }
}
