import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { AppBootstrap } from '../client/src/components/AppBootstrap.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:12345' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test('startup shows loading, a useful error and a working retry before rendering the app', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let calls = 0;
  const initialize = async () => { if (++calls === 1) throw new Error('Bağlantı reddedildi'); };
  try {
    act(() => root.render(React.createElement(AppBootstrap, { initialize, children: React.createElement('div', null, 'Mailbox ready') })));
    assert.match(container.textContent!, /Postacı açılıyor/);
    await act(async () => {});
    assert.match(container.textContent!, /Bağlantı reddedildi/);
    assert.ok(container.querySelector('[role="alert"]'));
    await act(async () => { container.querySelector('button')!.click(); });
    assert.equal(calls, 2);
    assert.equal(container.textContent, 'Mailbox ready');
  } finally { act(() => root.unmount()); }
});

test('a stalled startup times out, aborts its request and never leaves a blank screen', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let signal: AbortSignal | undefined;
  const initialize = (value?: AbortSignal) => { signal = value; return new Promise<void>(() => {}); };
  try {
    await act(async () => root.render(React.createElement(AppBootstrap, { initialize, timeoutMs: 15, children: 'Mail' })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(signal?.aborted, true);
    assert.match(container.textContent!, /zamanında yanıt vermedi/);
    assert.ok(container.querySelector('button'));
  } finally { act(() => root.unmount()); }
});
