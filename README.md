<div align="center">

  <img src="public/icon.png" alt="Postacı Logo" width="120" height="120" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />

  # 📮 Postacı

  **Yıldırım hızında, yerel SQLite önbellekli, güvenli ve modern masaüstü e-posta istemcisi**

  *A blazing fast, offline-first, modern and secure desktop email client for Windows*

  <p align="center">
    <a href="https://github.com/eekilinc/Postaci/releases/latest">
      <img src="https://img.shields.io/github/v/release/eekilinc/Postaci?style=for-the-badge&color=2563eb&label=S%C3%BCr%C3%BCm" alt="Latest Release" />
    </a>
    <a href="https://github.com/eekilinc/Postaci/actions/workflows/release.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/eekilinc/Postaci/release.yml?style=for-the-badge&label=Build%20%26%20Release" alt="Build Status" />
    </a>
    <a href="https://github.com/eekilinc/Postaci/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/Lisans-MIT-success?style=for-the-badge" alt="License MIT" />
    </a>
    <a href="https://github.com/eekilinc/Postaci">
      <img src="https://img.shields.io/badge/Platform-Windows%20x64-blue?style=for-the-badge&logo=windows" alt="Platform Windows" />
    </a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Electron-44.x-47848F?logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white" alt="TailwindCSS" />
    <img src="https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/SQLite-Better--SQLite3-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  </p>

  <p align="center">
    <a href="#-özellikler">Özellikler</a> •
    <a href="#-sistem-mimarisi">Mimari</a> •
    <a href="#-klavye-kısayolları">Kısayollar</a> •
    <a href="#-kurulum-ve-indirme">İndir & Kur</a> •
    <a href="#-geliştirici-kılavuzu">Geliştirme</a> •
    <a href="#-sürüm-ve-dağıtım">Sürümler</a>
  </p>

</div>

---

## ✨ Özellikler

<table>
  <tr>
    <td width="50%">
      <h3>⚡ Çevrimdışı & Yerel SQLite Önbellek</h3>
      <p>Tüm e-postalarınız, klasör yapınız ve ekleriniz yerel <code>better-sqlite3</code> veritabanında indekslenir. İnternet bağlantınız kopsa dahi gelen kutunuzda anında arama yapabilir, e-postalarınızı okuyabilir ve yanıtlayabilirsiniz.</p>
    </td>
    <td width="50%">
      <h3>📥 Birleşik Gelen Kutusu (Unified Inbox)</h3>
      <p>Birden fazla e-posta hesabını (Gmail, Outlook, Yahoo, iCloud, Yandex, özel kurumsal IMAP) tek bir birleşik akışta görüntüleyin. Hesaplar arası geçiş yapmadan tüm iletilerinizi yönetin.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎨 Kusursuz Aydınlık & Karanlık Mod</h3>
      <p>Modern cam efektleri (glassmorphism), özel renk paleti ve yüksek kontrastlı tasarımı ile hem gündüz hem gece gözü yormayan premium kullanıcı arayüzü deneyimi sunar.</p>
    </td>
    <td width="50%">
      <h3>⌨️ Superhuman Hızında Komut Paleti</h3>
      <p><code>Ctrl + K</code> ile açılan komut paleti sayesinde elinizi klavyeden kaldırmadan hesap değiştirin, klasörlere zıplayın, e-posta oluşturun veya temayı değiştirin.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>↩️ 5 Saniye Geri Alınabilir Gönderim (Undo Send)</h3>
      <p>E-postayı yanlışlıkla erken mi gönderdiniz? 5 saniyelik güvenli geri alma tamponu ile gönderimi iptal edip düzenlemeye kaldığınız yerden devam edin.</p>
    </td>
    <td width="50%">
      <h3>✍️ Akıllı Taslak & Küçültülebilir Editör (Dock)</h3>
      <p>E-posta yazarken pencereyi sağ alt köşeye küçülterek gelen kutunuzu inceleyin. ESC veya dış tıklamalarda asla veri kaybı yaşatmayan otomatik taslak koruma mekanizması devrededir.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🔐 Donanım Düzeyinde Güvenlik (DPAPI)</h3>
      <p>Hesap şifreleriniz ve OAuth2 yenileme anahtarlarınız (Refresh Token) Windows <code>safeStorage</code> (DPAPI) donanım/kullanıcı şifreleme katmanıyla güvenle kilitlenir.</p>
    </td>
    <td width="50%">
      <h3>🔔 Yerel Windows Masaüstü Bildirimleri</h3>
      <p>Arka plan senkronizasyonu ile gelen yeni iletiler Windows bildirim merkezine düşer. Bildirime tıklandığında Postacı penceresi açılır ve doğrudan ilgili e-posta görüntülenir.</p>
    </td>
  </tr>
</table>

---

## 🏗️ Sistem Mimarisi

Postacı, modern masaüstü uygulamaları için güvenlik ve performans standartlarına sıkı sıkıya bağlı çok katmanlı bir mimari kullanır:

```mermaid
flowchart TB
    subgraph UI Katmanı ["Kullanıcı Arayüzü (Renderer Process)"]
        A["React 19 + TypeScript"]
        B["TailwindCSS v4 + Modern Glass Theme"]
        C["Komut Paleti & Klavye Kısayolları"]
        D["Zengin E-posta Editörü & Dock Bar"]
    end

    subgraph Security Katmanı ["Güvenlik & Köprü (Preload)"]
        E["contextBridge & IPC Güvenlik İzolasyonu"]
    end

    subgraph Main Katmanı ["Çekirdek (Electron Main Process)"]
        F["Pencere & Bildirim Yöneticisi"]
        G["Arka Plan Senkronizasyon Zamanlayıcısı"]
        H["OAuth2 & DPAPI safeStorage"]
    end

    subgraph Storage Katmanı ["Veri & Ağ (Data & Network)"]
        I[("Yerel SQLite (better-sqlite3)")]
        J["IMAP Motoru (imapflow)"]
        K["SMTP Gönderim (nodemailer)"]
    end

    UI Katmanı <--> |IPC Çağrıları| Security Katmanı
    Security Katmanı <--> |ipcMain.handle| Main Katmanı
    Main Katmanı <--> Storage Katmanı
```

---

## ⌨️ Klavye Kısayolları

Postacı, klavyeden çalışan profesyoneller için Superhuman esintili akıcı kısayollar sunar:

| Kısayol | İşlem |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | **Komut Paletini Aç** (Hesaplar, klasörler, komutlar) |
| <kbd>C</kbd> | **Yeni E-posta Oluştur** (Compose) |
| <kbd>R</kbd> | Seçili e-postayı **Yanıtla** (Reply) |
| <kbd>A</kbd> | Seçili e-postayı **Tümünü Yanıtla** (Reply All) |
| <kbd>F</kbd> | Seçili e-postayı **İlet** (Forward) |
| <kbd>E</kbd> | Seçili e-postayı **Arşive Taşı** |
| <kbd>#</kbd> veya <kbd>Delete</kbd> | Seçili e-postayı **Çöp Kutusuna Taşı** |
| <kbd>S</kbd> | Seçili e-postayı **Yıldızla / Yıldızı Kaldır** |
| <kbd>U</kbd> | Seçili e-postayı **Okunmadı Olarak İşaretle** |
| <kbd>J</kbd> / <kbd>K</kbd> veya <kbd>↓</kbd> / <kbd>↑</kbd> | Sonraki / Önceki e-postaya git |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Hazırlanan e-postayı **Gönder** |
| <kbd>Esc</kbd> | Modalları kapat / Taslağı güvenle kaydet |

---

## 📦 Kurulum ve İndirme

En güncel Postacı sürümünü **[Releases](https://github.com/eekilinc/Postaci/releases/latest)** sayfasından indirebilirsiniz.

### 1. Kurulum Dosyası (Önerilen)
- **Dosya:** `Postacı Setup X.X.X.exe`
- **Özellikler:**
  - Masaüstü ve Başlat menüsü kısayollarını otomatik oluşturur.
  - Windows Başlat menüsünde ve görev çubuğunda yüksek çözünürlüklü **Postacı** simgesini konumlandırır.
  - Kurulum dizinini seçebilme imkanı tanır.

### 2. Taşınabilir Sürüm (Portable)
- **Dosya:** `Postacı-X.X.X-portable.exe`
- **Özellikler:**
  - Kurulum yapmadan USB bellekten veya dilediğiniz klasörden doğrudan çalıştırın.

---

## 🛠️ Geliştirici Kılavuzu

### Gereksinimler
- **Node.js**: v20.x veya üzeri
- **npm**: v10.x veya üzeri
- **İşletim Sistemi**: Windows 10 / 11 (64-bit)
- **C++ Derleme Araçları**: Yerel `better-sqlite3` derlemesi için Python ve Visual Studio Build Tools (genellikle Node.js kurulumuyla birlikte gelir).

### 1. Projeyi Klonlayın
```bash
git clone https://github.com/eekilinc/Postaci.git
cd Postaci
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Geliştirme Ortamında Başlatın
Aynı anda Vite dev sunucusunu ve Electron ana penceresini başlatır:
```bash
npm start
```

### 4. Kod Denetimi ve Derleme
```bash
# Oxlint ile ultra hızlı statik analiz
npm run lint

# TypeScript derleme ve Vite üretim paketi
npm run build
```

### 5. Windows Kurulum Paketini Üretin (.exe)
```bash
npm run dist
```
*Üretilen `.exe` ve `.blockmap` dosyaları `release/` klasörü altına kaydedilecektir.*

---

## 🔄 Otomatik Sürüm ve GitHub Dağıtımı

Postacı, GitHub Actions üzerinde çalışan tam otomatik bir CI/CD boru hattına sahiptir:

### Yöntem A: Git Etiketi (Tag) ile Otomatik Release
Terminalden yeni bir sürüm etiketi oluşturup göndermeniz yeterlidir:
```bash
# Küçük hata düzeltmeleri için (Örn: 1.0.0 -> 1.0.1)
npm run release:patch

# Yeni özellikler için (Örn: 1.0.0 -> 1.1.0)
npm run release:minor

# Büyük sürümler için (Örn: 1.0.0 -> 2.0.0)
npm run release:major
```
Bu komut `package.json` sürümünü günceller, Git commit ve tag'i oluşturur, ardından GitHub'a gönderir. GitHub Actions derlemeyi `windows-latest` üzerinde başlatır, `.exe` yükleyicilerini üretir ve GitHub Release olarak yayınlar.

### Yöntem B: GitHub Actions Üzerinden Tek Tıkla Release
1. Projenin GitHub sayfasına gidin.
2. **Actions** sekmesinden **Release Postacı** iş akışını seçin.
3. **Run workflow** butonuna tıklayın.
4. Sürüm yükseltme tipini seçin (`patch`, `minor`, `major` veya `none`) ve çalıştırın.

---

## 🔐 Güvenlik ve Gizlilik

- **Sıfır Bulut İletimi:** E-postalarınız üçüncü taraf hiçbir sunucuya veya bulut veritabanına aktarılmaz. Yalnızca doğrudan e-posta sunucunuz (IMAP/SMTP) ile sizin bilgisayarınız arasında iletişim kurulur.
- **DPAPI Şifreleme:** Parolalar ve erişim belirteçleri düz metin olarak değil, Windows Data Protection API (`safeStorage`) kullanılarak sadece oturum açmış Windows kullanıcısı tarafından çözülecek şekilde şifrelenir.
- **Güvenli HTML İzolasyonu:** HTML formatındaki e-postalar `DOMPurify` ile sterilize edilir; tehlikeli script'ler, iframe saldırıları ve kötü niyetli içerikler engellenir.

---

## 📄 Lisans

Bu proje **[MIT Lisansı](LICENSE)** altında lisanslanmıştır. Dilediğiniz gibi geliştirebilir, katkıda bulunabilir ve özgürce kullanabilirsiniz.

<div align="center">
  <sub>Geliştirici: <b><a href="https://github.com/eekilinc">Ekrem Eşref Kılınç</a></b> • Mehmet Akif Ersoy Üniversitesi</sub>
</div>
