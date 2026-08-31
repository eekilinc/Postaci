import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { listenLoopback, boundPort } from '../server/listener.js';
import { installSecurity } from '../server/security.js';
import { createRequire } from 'node:module';
const { describeStartupError } = createRequire(import.meta.url)('../desktop/startup.cjs');

test('dynamic loopback port supports authenticated requests and rejects foreign origins', async () => {
  const app = express();
  const server = createServer(app);
  installSecurity(app, () => boundPort(server));
  app.get('/api/test', (_req, res) => res.json({ ok: true }));
  const address = await listenLoopback(server, 0);
  try {
    assert.ok(address.port > 0);
    assert.equal((server.address() as any).address, '127.0.0.1');
    assert.equal((await fetch(address.origin + '/api/test')).status, 401);
    const session = await fetch(address.origin + '/api/session', { method: 'POST', headers: { Origin: address.origin } });
    assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(address.origin + '/api/test', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(address.origin + '/api/test', { headers: { Origin: 'http://127.0.0.1:0', Cookie: cookie } })).status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('occupied ports reject startup and never attach to the existing server', async () => {
  const existing = createServer((_req, res) => res.end('other application'));
  const address = await listenLoopback(existing, 0);
  const conflicting = createServer();
  try {
    await assert.rejects(listenLoopback(conflicting, address.port), (error: any) => ['EADDRINUSE', 'EACCES'].includes(error.code));
    assert.equal(await (await fetch(address.origin)).text(), 'other application');
    const own = await listenLoopback(conflicting, 0);
    assert.notEqual(own.port, address.port);
  } finally {
    await new Promise<void>(resolve => existing.close(() => resolve()));
    if (conflicting.listening) await new Promise<void>(resolve => conflicting.close(() => resolve()));
  }
});

test('invalid ports fail immediately and startup details retain the underlying cause', async () => {
  await assert.rejects(listenLoopback(createServer(), Number.NaN), /Geçersiz/);
  const cause = Object.assign(new Error('listen denied'), { code: 'EACCES' });
  const error = new Error('Sunucu açılamadı', { cause });
  assert.match(describeStartupError(error), /EACCES: listen denied/);
});
