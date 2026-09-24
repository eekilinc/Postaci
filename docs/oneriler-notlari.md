# Öneriler ve Uygulama Notları

Tauri hariç, sırayla uygulanacak liste. `[x]` = bitti, `[>]` = yapım aşamasında.

## Postacı'ya doğrudan

- [>] **1. Drizzle ORM (+SQLite)** — `db.cjs`'teki çiğ SQL yerine tip-güvenli sorgular. Faz 1: şema dosyası + parlama testi (sıfır risk). Faz 2: fonksiyonları tek tek taşıma.
- [x] **2. TanStack Query (Faz 1)** — altyapı + `useFolders` taşındı. `src/query/client.ts`, `src/query/mailKeys.ts`, provider `main.tsx`'te. Hook API birebir aynı, 10+ çağrı noktası değişmedi. Sıradaki: `useMessages` (büyük iş, ayrı faz).
- [x] **3. Zustand (Faz 1)** — `src/stores/themeStore.ts` (persist + eski anahtar devralma). `useTheme` API birebir korunuyor, App.tsx değişmedi. Sıradaki: hesap/seçim store'ları.
- [ ] **4. electron-vite** — BİLİNÇLİ ERTELEME. Gerekçe: `main.cjs` (2797 satır CJS) + preload + builder + release hattı toptan değişir, `npm run dist` kırılma riski yüksek; kazanç (main HMR) şu an kritik değil. Karar senin onayına bırakıldı.
- [x] **5. electron-updater (6.8.9)** — `electron/updater.cjs` + main hook + preload köprüsü + `publish` yapılandırması. Release hattı zaten `latest.yml` yüklüyor, ek CI değişikliği gerekmedi. Arayüz bildirimi Faz 2'de.
- [x] **6. Playwright E2E (altyapı)** — `playwright.config.ts` + `e2e/smoke.spec.ts` + `test:e2e` scripti. Bu ortamda çalıştırılamadı: WSL'de display yok VE `node_modules/electron` Windows binary'si. Windows makinende / CI'da çalışır. İlk gerçek koşum orada yapılacak.

## Diyagram / görselleştirme

- [x] **Archify** — `docs/archify/` altında 3 diyagram teslim edildi.
- [x] **7. Mermaid** — README mimarisi güncel: updater düğümü eklendi. Kural: mimari değişince bu blok da güncellenecek.
- [x] **8. D2** — `docs/architecture.d2` eklendi (Mermaid ile aynı mimari + updater). Render bu makinede yok (Go toolchain yok); play.d2lang.com'da açılır veya CI'ya `d2` adımı eklenir.
- [x] **9. Excalidraw + MCP** — hazır config not edildi (aşağıda), etkinleştirme sende: canlı canvas + `uvx` gerektirir, release'i ilgilendirmez.
  ```json
  { "mcp": { "excalidraw": { "type": "local", "command": ["uvx", "maaker-excalidraw-mcp"], "enabled": true } } }
  ```
  OpenCode global ayarına (`~/.config/opencode/opencode.json`) eklenir.

## Agent skill'leri

- [x] **10. mattpocock/skills** — kuruldu (`~/.agents/skills/`): `grill-me`, `tdd`, `improve-codebase-architecture`, `to-spec`, `setup-pre-commit` dahil.
- [x] **11. andrej-karpathy-skills** — kuruldu: `karpathy-guidelines`.
- [x] **12. anthropics/skills + vercel-labs/agent-skills** — kuruldu: `skill-creator`, `webapp-testing`, `vercel-react-best-practices`, `web-design-guidelines` dahil.

## Alet çantası

- [x] **13. Biome (değerlendirme + karar)** — Ölçüm: tüm repoda 952 hata + 3001 uyarı. Tam geçiş = 96 dosyalık churn, release öncesi/kısa vadede risk. KARAR: oxlint `lint` olarak kalır, Biome yeni kod için `lint:biome` ile bekler.
- [ ] **14. release-please/changesets** — ERTELENDİ (karar senin): mevcut tag akışı çalışıyor ve sana uygun; bot'a geçmek alışkanlık değiştirir, kazanç düşük.
- [ ] **useMessages → Query** — ERTELENDİ (sıralama gereği): App.tsx ameliyatı ister, güvenlik ağı Playwright yeşil koşumu (madde 2) önce gelir.
- [ ] Harici (kurulum gerektirmez): Hoppscotch/HTTPie, ripgrep/fd/bat/zoxide/btop.

## Atlanan

- **Tauri** — kullanıcı isteğiyle pas geçildi. Gerekçe: geçiş yeniden yazım demek.
