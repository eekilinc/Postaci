import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOAuthAttempt, completeOAuthAttempt, failOAuthAttempt, getOAuthAttempt } from '../server/services/oauthAttemptStatus.js';
import { account } from './fixtures.js';

test('OAuth attempt reports pending and then the connected account', () => {
  const state = 'oauth-success-state';
  beginOAuthAttempt(state);
  assert.deepEqual(getOAuthAttempt(state), { status: 'pending' });
  completeOAuthAttempt(state, account);
  assert.deepEqual(getOAuthAttempt(state), { status: 'success', account });
});

test('OAuth attempt exposes callback errors to the desktop client', () => {
  const state = 'oauth-error-state';
  beginOAuthAttempt(state);
  failOAuthAttempt(state, 'access_denied');
  assert.deepEqual(getOAuthAttempt(state), { status: 'error', message: 'access_denied' });
});
