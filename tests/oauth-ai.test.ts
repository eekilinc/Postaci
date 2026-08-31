import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { email } from './fixtures.js';
process.env.POSTACI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-oauth-'));
process.env.POSTACI_SEED_DEMO = '0';
const db = await import('../server/services/db.js'); db.initDatabase();
const { OAuthService } = await import('../server/services/oauthService.js');
const { savePreferences } = await import('../server/services/preferences.js');
const { generateLocal, getAIStatus } = await import('../server/services/localAI.js');
const { AIService } = await import('../server/services/aiService.js');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.closeDatabase(); });
const redirect = 'http://127.0.0.1:3001/api/auth/google/callback';

test('OAuth uses a unique state and PKCE S256 challenge', () => {
  const a = new URL(OAuthService.getGoogleAuthUrl(redirect, 'fixture-client'));
  const b = new URL(OAuthService.getGoogleAuthUrl(redirect, 'fixture-client'));
  assert.equal(a.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(a.searchParams.get('code_challenge')!.length >= 43);
  assert.notEqual(a.searchParams.get('state'), b.searchParams.get('state'));
});
test('invalid callback state never reaches the token endpoint', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  await assert.rejects(() => OAuthService.handleGoogleCallback('code', redirect, 'unknown-state'));
  assert.equal(calls, 0);
  globalThis.fetch = originalFetch;
});
test('callback exchanges the matching verifier and rejects state replay', async () => {
  const url = new URL(OAuthService.getGoogleAuthUrl(redirect, 'fixture-client'));
  const state = url.searchParams.get('state')!;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/token')) {
      const form = init!.body as URLSearchParams;
      assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), url.searchParams.get('code_challenge'));
      return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
    }
    return Response.json({ email: 'oauth@example.test', name: 'OAuth Fixture', verified_email: true });
  };
  const account = await OAuthService.handleGoogleCallback('code', redirect, state);
  assert.equal(account.email, 'oauth@example.test');
  await assert.rejects(() => OAuthService.handleGoogleCallback('code', redirect, state));
  globalThis.fetch = originalFetch;
});
test('OAuth configuration never returns its secret', () => {
  const result = OAuthService.saveCredentials({ googleClientId: 'fixture-client', googleClientSecret: 'fixture-config-secret' });
  assert.equal(result.hasGoogleClientSecret, true);
  assert.equal((result as any).googleClientSecret, undefined);
});
test('rule based AI requires no network', async () => {
  savePreferences({ postaci_ai_mode: 'rules' });
  globalThis.fetch = async () => { throw new Error('unexpected network'); };
  assert.ok(await AIService.summarizeEmail(email(1)));
  assert.equal(await generateLocal('task', 'content'), null);
  globalThis.fetch = originalFetch;
});
test('optional model receives only loopback requests and failures fall back', async () => {
  savePreferences({ postaci_ai_mode: 'ollama', postaci_ai_model: 'fixture-model' });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:11434/api/generate');
    assert.equal(JSON.parse(init!.body as string).stream, false);
    return Response.json({ response: 'Model summary' });
  };
  assert.equal(await AIService.summarizeEmail(email(1)), 'Model summary');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.ok(await AIService.summarizeEmail(email(1)));
  assert.match(getAIStatus().lastError!, /kural tabanlı/);
  globalThis.fetch = originalFetch;
});
