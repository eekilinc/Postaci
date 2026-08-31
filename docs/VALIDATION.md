# 1.4.1 doğrulama kaydı

Tarih: 2026-08-31. Ortamlar: Windows 11 ve Ubuntu 24.04 / WSL; Node.js 22.21.1, Electron 44.0.0.

## Düzeltmeler

Windows'ta yayımlanmış 1.4.0 paketi `127.0.0.1:3001` üzerinde `EACCES` hatasıyla başlatılamadı. 1.4.1 masaüstü, açıkça PORT verilmedikçe işletim sisteminden boş bir loopback portu alır. Pencere açılmadan önce sunucunun gerçek dinleme sonucu beklenir; OAuth dönüş adresi, Host/Origin ve IPC denetimleri aynı gerçek portu kullanır. Başlangıç hatalarının neden zinciri kullanıcı veri dizinindeki `startup-error.log` dosyasına yazılır.

Arayüz açılışında yükleme, zaman aşımı, hata ve tekrar deneme durumları eklendi. İki sütun görünümünde liste yenileme artık kendiliğinden ileti açmaz. Boş hesap listesi, sonuçsuz arama ve liste hataları için ilgili eylemler gösterilir. Görünüm/sıralama tercihleri sunucuda saklanır. Ayarlar 960×600 pencerede ekrana sığar; dar posta sütununda filtreler ve sıralama denetimi alt satıra geçebilir.

## Yerel otomatik kontroller

| Kontrol | Sonuç |
|---|---|
| `npm run check` | Tür kontrolü, lint, 50 ana test ve 9 JSON testi başarılı |
| `npm run build` | Üretim istemci ve sunucu derlemesi başarılı |
| `npm run test:bundle` | Üretim sunucusuna karşı 7 API testi başarılı |
| `npm audit --audit-level=high` | 0 güvenlik açığı bildirildi |
| Windows paket çalışma zamanı | Electron 44 / native SQLite / loopback / oturum / OAuth / HTML kontrolleri başarılı |
| Windows arayüz akışları | Açılış, klasörler, masaüstü IPC, ayar sekmeleri, 960×600 panel, iki sütun liste ve izole ileti okuyucu başarılı |
| `git diff --check` | Başarılı |

Toplam 66 test çalıştırması vardır; buna Windows paket ve arayüz kontrolleri dahil değildir. JSON ve üretim API testleri bazı senaryoları farklı ortamlarda tekrarlar.

Windows yerel testinde yayımlanmış 1.4.0 ZIP'indeki Electron/native bağımlılıklar kullanıldı; geçici kopyanın uygulama arşivi güncel kodla yenilendi. Arayüz testi ayrı bir geçici kullanıcı profili ve `provider: demo` verileriyle çalıştı. Kullanıcının gerçek posta verileri değiştirilmedi, dışarıya e-posta gönderilmedi. Bu kontrol yeni NSIS kurulumunun testi değildir.

Yerel Windows ZIP çıktısı `dist-desktop/Postaci-1.4.1-Windows.zip` olarak hazırlandı. Bu çıktı mevcut Electron/native çalışma zamanıyla güncel uygulama arşivini birleştirir; resmi CI tarafından üretilmiş NSIS kurulum dosyası değildir. Üretim giriş noktası `desktop/main.cjs` kullanılır, geçici arayüz test kodu pakete alınmaz.

GitHub commit/push ve 1.4.1 yayını kullanıcı tarafından açıkça onaylandı. Bu dosya yerel doğrulama sonuçlarını kaydeder; uzak platform kontrollerinin ve yayının güncel sonucu aşağıda bağlantıları verilen GitHub kayıtlarında yer alır.

Release iş akışına her iki platformda paketleme sonrası `npm run test:packaged` adımı eklendi. Bu adım paketlenmiş Electron içinde native SQLite, dinamik port, API erişim koruması, OAuth dönüş adresi ve arayüz dosyasını doğrular; başarısızsa ilgili platformun yayın adımı çalışmaz.

## Sınırlar

- Browser test aracı bu ortamda `setup refresh had errors` nedeniyle açılamadı. Yerel Windows kontrolleri izole Electron test uygulamasında yürütüldü.
- Gerçek sağlayıcılarda IMAP/SMTP, Google OAuth girişi ve gerçek Ollama modeli denenmedi. Bu alanlardaki otomatik kontroller sahte veriler ve taklit bağlantılar kullanır.
- Windows NSIS kurulum/yükseltme/kaldırma akışları, gerçek hesap sırlarının işletim sistemi kasasıyla taşınması ve macOS doğrulanmadı.
- Bu kayıt yerel doğrulamayı belirtir. Uzak Windows/Linux build ve yayın sonuçları için [GitHub Actions](https://github.com/eekilinc/Postaci/actions) ve [1.4.1 sürümü](https://github.com/eekilinc/Postaci/releases/tag/v1.4.1) kayıtlarına bakın.

Bu sonuçlar uygulamanın tüm koşullarda sorunsuz veya güvenlik açığından arınmış olduğu garantisi değildir.
