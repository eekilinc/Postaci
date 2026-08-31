import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { installSecurity } from '../server/security.js';
import { publicAccount } from '../server/services/secrets.js';
import { account } from './fixtures.js';

const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const port = (server.address() as any).port;
const origin = 'http://127.0.0.1:' + port;
installSecurity(app, port);
app.get('/api/accounts', (_req, res) => res.json([publicAccount(account)]));
app.post('/api/change', (_req, res) => res.json({ success: true }));
app.get('/events', (_req, res) => res.json({ event: 'private' }));
app.get('/api/system/health', (_req, res) => res.json({ status: 'ok' }));
after(() => new Promise<void>(resolve => server.close(() => resolve())));

test('API rejects unauthenticated access', async () => {
  assert.equal((await fetch(origin + '/api/accounts')).status, 401);
});
test('untrusted origins cannot bootstrap a session', async () => {
  assert.equal((await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(origin + '/api/session', { method: 'POST' })).status, 403);
});
test('host checks reject DNS rebinding hosts', async () => {
  const status = await new Promise(resolve => { const req = http.get(origin + '/api/accounts', { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', err => { throw err; }); });
  assert.equal(status, 403);
});
test('local session uses an HttpOnly strict cookie and public accounts exclude secrets', async () => {
  const session = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin } });
  const cookie = session.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const response = await fetch(origin + '/api/accounts', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const [saved] = await response.json();
  assert.equal(saved.hasImapPassword, true);
  assert.equal(saved.imapPassword, undefined);
  assert.equal(saved.oauthRefreshToken, undefined);
  assert.equal(saved.oauthClientSecret, undefined);
  assert.equal((await fetch(origin + '/api/change', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetch(origin + '/api/change', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })).status, 200);
});

test('case and trailing slash variations cannot bypass API or event authentication', async () => {
  for (const route of ['/API/accounts', '/Api/accounts/', '/events/', '/EVENTS', '/EVENTS/']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 401, route);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
  }
  assert.equal((await fetch(origin + '/API/change/', { method: 'POST', headers: { Origin: origin } })).status, 401);
});

test('public health route remains available with Express path variations', async () => {
  for (const route of ['/api/system/health', '/API/SYSTEM/HEALTH/']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
  }
});
