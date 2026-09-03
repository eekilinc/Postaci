import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isOAuthCallbackUrl, findOAuthCallbackArg } = require('../desktop/oauth-protocol.cjs');

test('desktop OAuth protocol accepts only the Postaci completion URL', () => {
  assert.equal(isOAuthCallbackUrl('postaci://oauth-complete'), true);
  assert.equal(isOAuthCallbackUrl('postaci://oauth-complete/'), true);
  assert.equal(isOAuthCallbackUrl('postaci://other'), false);
  assert.equal(isOAuthCallbackUrl('https://oauth-complete'), false);
  assert.equal(isOAuthCallbackUrl('not-a-url'), false);
});

test('desktop OAuth protocol locates callback in launch arguments', () => {
  assert.equal(findOAuthCallbackArg(['Postaci.exe', '--flag', 'postaci://oauth-complete']), 'postaci://oauth-complete');
  assert.equal(findOAuthCallbackArg(['Postaci.exe']), undefined);
});
