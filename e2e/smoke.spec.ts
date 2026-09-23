// e2e/smoke.spec.ts — uygulama açılış duman testi
// Pencere açılır, React kökü render olur, başlık doğrudur.
import { _electron, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath = require('electron') as string;
const here = path.dirname(fileURLToPath(import.meta.url));

test('uygulama açılır ve ana ekran render olur', async () => {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(here, '..')],
    env: { ...process.env, ELECTRON_DISABLE_GPU: '1' },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('#root', { timeout: 30_000 });
  await expect(window).toHaveTitle(/Postac/i);
  await app.close();
});
