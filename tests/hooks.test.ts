import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { api } from '../client/src/services/api.js';
import { useEmailCollection } from '../client/src/hooks/useEmailCollection.js';
import { useUndoSend } from '../client/src/hooks/useUndoSend.js';
import { useComposeInitialization } from '../client/src/hooks/useComposeInitialization.js';
import { email } from './fixtures.js';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3001' });
(globalThis as any).window = dom.window; (globalThis as any).document = dom.window.document;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function mountHook(factory: (props: any) => any, props: any) {
  const container = document.createElement('div'); document.body.append(container);
  const root: Root = createRoot(container);
  let value: any;
  function Harness(input: any) { value = factory(input); return null; }
  const render = (input: any) => act(() => root.render(React.createElement(Harness, input)));
  render(props);
  return { get value() { return value; }, render, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}
const select = () => {};
test('late responses from an old folder cannot overwrite the selected folder', async () => {
  const original = api.getEmailPage;
  let resolveOld: (value: any) => void = () => {};
  api.getEmailPage = async (params) => params.folder === 'INBOX' ? new Promise(resolve => { resolveOld = resolve; }) : { items: [{ ...email(2), folder: 'SENT' }], hasMore: false, nextOffset: 1 };
  const hook = mountHook(p => useEmailCollection({ folder: p.folder }, select), { folder: 'INBOX' });
  let old!: Promise<void>;
  act(() => { old = hook.value.refreshEmails(); });
  hook.render({ folder: 'SENT' });
  await act(async () => hook.value.refreshEmails());
  await act(async () => { resolveOld({ items: [email(1)], hasMore: false, nextOffset: 1 }); await old; });
  assert.equal(hook.value.emails[0].folder, 'SENT');
  hook.unmount(); api.getEmailPage = original;
});
test('load more accumulates over 500 unique emails', async () => {
  const original = api.getEmailPage;
  api.getEmailPage = async params => {
    const offset = params.offset || 0;
    return { items: Array.from({ length: 100 }, (_, i) => email(offset + i)), hasMore: offset < 600, nextOffset: offset + 100 };
  };
  const hook = mountHook(() => useEmailCollection({ folder: 'INBOX' }, select), {});
  await act(async () => hook.value.refreshEmails());
  for (let i = 0; i < 5; i++) await act(async () => hook.value.loadMoreEmails());
  assert.equal(hook.value.emails.length, 600);
  assert.equal(new Set(hook.value.emails.map((e: any) => e.id)).size, 600);
  hook.unmount(); api.getEmailPage = original;
});
test('undo cancels the pending send before delivery', async () => {
  const hook = mountHook(p => useUndoSend(p.open), { open: true });
  let delivered = false; let outcome!: Promise<void>;
  act(() => { outcome = hook.value.wait(5).then(() => { delivered = true; }).catch((err: Error) => { assert.equal(err.name, 'AbortError'); }); });
  await act(async () => { hook.value.cancel(); await outcome; });
  assert.equal(delivered, false); assert.equal(hook.value.secondsLeft, 0);
  hook.unmount();
});
test('closing compose cancels pending delivery', async () => {
  const hook = mountHook(p => useUndoSend(p.open), { open: true });
  let aborted = false; let outcome!: Promise<void>;
  act(() => { outcome = hook.value.wait(5).catch(() => { aborted = true; }); });
  await act(async () => { hook.render({ open: false }); });
  await outcome;
  assert.equal(aborted, true);
  hook.unmount();
});

test('account refresh preserves an open draft but reopening initializes a new one', () => {
  let draft = '';
  const data = { body: 'initial' };
  const hook = mountHook(p => useComposeInitialization(p.open, p.data, () => { draft = p.data.body; }), { open: true, data });
  assert.equal(draft, 'initial');
  draft = 'typed text';
  hook.render({ open: true, data, accountRevision: 2 });
  assert.equal(draft, 'typed text');
  hook.render({ open: false, data });
  hook.render({ open: true, data });
  assert.equal(draft, 'initial');
  hook.render({ open: true, data: { body: 'reply to another mail' } });
  assert.equal(draft, 'reply to another mail');
  hook.unmount();
});
test('invalid legacy undo duration does not leave delivery waiting forever', async () => {
  const hook = mountHook(() => useUndoSend(true), {});
  await hook.value.wait(Number.NaN);
  assert.equal(hook.value.secondsLeft, 0);
  hook.unmount();
});

test('two-column mail view stays on the list after refresh until the user chooses a message', async () => {
  const original = api.getEmailPage;
  api.getEmailPage = async () => ({ items: [email(1), email(2)], hasMore: false, nextOffset: 2 });
  let selected: string | null = null;
  const choose: React.Dispatch<React.SetStateAction<string | null>> = update => {
    selected = typeof update === 'function' ? update(selected) : update;
  };
  const hook = mountHook(() => useEmailCollection({ folder: 'INBOX' }, choose, false), {});
  try {
    await act(async () => hook.value.refreshEmails());
    assert.equal(selected, null);
    selected = email(2).id;
    await act(async () => hook.value.refreshEmails());
    assert.equal(selected, email(2).id);
    selected = null;
    await act(async () => hook.value.refreshEmails());
    assert.equal(selected, null);
  } finally { hook.unmount(); api.getEmailPage = original; }
});
