// electron/token-auth.cjs - token yenileme + sifreleme yardimcilari (main.cjs'ten tasindi)
const { safeStorage } = require('electron');
const { getAccountByEmail, getAccountById, updateTokens } = require('./db.cjs');
const { refreshAccessToken, invalidateClient, isAuthFailed } = require('./mail.cjs');

function enc(text) {
  if (!text) return null;
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(text, 'utf8').toString('base64');
  return safeStorage.encryptString(text).toString('base64');
}

function dec(b64) {
  if (!b64) return null;
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(b64, 'base64').toString('utf8');
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
}

const _tokenRefreshPromises = new Map(); // email -> Promise<accessToken>

async function freshAccessToken(account, forceRefresh = false) {
  const key = (account.email || '').toLowerCase().trim();

  // Halihazırda bu hesap için bir yenileme isteği devam ediyorsa onu bekle
  if (_tokenRefreshPromises.has(key)) {
    return _tokenRefreshPromises.get(key);
  }

  const existing = dec(account.access_token_enc);
  if (!forceRefresh && existing && account.token_expiry) {
    const expiresAt = new Date(account.token_expiry).getTime();
    if (Date.now() < expiresAt - 2 * 60 * 1000) {
      return existing;
    }
  }

  // Token süresi dolmuş veya zorunlu yenileme — tekil promise ile yenile
  const refreshTask = (async () => {
    const latestAcc = getAccountByEmail(account.email) || account;
    const refreshToken = dec(latestAcc.refresh_token_enc);
    if (!refreshToken) throw new Error('Refresh token yok, hesabı yeniden bağlayın.');

    try {
      const tokens = await refreshAccessToken(account.provider, refreshToken);
      const expiry = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;
      updateTokens(account.email, {
        refreshTokenEnc: enc(tokens.refresh_token || refreshToken),
        accessTokenEnc: enc(tokens.access_token),
        tokenExpiry: expiry,
      });
      return tokens.access_token;
    } catch (e) {
      const isStillValid = existing && account.token_expiry && (Date.now() < new Date(account.token_expiry).getTime());
      if (isStillValid) {
        console.warn(`[token] Yenileme başarısız (${e?.message}), mevcut geçerli token deneniyor.`);
        return existing;
      }
      throw new Error(`Token yenilenemedi: ${e?.message || e}. İnternet bağlantınızı kontrol edin veya hesabı yeniden bağlayın.`);
    } finally {
      _tokenRefreshPromises.delete(key);
    }
  })();

  _tokenRefreshPromises.set(key, refreshTask);
  return refreshTask;
}

// Hesap türüne göre bağlantı bilgileri: { accessToken } ya da { password, imapHost, imapPort }
async function freshCredentials(account, forceRefresh = false) {
  if (account.auth_type === 'password') {
    let passwordEnc = account.password_enc;
    if (!passwordEnc) {
      const fullAcc = (account.id ? getAccountById(account.id) : null) || getAccountByEmail(account.email);
      if (fullAcc?.password_enc) passwordEnc = fullAcc.password_enc;
    }
    const password = dec(passwordEnc);
    if (!password) throw new Error('Kayıtlı şifre yok, hesabı yeniden ekleyin.');
    return { password, imapHost: account.imap_host, imapPort: account.imap_port };
  }
  return { accessToken: await freshAccessToken(account, forceRefresh) };
}

// isAuthFailed electron/mail.cjs dosyasından aktarılmıştır (authenticationFailed ve oauthError kontrolleri dahil)

// Ölü önbellek access token durumu: yerel token'ı sil, refresh ile zorla yenile, işi bir kez daha dene.
// Hesap ekleme akışına dokunmaz; yalnızca mevcut kaydın token'ını tazeler.
async function withAuthRetry(acc, doWork) {
  const email = acc.email;
  try {
    return await doWork(await freshCredentials(acc));
  } catch (e) {
    if (acc.auth_type === 'password' || !isAuthFailed(e)) throw e;
    console.log(`[auth-retry] ${email}: sunucu kimliği reddetti, access token yenilenip tekrar denenecek...`);
    try { invalidateClient(email); } catch {}
    const latest = getAccountByEmail(email) || acc;
    if (!latest.refresh_token_enc) throw e; // Yenileyecek token yok — gerçekten yeniden bağlanmalı
    updateTokens(email, { refreshTokenEnc: latest.refresh_token_enc, accessTokenEnc: null, tokenExpiry: null });
    try { _tokenRefreshPromises.delete((email || '').toLowerCase().trim()); } catch {}
    const creds = await freshCredentials(getAccountByEmail(email) || latest, true);
    return await doWork(creds);
  }
}


module.exports = { enc, dec, freshAccessToken, freshCredentials, withAuthRetry, _tokenRefreshPromises };
