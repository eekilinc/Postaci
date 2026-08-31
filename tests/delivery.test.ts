import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeliveryGuard } from '../server/services/deliveryGuard.js';
import { validateSendPayload } from '../server/services/sendValidation.js';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postaci-test-delivery-'));
const result = { id: 'sent-1' };
test('concurrent and repeated requests send exactly once, including after restart', async () => {
  const file = path.join(directory, 'success.json');
  const guard = new DeliveryGuard(file, () => result);
  let calls = 0;
  const send = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return result; };
  await Promise.all([guard.run('fixture-key-12345', { body: 'hello' }, send), guard.run('fixture-key-12345', { body: 'hello' }, send)]);
  await new DeliveryGuard(file, () => result).run('fixture-key-12345', { body: 'hello' }, send);
  assert.equal(calls, 1);
  await assert.rejects(() => guard.run('fixture-key-12345', { body: 'changed' }, send));
});
test('uncertain delivery is never retried automatically', async () => {
  const guard = new DeliveryGuard(path.join(directory, 'uncertain.json'), () => undefined);
  let calls = 0;
  const send = async () => { calls++; throw new Error('connection lost'); };
  await assert.rejects(() => guard.run('fixture-key-67890', {}, send));
  await assert.rejects(() => guard.run('fixture-key-67890', {}, send));
  assert.equal(calls, 1);
});
test('rejects header injection and missing attachment contents', () => {
  const base = { accountId: 'a', to: [{ email: 'a@example.test', name: 'A' }], subject: 'Hello', bodyText: 'Body', bodyHtml: '<p>Body</p>' };
  assert.doesNotThrow(() => validateSendPayload(base));
  assert.throws(() => validateSendPayload({ ...base, subject: 'Hello\r\nBcc:other@example.test' }));
  assert.throws(() => validateSendPayload({ ...base, to: [{ email: 'invalid' }] }));
  assert.throws(() => validateSendPayload({ ...base, attachments: [{ filename: 'file' }] }));
});
