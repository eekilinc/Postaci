const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const packageDir = path.resolve(process.argv[2] || (process.platform === 'win32' ? 'dist-desktop/win-unpacked' : 'dist-desktop/linux-unpacked'));
const executable = path.join(packageDir, process.platform === 'win32' ? 'Postaci.exe' : 'postaci');
const bundle = path.join(packageDir, 'resources/app.asar/dist/server/index.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-packaged-test-'));
const script = String.raw`
const assert = require('node:assert/strict');
(async () => {
  const backend = require(process.argv[1]);
  const { port, origin } = await backend.serverReady;
  assert.ok(port > 0);
  assert.equal(backend.server.address().address, '127.0.0.1');
  assert.equal((await fetch(origin + '/api/system/health')).status, 200);
  assert.equal((await fetch(origin + '/api/accounts')).status, 401);
  const session = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin } });
  assert.equal(session.status, 200);
  const headers = { Origin: origin, Cookie: session.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
  const diagnostics = await (await fetch(origin + '/api/system/diagnostics', { headers })).json();
  assert.equal(diagnostics.storage.engine, 'sqlite');
  assert.equal(diagnostics.storage.accountCount, 0);
  const cfg = await (await fetch(origin + '/api/auth/oauth-config', { headers })).json();
  assert.equal(cfg.googleRedirectUri, origin + '/api/auth/google/callback');
  const login = await (await fetch(origin + '/api/auth/google/url?clientId=synthetic-client', { headers })).json();
  assert.equal(new URL(login.url).searchParams.get('redirect_uri'), cfg.googleRedirectUri);
  const response = await fetch(origin + '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root">/);
  console.log('PACKAGED_SMOKE_OK', process.platform, process.versions.electron, diagnostics.storage.engine, port);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
`;
const result = spawnSync(executable, ['-e', script, bundle], {
  cwd: packageDir, windowsHide: true, timeout: 30000, encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', POSTACI_DESKTOP: '1', PORT: '0', POSTACI_DATA_DIR: directory, POSTACI_SEED_DEMO: '0', POSTACI_STORAGE: 'sqlite' }
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Packaged Electron failed its startup/API smoke test.');
assert.match(result.stdout, /PACKAGED_SMOKE_OK/);
