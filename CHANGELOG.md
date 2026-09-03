# Değişiklik kaydı

## 1.4.5 — 2026-09-03

- E-posta gövdesi görünürlüğü: ImapFlow `Promise.race` kilit deadlock'ı giderildi (`acquireTimeout: 15000` kullanıldı); `GET /api/emails/:id` üzerinde gövde eksik veya sadece özet ise otomatik IMAP tam gövde çekme tetiklendi; `updateEmailBody` URL-encoded/raw/messageId esnek eşleştirmesi sağlandı; `syncAccount` en yeni 10 okunmamış ve 5 gelen kutusu e-postası için gövde önceden yükleniyor.
- Otomatik okundu (`\Seen`) işaretleme: İletiye tıklandığında veya klavyeyle sonraki/önceki mesaja geçildiğinde anında yerel optimistik sayaç güncellemesi ve sunucu bayrak eşitlemesi sağlandı; kullanıcının manuel "okunmadı" tercihi oturum boyunca korundu; bayrak güncellemelerinde sunucu ağ gecikmelerine karşı hata dayanıklılığı sağlandı.
- İstemci gövde yenileme: `EmailDetail` içine gövde henüz çekilmediğinde kullanıcıyı bilgilendiren ve anında gövdeyi yeniden getiren "Gövdeyi Yeniden Getir" düğmesi eklendi.

## 1.4.4 — 2026-09-03

- Gövde görünmüyor düzeltmesi: `fetchFullEmailBody` artık `mailboxPath`'i çözümlüyor ve `imapUid=0` durumunda `messageId` ile yeniden arama yapıyor; `GET /api/emails/:id` artık `messageId` ile de tetikleniyor.
- İstemci gövde dayanıklılığı: `EmailDetail` ham gövde boşsa `snippet` fallback ve boş sanitizasyon koruması, `hasFullBody=false` için yükleniyor uyarısı eklendi.
- IMAP gövde ayrıştırma: `text`/`html` en az biri garanti, `hasFullBody` doğru işaretleniyor.

## 1.4.3 — 2026-09-03

- Build düzeltmesi: `server/services/oauthAttemptStatus.ts` ve ilgili OAuth/test dosyaları repoya eklendi — `tsc` hatası giderildi.
- `.gitignore` güncellendi (`.meshdeps/`, `ucak_govde_*` artefaktları hariç).

## 1.4.2 — 2026-09-03

- Silme → Çöp Kutusu güvenilirliği: IMAP `MOVE` artık senkron ve `502` ile hata bildiriyor; fire-and-forget kaldırıldı.
- Stale UID dayanıklılığı: `move`/`delete`/`flag` işlemlerinde `messageId` ile yeniden arama ve retry, `requireImapSuccess` kontrolleri.
- Yerel silme takibi: `TRASH`’a taşınan iletiler `deleted_records`’a yazılıyor; senkronizasyonda geri dirilme engellendi.
- README, EzanApp referansıyla tamamen yenilendi (rozetler, tablo, kurulum, mimari ve CI/CD diyagramı).
- `release.yml` Windows + Linux paralel build ve otomatik GitHub Release yayınlama.

## 1.4.1 — 2026-08-31

- Windows'ta 3001 portunun kullanılması/engellenmesi nedeniyle oluşan başlangıç hatası giderildi; masaüstü artık boş yerel port kullanır.
- Sunucunun hazır olması doğrudan dinleme sonucundan doğrulanır; hata ayrıntıları ve neden zinciri startup-error.log dosyasına yazılır.
- OAuth, Host/Origin doğrulaması ve ayarlarda gösterilen dönüş adresi gerçek porta bağlandı.
- Açılışta yükleme/hata/yeniden deneme ekranı; takılan istekler için zaman aşımı eklendi.
- İki sütunda liste yenilenince istemsiz ileti açılması giderildi; görünüm tercihleri sunucuda saklanır.
- Boş hesap listesi ve sonuçsuz aramalar için eylemler; liste hatalarında yeniden deneme eklendi.
- Küçük pencerelerde ayar panelinin ve dar posta sütunlarında filtrelerin kesilmesi giderildi.
- Yayın öncesi paketlenmiş Electron/SQLite/API başlangıç testi ve ilgili regresyon testleri eklendi.

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
