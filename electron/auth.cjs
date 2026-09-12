// electron/auth.cjs - OAuth 2.0 PKCE akışı (Google / Microsoft / Yahoo)
// Loopback redirect: Google/Microsoft http, Yahoo https (Yahoo http kabul etmez)
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const selfsigned = require('selfsigned');
const { shell, clipboard } = require('electron');

const YAHOO_PORT = 55433;
const YAHOO_REDIRECT = `https://127.0.0.1:${YAHOO_PORT}/callback`;

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'https://mail.google.com/', 'email', 'profile'],
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

function _x(h) {
  if (!h) return '';
  return Buffer.from(h, 'hex').map((b) => b ^ 0x5a).toString('utf8');
}

const DEFAULT_OAUTH_CONFIG = {
  google: {
    clientId: _x('6d62636a6e6f6e686d686a63773835326e2e2b362c293d332c3f3c6b36386934373739356e383338316b362a2a743b2a2a29743d35353d363f2f293f283935342e3f342e74393537'),
    clientSecret: _x('1d1519090a0277186e151f3033322c6b166f09370a2b026f102e186c02352f2b6a3923'),
  },
  microsoft: {
    clientId: _x('3e6f393e6c693e69776f3e623c776e3e69387738636b6e776f3f6c3b3c38636d6f393b63'),
    clientSecret: '',
  },
  yahoo: {
    clientId: _x('3e306a23103731630e37626f000e32113e0d326c3f30141810370b630d0c3e28150d1c1d391f0c090d1d32680f6b3e1c380d1412382036140b0e6a63103417630368632f39690c2e00021020000d142300020b37396903631719006e0a0d0830'),
    clientSecret: _x('6269636e3b6a633e3c6c383b6b686d3e3b3839633f6a3e3c626e6d396e69626239626b6e3e3f6a69'),
  },
};

function loadConfig() {
  let fileConfig = {};
  try {
    // eslint-disable-next-line import/no-dynamic-require
    fileConfig = require('./oauth-config.json');
  } catch {}
  return {
    google: { ...DEFAULT_OAUTH_CONFIG.google, ...fileConfig.google },
    microsoft: { ...DEFAULT_OAUTH_CONFIG.microsoft, ...fileConfig.microsoft },
    yahoo: { ...DEFAULT_OAUTH_CONFIG.yahoo, ...fileConfig.yahoo },
  };
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
      redirectUri = def.fixedRedirect || (provider === 'microsoft'
        ? `http://localhost:${port}`
        : provider === 'google'
        ? `http://127.0.0.1:${port}`
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
      if (provider === 'google') {
        params.set('access_type', 'offline');
        params.set('prompt', 'consent');
      }
      const authUrlWithParams = `${def.authUrl}?${params.toString()}`;
      try {
        if (clipboard && typeof clipboard.writeText === 'function') {
          clipboard.writeText(authUrlWithParams);
        }
      } catch {}
      shell.openExternal(authUrlWithParams);
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
