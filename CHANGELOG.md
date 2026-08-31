# Değişiklik kaydı

## 1.4.0 — 2026-08-31

- Yerel oturum doğrulaması, Origin/Host kısıtlaması, CSP ve API sır maskelemesi.
- API/SSE erişiminde büyük/küçük harf ve son eğik çizgi üzerinden doğrulama atlaması kapatıldı; regresyon testleri eklendi.
- AES-256-GCM ile hesap sırları; eski kayıtlar için göç ve OS kasası desteği.
- Doğrulanan TLS/STARTTLS; Google OAuth state/PKCE ve sistem tarayıcısı.
- İzole e-posta HTML'i, çalışan görsel/izleyici tercihleri ve güvenli alıntı içeriği.
- Parolalı tam yedek, doğrulama ve hata durumunda geri alınan veri birleştirmesi.
- 500 kayıt sınırı yerine sayfalama; isteğe bağlı eski IMAP iletilerini yükleme.
- Gönderimi geri alma, eksik ek uyarısı ve idempotent gönderim kaydı.
- Sabitleme/erteleme alanlarının ve indirilmiş içeriklerin senkronizasyonda korunması.
- Hesap yenilemelerinde açık taslağın korunması; bozuk veri dosyalarında güvenli durma.
- Yerel Ollama seçeneği; kural tabanlı modun açıkça belirtilmesi.
- Ortak tipler, ayrılmış hook/panel/rota modülleri ve Node 22 gereksinimi.
- Güncel Electron/SMTP/yükleme/paketleme bağımlılıkları; test ve CI altyapısı.
- Dış Google Fonts isteği ve gömülü OAuth istemci sırrı kaldırıldı.

Yedekle geri yükleme yalnızca birleştirme yapar; mevcut verileri silip değiştirme modu eklenmedi.
