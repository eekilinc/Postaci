import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['node_modules', 'dist', 'e2e', 'playwright.config.ts'],
    // Ortam varsayılan 'node': electron/ altındaki testler gerçek better-sqlite3
    // handle'ı açıyor, jsdom'da çalışmazlar.
    // React testleri kendi dosyasında `// @vitest-environment jsdom` yorumuyla
    // ortamı geçersiz kılar (bkz. src/hooks/useMessages.test.ts).
    environment: 'node',
  },
});