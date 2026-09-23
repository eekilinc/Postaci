// playwright.config.ts — Electron E2E (Playwright _electron)
// Çalıştırma: npm run test:e2e  (önce vite dev sunucusunu otomatik açar)
// CI (windows-latest): aynen çalışır, ek bağımlılık indirmez; test uygulamanın
// kendi Electron binary'sini kullanır.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
