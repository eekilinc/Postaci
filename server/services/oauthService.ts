import { Account } from '../types.js';
import { getAccountByEmail, saveAccount, getAccountById } from './db.js';
import { v4 as uuidv4 } from 'uuid';

// Default OAuth Client Configuration (Can be overridden via Settings or ENV)
export const DEFAULT_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '1085352668541-p10d65b70741m0p8k292i4iirrv52qgl.apps.googleusercontent.com';
export const DEFAULT_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export const DEFAULT_MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'ea5ed4b9-38b6-46b4-9844-386f4a863b9f';

export class OAuthService {
  public static getGoogleAuthUrl(redirectUri = 'http://127.0.0.1:3001/api/auth/google/callback', clientId?: string): string {
    const id = clientId || DEFAULT_GOOGLE_CLIENT_ID;
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
    const id = clientId || DEFAULT_GOOGLE_CLIENT_ID;
    const secret = clientSecret || DEFAULT_GOOGLE_CLIENT_SECRET;

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

    // If existing token has more than 2 minutes left, reuse it
    if (account.oauthAccessToken && account.oauthExpiresAt && account.oauthExpiresAt > Date.now() + 120000) {
      return account.oauthAccessToken;
    }

    const id = account.oauthClientId || DEFAULT_GOOGLE_CLIENT_ID;
    const secret = account.oauthClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET;

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
