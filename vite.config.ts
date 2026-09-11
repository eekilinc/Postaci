import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    assetsInlineLimit: 120000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
