# 1.4.0 doğrulama kaydı

Tarih: 2026-08-31. Ortam: Ubuntu 24.04 / WSL, Node.js 22.21.1, Electron 44.0.0.

## Son düzeltme

Express rota eşleştirmesi büyük/küçük harfe duyarsız ve son eğik çizgiye izin verirken, güvenlik katmanı yalnızca birebir küçük harfli yolları kontrol ediyordu. `/API/accounts` ve `/events/` gibi yolların oturum denetimini atlaması engellendi. Önbelleğe almama başlığı aynı yol kurallarını kullanır. Herkese açık sağlık/OAuth yolları yalnızca GET/HEAD için istisnadır.

Regresyon testleri düzeltmeden önce başarısız oldu; düzeltmeden sonra hem kaynak sunucuda hem üretim derlemesinde geçti. Gerçek posta verileri bu kontrollerde kullanılmadı.

## Çalıştırılan kontroller

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | Başarılı |
| `npm run lint` | Başarılı |
| `npm test` | 43 test geçti |
| `npm run test:json` | JSON saklama için 9 test geçti |
| `npm run build:desktop` | İstemci, sunucu ve Linux dizin paketi oluşturuldu; yayın yapılmadı |
| Paket içindeki Electron / SQLite | Bellek veritabanında sorgu başarılı; güncel güvenlik kodu pakette doğrulandı |
| `npm run test:bundle` | Üretim sunucusuna karşı 6 test geçti |
| `npm audit --audit-level=high` | 0 güvenlik açığı bildirildi |
| `git diff --check` | Başarılı |

Toplam 58 başarılı test çalıştırması vardır; JSON ve üretim kontrolleri bazı senaryoları farklı ortamlarda tekrarlar. Paketleme sonrasında `better-sqlite3` geliştirme ortamındaki Node sürümü için yeniden hazırlandı.

Yerel masaüstü çıktısı: `dist-desktop/linux-unpacked/`. Bu çıktı Linux dizin paketidir; Windows kurulum dosyası, AppImage veya DEB değildir.

## Doğrulanmayan alanlar

- Görsel ve etkileşimli tarayıcı testi: tarayıcı test ortamı başlatılırken `setup refresh had errors` hatası alındı. DOM/hook testleri görsel doğrulama yerine geçmez.
- Gerçek sağlayıcılarla IMAP/SMTP, Google OAuth ve gerçek Ollama modeli bağlantıları: hesaplara bağlanılmadı, e-posta gönderilmedi. Otomatik kontroller sahte veriler ve taklit bağlantılar kullandı.
- Windows kurulum/çalıştırma ve işletim sistemi anahtar kasasıyla gerçek masaüstü oturumu: bu ortamda doğrulanmadı.
- Bu yerel doğrulama kaydı hazırlanırken GitHub CI/release iş akışları henüz çalıştırılmamıştı. Yayın durumu ve platform sonuçları için GitHub Actions ile Releases kayıtlarına bakın.

Bu kayıt yapılan doğrulamaları belirtir; uygulamanın tüm koşullarda sorunsuz veya güvenlik açığından arınmış olduğu garantisi değildir.
