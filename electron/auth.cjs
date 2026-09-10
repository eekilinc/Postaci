// electron/auth.cjs - OAuth 2.0 PKCE akışı (Google / Microsoft / Yahoo)
// Loopback redirect: Google/Microsoft http, Yahoo https (Yahoo http kabul etmez)
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const selfsigned = require('selfsigned');
const { shell } = require('electron');

const YAHOO_PORT = 55433;
const YAHOO_REDIRECT = `https://127.0.0.1:${YAHOO_PORT}/callback`;

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://mail.google.com/', 'email', 'profile'],
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'https://outlook.office.com/IMAP.AccessAsUser.All', 'https://outlook.office.com/SMTP.Send'],
  },
  yahoo: {
    authUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
    scopes: ['openid', 'email', 'profile', 'mail-w'],
    // Yahoo http redirect kabul etmez + URI birebir kayıtlı olmalı.
    // Uygulama kaydına aynen yazılmalı: https://127.0.0.1:55433/callback
    useHttps: true,
    fixedPort: YAHOO_PORT,
    fixedRedirect: YAHOO_REDIRECT,
  },
};

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadConfig() {
  try {
    // Kullanıcı electron/oauth-config.json dosyasına clientId'leri yazar (git'e girmez)
    // eslint-disable-next-line import/no-dynamic-require
    return require('./oauth-config.json');
  } catch {
    return {};
  }
}

async function startOAuthFlow(provider) {
  const def = PROVIDERS[provider];
  if (!def) throw new Error(`Bilinmeyen sağlayıcı: ${provider}`);
  const config = loadConfig()[provider] || {};
  if (!config.clientId) {
    throw new Error(
      `${provider} için Client ID yok. electron/oauth-config.example.json dosyasını kopyalayıp electron/oauth-config.json oluşturun.`,
    );
  }

  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', Buffer.from(verifier)));
  const state = base64url(crypto.randomBytes(16));

  let redirectUri = '';
  const wantsRootPath = provider === 'microsoft'; // Entra: loopback'te kayıtlı URI aynen eşleşmeli
  const { code } = await new Promise((resolve, reject) => {
    const onRequest = (req, res) => {
      const url = new URL(req.url || '/', 'http://x');
      if (url.pathname !== '/' && url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const recvState = url.searchParams.get('state');
      const authCode = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Postac\u0131</h1><p>Giri\u015f tamamland\u0131, uygulamaya d\u00f6nebilirsiniz. Bu pencereyi kapatabilirsiniz.</p>');
      server.close();
      if (err) return reject(new Error(`OAuth hatas\u0131: ${err}`));
      if (recvState !== state) return reject(new Error('State e\u015fle\u015fmedi (CSRF korumas\u0131).'));
      if (!authCode) return reject(new Error('Kod al\u0131namad\u0131.'));
      resolve({ code: authCode });
    };
    let server;
    if (def.useHttps) {
      // Yahoo: https şart. Anlık self-signed sertifika (yalnızca 127.0.0.1).
      const pems = selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
        keySize: 2048,
        days: 2,
        algorithm: 'sha256',
      });
      server = https.createServer({ key: pems.private, cert: pems.cert }, onRequest);
    } else {
      server = http.createServer(onRequest);
    }
    server.on('error', (err) => {
      reject(new Error(`Yerel callback portu açılamadı (${def.fixedPort || 'otomatik'}): ${err.message}`));
    });
    server.listen(def.fixedPort || 0, '127.0.0.1', () => {
      const port = server.address().port;
      redirectUri = def.fixedRedirect || (wantsRootPath
        ? `http://localhost:${port}`
        : `http://127.0.0.1:${port}/callback`);
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: def.scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      shell.openExternal(`${def.authUrl}?${params.toString()}`);
    });
    // Timeout: 5 dk
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth zaman a\u015f\u0131m\u0131 (5 dk).'));
    }, 5 * 60 * 1000).unref?.();
  });

  return exchangeCode(provider, code, redirectUri, verifier);
}

async function exchangeCode(provider, code, redirectUri, verifier) {
  const def = PROVIDERS[provider];
  const config = loadConfig()[provider] || {};
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  const res = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Token alınamadı (${provider}, ${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

module.exports = { PROVIDERS, startOAuthFlow, exchangeCode, loadConfig };
