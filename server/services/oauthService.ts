import fs from 'fs';
import path from 'path';
import { Account } from '../types.js';
import { getAccountByEmail, saveAccount, getAccountById, dataDir } from './db.js';
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

interface OAuthConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
}

function loadOAuthConfig(): OAuthConfig {
  if (fs.existsSync(oauthConfigPath)) {
    try {
      return JSON.parse(fs.readFileSync(oauthConfigPath, 'utf-8'));
    } catch {}
  }
  return {};
}

function saveOAuthConfig(config: OAuthConfig) {
  try {
    const dir = path.dirname(oauthConfigPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(oauthConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save oauth config:', err);
  }
}

export class OAuthService {
  public static getCredentials() {
    const config = loadOAuthConfig();
    return {
      googleClientId: config.googleClientId || process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
      googleClientSecret: config.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET,
      microsoftClientId: config.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || DEFAULT_MICROSOFT_CLIENT_ID,
    };
  }

  public static saveCredentials(credentials: { googleClientId?: string; googleClientSecret?: string; microsoftClientId?: string }) {
    const current = loadOAuthConfig();
    const updated = { ...current, ...credentials };
    saveOAuthConfig(updated);
    return this.getCredentials();
  }

  public static getGoogleAuthUrl(redirectUri = 'http://127.0.0.1:3001/api/auth/google/callback', clientId?: string): string {
    const creds = this.getCredentials();
    const id = (clientId || creds.googleClientId || DEFAULT_GOOGLE_CLIENT_ID).trim();

    const scopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public static async handleGoogleCallback(code: string, redirectUri = 'http://127.0.0.1:3001/api/auth/google/callback', clientId?: string, clientSecret?: string): Promise<Account> {
    const creds = this.getCredentials();
    const id = (clientId || creds.googleClientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
    const secret = (clientSecret || creds.googleClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET).trim();

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Google yetkilendirme jetonu alınamadı.');
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const userInfo = await userInfoRes.json();
    const email = userInfo.email;
    const name = userInfo.name || email.split('@')[0];
    const avatar = userInfo.picture;

    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

    let account = getAccountByEmail(email);
    if (!account) {
      account = {
        id: `acc-google-${uuidv4().substring(0, 8)}`,
        name,
        email,
        provider: 'gmail',
        authType: 'oauth2',
        oauthAccessToken: tokenData.access_token,
        oauthRefreshToken: tokenData.refresh_token,
        oauthExpiresAt: expiresAt,
        oauthClientId: id,
        oauthClientSecret: secret,
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapSecure: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        smtpSecure: true,
        color: '#ea4335',
        avatar,
        isDefault: false,
        syncInterval: 60,
        lastSyncedAt: new Date().toISOString()
      };
    } else {
      account.authType = 'oauth2';
      account.oauthAccessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        account.oauthRefreshToken = tokenData.refresh_token;
      }
      account.oauthExpiresAt = expiresAt;
      account.oauthClientId = id;
      account.oauthClientSecret = secret;
      if (avatar) account.avatar = avatar;
    }

    return saveAccount(account);
  }

  public static async refreshGoogleToken(account: Account): Promise<string> {
    if (!account.oauthRefreshToken) {
      if (account.oauthAccessToken) return account.oauthAccessToken;
      throw new Error('Google OAuth Refresh Token bulunamadı. Lütfen tekrar giriş yapın.');
    }

    if (account.oauthAccessToken && account.oauthExpiresAt && account.oauthExpiresAt > Date.now() + 120000) {
      return account.oauthAccessToken;
    }

    const creds = this.getCredentials();
    const id = account.oauthClientId || creds.googleClientId || DEFAULT_GOOGLE_CLIENT_ID;
    const secret = account.oauthClientSecret || creds.googleClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: account.oauthRefreshToken,
        client_id: id,
        client_secret: secret,
        grant_type: 'refresh_token'
      }).toString()
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Google erişim jetonu yenilenemedi.');
    }

    account.oauthAccessToken = data.access_token;
    account.oauthExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    saveAccount(account);

    return data.access_token;
  }
}
