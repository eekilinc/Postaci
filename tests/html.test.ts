import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).window = dom.window; (globalThis as any).document = dom.window.document;
const { sanitizeEmailHtml, emailDocument } = await import('../client/src/utils/emailHtml.js');
const blocked = { blockExternalImages: true, blockTrackingPixels: true };

test('removes scripts, event handlers, forms, styles and javascript links', () => {
  const clean = sanitizeEmailHtml('<style>body{display:none}</style><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">click</a><form>form</form><p>text</p>', [], blocked);
  assert.ok(!/script|onerror|<style|<form|javascript:/i.test(clean)); assert.match(clean, /text/);
});
test('blocks remote images and CSS requests when privacy is enabled', () => {
  const clean = sanitizeEmailHtml('<div style="background-image:url(https://tracker.test/p);color:red"><img src="//tracker.test/image" srcset="https://tracker.test/2x 2x"></div>', [], blocked);
  assert.ok(!clean.includes('tracker.test')); assert.ok(!clean.includes('srcset'));
});
test('image permission does not disable tracker protection', () => {
  const clean = sanitizeEmailHtml('<img src="https://images.test/pixel.gif" width="1" height="1"><img src="https://images.test/hidden.png" style="opacity:0"><img src="https://images.test/photo.png" width="400">', [], { blockExternalImages: false, blockTrackingPixels: true });
  assert.ok(!clean.includes('pixel.gif')); assert.ok(!clean.includes('hidden.png')); assert.match(clean, /photo.png/);
});
test('resolves safe inline CID images without enabling remote images', () => {
  const clean = sanitizeEmailHtml('<img src="cid:logo">', [{ id: 'a', filename: 'logo', contentId: 'logo', contentType: 'image/png', size: 4, contentBase64: 'dGVzdA==' }], blocked);
  assert.match(clean, /data:image\/png;base64/);
});
test('sandbox document includes a restrictive content security policy', () => {
  const html = emailDocument('<p>text</p>', true, false);
  assert.match(html, /script-src 'none'/); assert.match(html, /img-src data:;/); assert.match(html, /form-action 'none'/);
});
