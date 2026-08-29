# 📬 Postacı — Yeni Nesil Masaüstü E-Posta İstemcisi

<p align="center">
  <img src="https://raw.githubusercontent.com/eekilinc/Postaci/main/client/public/favicon.svg" alt="Postacı Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Modern, Hızlı, Güvenli ve Superhuman Ergonomisine Sahip Masaüstü E-Posta İstemcisi</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg" alt="Platforms" />
  <img src="https://img.shields.io/badge/Electron-44.0-61dafb.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61dafb.svg" alt="React" />
</p>

---

## 🌟 Öne Çıkan Özellikler

- ⚡ **Yüksek Hızlı IMAP & SMTP Motoru:** 15 saniyelik sürekli senkronizasyon döngüsü, pencere odaklanma yenilemesi ve anlık çift yönlü sunucu klasör senkronizasyonu.
- 💻 **Sistem Tepsisi (System Tray) & Arka Planda Çalışma:** Kapatıldığında veya simge durumuna küçültüldüğünde saat yanına gizlenerek e-postaları arka planda otomatik tarar.
- 🚀 **Windows ile Otomatik Başlama:** İsteğe bağlı olarak Windows açıldığında otomatik ve simge durumunda açılır.
- 🎨 **8 Zengin Tema & 7 Vurgu Rengi:**
  - 🌙 Koyu Titanyum (Dark Titanium)
  - 🖤 Saf OLED Siyah (Pitch Black)
  - 🌌 Gece Mavisi (Midnight Slate)
  - 🌲 Siber Zümrüt (Cyber Emerald)
  - ❄️ Arktik Ayaz (Nord Frost)
  - ☀️ Kar Beyazı (Clean Light)
  - 📜 Sıcak Kağıt (Warm Sepia)
  - 🌸 Gül Kurusu Pastel (Rose Cream)
- ✨ **Mailbird & Superhuman Ergonomisi:**
  - Göndericilere özel degrade monogram avatarlar
  - ✨ **Inbox Zero** kutlama ekranı ve animasyonu
  - `Ctrl + K` / `Cmd + K` Evrensel Komut Paleti
  - `?` tuşu ile açılan kapsamlı klavye kısayolları kılavuzu
  - Liste yoğunluğu kontrolleri (Kompakt, Rahat, Geniş)
- 🛡️ **Gelişmiş Güvenlik & Gizlilik:**
  - İzleyici pikselleri (Tracker Blocker) engelleme
  - Harici görselleri isteğe bağlı yükleme
  - Hassas kimlik avı (phishing) koruması
- 💾 **1-Tıkla Yedekleme & Geri Yükleme:**
  - Hesapları, özel klasörleri, imzaları ve tercihleri tek tıkla `.json` olarak dışa aktarma (Export) ve içe aktarma (Import).
- 🔄 **GitHub Releases Güncelleme Motoru:**
  - En güncel sürümü GitHub API üzerinden denetleme ve tek tıkla yeni sürüme geçiş.

---

## ⌨️ Klavye Kısayolları (Superhuman Stili)

| Kısayol | İşlem |
|---|---|
| `C` | Yeni E-Posta Yaz (Compose) |
| `R` | Seçili E-Postayı Yanıtla |
| `A` / `Shift + R` | Tümünü Yanıtla (Reply All) |
| `F` | E-Postayı İlet (Forward) |
| `E` / `Y` | Arşivle |
| `#` / `Del` | Çöp Kutusuna Taşı / Sil |
| `S` | Yıldızla / Yıldızı Kaldır |
| `U` | Okundu / Okunmadı Yap |
| `J` / `↓` | Sonraki E-Posta |
| `K` / `↑` | Önceki E-Posta |
| `Ctrl + K` | Komut Paleti |
| `?` | Kısayol Rehberini Aç |

---

## 🛠️ Kurulum & Geliştirme

### Gereksinimler
- Node.js 18+
- npm 9+

### Bağımlılıkları Yükleyin
```bash
git clone https://github.com/eekilinc/Postaci.git
cd Postaci
npm install
```

### Geliştirme Modunda Çalıştırma
```bash
npm run dev
```

### Masaüstü (Electron) Modunda Çalıştırma
```bash
npm run electron:dev
```

### Windows Kurulum Paketi (.exe / .zip) Üretme
```bash
npm run pack:win
```
Çıktı dosyaları `dist-desktop/` klasöründe oluşur:
- `Postaci-1.0.0-win.zip`
- `win-unpacked/Postaci.exe`

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.
