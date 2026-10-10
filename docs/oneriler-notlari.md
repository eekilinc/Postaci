# Öneriler ve Uygulama Notları

Tauri hariç, sırayla uygulanacak liste. `[x]` = bitti, `[>]` = yapım aşamasında.

## Postacı'ya doğrudan

- [x] **1. Drizzle ORM (+SQLite)** — Faz 1 bitti, Faz 2 kapsamı bilinçli olarak DARALTILDI ve durduruldu: settings + accounts + messages gövde/ek + contacts + okundu/yıldız grupları taşındı (db-drizzle.cjs, 22 delege), db.cjs dış API imzalarını koruyarak delege ediyor. Kalan ~18 fonksiyon ham SQL'de bırakıldı — gerekçe "Atlanan" bölümünde.
- [x] **2. TanStack Query (Faz 1)** — altyapı + `useFolders` taşındı. `src/query/client.ts`, `src/query/mailKeys.ts`, provider `main.tsx`'te. Hook API birebir aynı, 10+ çağrı noktası değişmedi. Sıradaki: `useMessages` (büyük iş, ayrı faz).
- [x] **3. Zustand (Faz 1)** — `src/stores/themeStore.ts` (persist + eski anahtar devralma). `useTheme` API birebir korunuyor, App.tsx değişmedi. Sıradaki: hesap/seçim store'ları.
- [ ] **4. electron-vite** — BİLİNÇLİ ERTELEME. Gerekçe: `main.cjs` (2797 satır CJS) + preload + builder + release hattı toptan değişir, `npm run dist` kırılma riski yüksek; kazanç (main HMR) şu an kritik değil. Karar senin onayına bırakıldı.
- [x] **5. electron-updater (6.8.9)** — `electron/updater.cjs` + main hook + preload köprüsü + `publish` yapılandırması. Release hattı zaten `latest.yml` yüklüyor, ek CI değişikliği gerekmedi. Arayüz bildirimi Faz 2'de.
- [x] **6. Playwright E2E** — `e2e/smoke.spec.ts` Windows'ta **1 passed**. Ara düzeltmeler: giriş dosyası + cwd sabitleme, `resources/app` yönlendirmesinin dinamik kök bulması (`brand-dev.cjs`).
  **⚠️ WSL/Linux'da ÇALIŞMAZ (2026-10-10 doğrulandı):** Electron açılıyor (renderer
  konsoluna Autofill hataları geliyor) ama `#root` bulunamıyor ve sayfa kapanıyor.
  `git stash` ile değişiklikler geri alınarak doğrulandı — sorun koddan değil
  ortamdan. CI `windows-latest` üzerinde çalıştığı için orada etkisi yok.
  Yerelde E2E çalıştırmak için Windows gerekiyor.
- [x] **React test altyapısı (2026-10-10)** — `jsdom` + `@testing-library/react` + `@testing-library/dom` eklendi. `vitest.config.ts` `@vitejs/plugin-react` kullanıyor; **ortam varsayılan olarak 'node' bırakıldı** çünkü `electron/` altındaki testler gerçek `better-sqlite3` handle'ı açıyor. React testleri dosya başlığında `// @vitest-environment jsdom` yorumuyla geçersiz kılıyor. Kanıt: `src/components/__smoke.test.tsx` (render + etkileşim + localStorage), `src/hooks/useMessages.test.ts` (11 test), `src/hooks/useComposeDraft.test.tsx` (10 test). Test sayısı 58 → **134**. **Not:** React 19 olayları batch'lediği için `fireEvent`/`click` sonrası `act()` sarmalamak gerekiyor; input değiştirmek için `fireEvent.change` kullan (doğrudan `.value =` ataması React'in value tracker'ını atlar).
- [x] **App.tsx compose state → `useComposeDraft` hook'u** — 10 ayrı `useState` (cFrom…cFiles) tek hook'a toplandı. Davranış birebir korundu: `from` alanı `clear()`de **korunur** (gönderimde `cFrom || activeAccount` kullanılır; temizlenirse ikinci e-posta farklı hesaptan giderdi) ve yarım taslak localStorage'a yazılır ama **otomatik geri yüklenmez** — geri yükleme yalnızca compose penceresi açılırken `restoreSaved()` ile yapılır. 10 test ile sabitlendi.
- [x] **Erişilebilirlik: SettingsModal `role="dialog"`** — Modal `role="dialog" aria-modal="true" aria-label` almadan `<div fixed inset-0>` idi; ekran okuyucular ayarlar penceresini tanımıyordu. Eklenerek düzeltildi (testler de buna göre çalışıyor).
- [x] **CI'da test koşumu** — `.github/workflows/ci.yml`'a `npm test` adımı eklendi; 72 test her PR'da koşuyor. Release hattı bilinçli değiştirilmedi (tag commit'leri zaten `main`'de test ediliyor).

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

- [x] **13. Biome (değerlendirme + karar)** — SONUÇ: tamamen kaldırıldı. Tek lint standardı oxlint (CI ile aynı). `biome.json`, `lint:biome` scripti ve `@biomejs/biome` bağımlılığı silindi.
- [ ] **14. release-please/changesets** — ERTELENDİ (karar senin): mevcut tag akışı çalışıyor ve sana uygun; bot'a geçmek alışkanlık değiştirir, kazanç düşük.
- [x] **useMessages → Query** — `src/hooks/useMessages.ts` API birebir korunarak taşındı: liste/sayı hedef anahtarlı önbellekte, `setMessages` çift formlu (iyimser UI aynen), sayfa derinliği korunarak tazeleme, reqId sayaçları yerine anahtar izolasyonu + hedef aynası. Biome'un gerçek bulgusu (`currentTarget` memo) düzeltildi; `!` kullanımları proje standardı olduğu için korundu.
- [ ] Harici (kurulum gerektirmez): Hoppscotch/HTTPie, ripgrep/fd/bat/zoxide/btop.

## Tamamlananlar (2026-10-08)

- [x] **Lint birleştirme** — Biome tamamen kaldırıldı; tek standart oxlint (CI ile aynı).
- [x] **Test kapsamı** — db.test.ts, compose.test.ts, providers.test.ts eklendi: 22 -> 43 test.
- [x] **Drizzle Faz 2 (kısmi)** — settings + accounts grubu db-drizzle'a taşındı, db.cjs delege ediyor. Kalan: messages/contacts/folders.
- [x] **main.cjs modülerleştirme (Faz 1)** — 2826 -> 2098 satır; token-auth, imap-queue, shell-integration, notifications, background-sync ayrışıldı. Kalan: IPC işleyicilerinin ayrı modüllere taşınması.
- [x] Gizli hata düzeltmeleri: `_activeNotifications` tanımsızdı, `mainWindow` örtük globaldi.

## Atlanan

- **Tauri** — kullanıcı isteğiyle pas geçildi. Gerekçe: geçiş yeniden yazım demek.
- **Drizzle Faz 2'nin kalanı (messages listeleme/sayfalama, unified arama, okunmamış sayaçları)** —
  BİLİNÇLİ OLARAK DURDURULDU, karar 2026-10-10'da verildi. Gerekçe:

  1. **Kalan iş, kolay kısım değil.** Ham SQL'de kalan 18 fonksiyonun tamamı zor sorgu:
     `getAllUnreadCounts` (4 sorgu, `COALESCE`/`MAX` iç içe, sunucu değeri vs yerel sayım önceliği),
     `listUnifiedMessages`/`countUnifiedMessages` (`upper()`+`lower()` ile gelen kutusu tespiti),
     `listMessages` (draft dalı: `uid LIKE 'draft-%'` + çoklu klasör eşleşmesi),
     `searchUnifiedMessages`/`searchMessages` (dinamik `LIKE`).
     Bunlar Drizzle query builder'ın güçlü olduğu yer değil.
  2. **Taşınan taraf da tamamen SQL değil.** `db-drizzle.cjs` içinde 39 adet ham `sql`
     operatörü kullanılıyor. Yani kazanç, beklendiği gibi "SQL'den tip güvenli sorguya"
     değil; büyük ölçüde aynı SQL'in farklı bir sözdizimiyle yazılması olurdu.
  3. **Migration avantajı zaten kullanılmıyor.** `db.cjs:initDb` hâlâ `CREATE TABLE` + elle
     `ALTER TABLE` bloklarıyla çalışıyor; Drizzle'ın asıl kazancı olan otomatik migration
     devrede değil. Yani taşımanın temel gerekçesi zaten karşılanmış durumda.
  4. **Regresyon riski yüksek ve görünmez.** `getAllUnreadCounts` ve unread sayaç mantığı
     elle yeniden yazılırsa hata derlemede yakalanmaz; `db-unread.test.ts` 8 testle koruyor
     ama `folders.unread_count` delta mantığı (okunanı ANINDA azalt, sunucu değerini ezme)
     koruması tüm senaryoları kapsamıyor. Yanlış sayaç = kullanıcıya sessizce yanlış rozet.
  5. **Mevcut delegasyon yapısı zaten sağlam ve testli.** `db.cjs` imzaları korunuyor,
     parlama testi (`db-schema.test.ts`) şema sapmasını yakalıyor, davranış testleri var.
     Yani bu "yarım kalmış kötü bir geçiş" değil, **çalışan ve maliyeti düşük bir borç.**

  **Ne zaman tekrar bak?** Sorgu karmaşıklığı düşerse (ör. unified inbox tek tabloya
  inerse) veya gerçek bir migration aracına geçiş yapılacaksa değerlendirilmeli.
  O güne kadar `db.cjs` içindeki ham SQL kasıtlıdır — sadeleştirme çabası değil.

- **`electron/ipc.cjs`'i alan bazlı modüllere bölme** — ❌ **YAPILMADI (2026-10-10 denendi ve geri alındı).**
  Gerekçe: 65 `ipcMain.handle` bloğunu 10 alan modülüne ayırmak için bir bölme
  aracı yazıldı. Araç 66 bloğu doğru yerlerine koydu **ama** handler'lar arasındaki
  yardımcı fonksiyonları (`adjustUnread`, `countUnread`, `emptySpecialFolder`,
  `TRASH_PATTERNS` vb.) yanlış gruba atadı: sonuçta 66 yerine **171** handler
  oluştu ve kanallar iki kez kaydedildi. Node üzerinde gerçek `require.cache`
  ile doğrulandı (FARKLI 66 / TOPLAM 170 → hata). Dosya özgün haline geri alındı,
  `git diff` temiz.

  **Doğru yaklaşım (ileride tekrar denenecek):** elle, handler handler bölmek.
  Özellikle `mail.cjs` (39 handler) ve `accounts` grubu birbirinin yardımcı
  fonksiyonlarını kullanıyor; bunlar taşınırken taşıyacağı modüle de
  taşınmalı. Otomatik araç yerine önce test kapsamı genişletilmeli.

  **Bu deneme kazandı:** `electron/ipc.test.ts` (10 test) yazıldı ve kaldı.
  - 66 kanalın tamamının kaydedildiğini sabitler,
  - preload.cjs'in çağırdığı her kanalın main'de karşılığı olduğunu doğrular
    (**asıl sözleşme testi** — dosya bölünürse kopan kanalı anında yakalar),
  - `shell:open-external` şema doğrulamasını gerçekten test eder
    (`file://`, `javascript:`, `data:` reddediliyor).
  IPC handler imzası `(event, url)` — testte tek argüman geçirilirse handler
  gelen değeri "event" sanıp her şeyi reddeder; `call = (u) => fn()({}, u)` kullanın.

- **SettingsModal.tsx'ı sekmelere bölme** — ✅ **TAMAMLANDI (2026-10-10).**
  2892 → 946 satır. Yedi sekme `src/components/settings/` altına ayrıldı:
  `GeneralTab`, `AppearanceTab`, `ScalingTab`, `AccountsTab`, `ComposingTab`,
  `AdvancedTab`, `AboutTab`. Sekme tanımları `settingsTabs.ts`'e ayrıldı.
  Her sekme saf "props + callback" — hiçbiri kendi ayarını yazmıyor, kalıcılık
  (localStorage / IPC) ana modalda kaldı. `SettingsModal.test.tsx` 42 test ile
  her sekmenin render'ını VE ayar zincirini (değiştir → localStorage/DOM uygula)
  doğruluyor.

  **Bilinen tuzaklar (ileride test yazanlar için):**
  - `AboutTab`'ı ilk yazarken güncelleme denetleyicisi / GitHub kartı / DPAPI
    kartı blokları **atlanmıştı**. 227 satırlık blokları elle taşımak hata riski
    taşıyor — her taşımadan sonra `tsc -b --force` çalıştırılmalı.
  - `posaci_block_remote_images` varsayılanı **engelleme AÇIK** (`!== 'false'`).
    `useMessageBody.ts` aynı anahtarı aynı varsayılanla okuyor; iki yerde
    aksi halde ayar burada kapanır ama gövdede uygulanmazdı.
  - Hızlı yanıt şablonları `localStorage` boşken **3 varsayılan ile** başlar.
  - React testlerinde input değiştirmek için `fireEvent.change` kullanılmalı;
    doğrudan `el.value = x` + `dispatchEvent` React'in value tracker'ını atlayıp
    state'i güncellemiyor. `act()` de React 19 olay batch'lemesi için şart.
