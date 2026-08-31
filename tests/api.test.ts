import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { account, email } from './fixtures.js';
const socket = net.createServer();
socket.listen(0, '127.0.0.1');
await new Promise<void>(resolve => socket.once('listening', resolve));
const port = (socket.address() as any).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const origin = 'http://127.0.0.1:' + port;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-api-'));
const args = process.env.POSTACI_TEST_BUNDLE === '1' ? ['dist/server/index.cjs'] : ['--import', 'tsx', 'server/index.ts'];
const child = spawn(process.execPath, args, {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), POSTACI_DATA_DIR: directory, POSTACI_SEED_DEMO: '0', NODE_ENV: 'production' }, stdio: 'pipe',
});
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
after(async () => { child.kill(); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); });
let ready = false;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(origin + '/api/system/health')).ok) { ready = true; break; } } catch {}
  await delay(50);
}
assert.ok(ready, 'API did not start: ' + output);
const session = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin } });
const cookie = session.headers.get('set-cookie')!.split(';')[0];
const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };
const request = (route: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) =>
  fetch(origin + '/api' + route, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('API exposes only public account data after create and edit', async () => {
  const created = await request('/accounts', 'POST', account);
  assert.equal(created.status, 201);
  assert.ok(!(await created.text()).includes('fixture-password'));
  const updated = await request('/accounts/' + account.id, 'PUT', { name: 'Edited', imapPassword: '', smtpPassword: '' });
  assert.equal(updated.status, 200);
  const value = await updated.json(); assert.equal(value.hasImapPassword, true);
  assert.equal(value.oauthRefreshToken, undefined);
});
test('API imports and paginates a synthetic mailbox', async () => {
  const imported = await request('/backup/import', 'POST', { backup: { version: 2, accounts: [account], emails: Array.from({ length: 205 }, (_, i) => email(i)) } });
  assert.equal(imported.status, 200, await imported.text());
  const page = await (await request('/emails?limit=100&offset=200')).json();
  assert.equal(page.items.length, 5); assert.equal(page.hasMore, false); assert.equal(page.nextOffset, 205);
});
test('API exports encrypted data and rejects the wrong password', async () => {
  const exported = await request('/backup/export', 'POST', { passphrase: 'fixture-passphrase' });
  assert.equal(exported.status, 200);
  const encrypted = await exported.json(); assert.equal(encrypted.format, 'postaci-encrypted');
  assert.ok(!JSON.stringify(encrypted).includes('fixture-password'));
  const invalid = await request('/backup/import', 'POST', { backup: encrypted, passphrase: 'wrong-passphrase' });
  assert.equal(invalid.status, 400);
});
test('demo sends are idempotent and never use an external mail service', async () => {
  const payload = { accountId: account.id, to: [{ name: 'Synthetic', email: 'synthetic@example.test' }], subject: 'Demo only', bodyText: 'Demo', bodyHtml: '<p>Demo</p>' };
  const first = await request('/send', 'POST', payload, { 'Idempotency-Key': 'integration-send-1234' });
  assert.equal(first.status, 201, await first.clone().text());
  const second = await request('/send', 'POST', payload, { 'Idempotency-Key': 'integration-send-1234' });
  assert.equal((await first.json()).id, (await second.json()).id);
  const sent = await (await request('/emails?folder=SENT')).json();
  assert.equal(sent.items.length, 1);
});
test('preferences survive API writes and reject unrelated keys', async () => {
  const res = await request('/preferences', 'PUT', { postaci_auto_sync: '30', postaci_block_images: 'true', arbitrary: 'ignored' });
  assert.equal(res.status, 200);
  const preferences = await (await request('/preferences')).json();
  assert.equal(preferences.postaci_auto_sync, '30'); assert.equal(preferences.arbitrary, undefined);
});

test('API and SSE route variants require authentication on the running server', async () => {
  for (const route of ['/API/accounts', '/Api/accounts/', '/events/', '/EVENTS/']) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    assert.equal(response.status, 401, route);
  }
});
