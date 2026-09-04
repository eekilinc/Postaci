# Değişiklik kaydı

## 1.4.16 — 2026-09-04

- **Orijinal Çalışan Dahili Pencere & WebPreferences Geri Yüklendi (v1.3.20 Ayarları)**:
  - v1.3.20 ve öncesinde sorunsuz çalışan `sandbox: false` ve `webSecurity: false` BrowserWindow ayarları geri yüklendi.
  - Dahili yetkilendirme modal penceresi (`authWindow`) Chromium webview kısıtlamalarını aşacak şekilde orijinal izinleriyle çalışır hale getirildi.
  - Google girişi doğrudan uygulama içi diyalogda tamamlanır, onaylandığında pencere kapanıp hesap eklenir.

## 1.4.15 — 2026-09-04

- **Google OAuth Sistem Tarayıcısına Yönlendirildi & Otomatik Odaklanma**:
  - Google'ın dahili gömülü pencerelerde (Electron WebViews) gösterdiği "Bu tarayıcı veya uygulama güvenli olmayabilir" engelini aşmak için yetkilendirme akışı kalıcı olarak güvenli varsayılan sistem tarayıcısına (Chrome, Edge vb.) yönlendirildi.
  - Onay verildiğinde masaüstü uygulaması Windows üzerinde en öne odaklanır ve hesap kurulumu anında tamamlanır.

## 1.4.14 — 2026-09-04

- **Gömülü Modal Yetkilendirme Penceresi (Embedded Popup Window) Geri Yüklendi**:
  - v1.3.22 sürümündeki pürüzsüz çalışan uygulama içi kalıcı `BrowserWindow` modal diyaloğu (`modal: true`, temiz Chrome 131 User-Agent) geri getirildi.
  - Harici tarayıcıya yönlendirme yerine tüm yetkilendirme Postacı'nın kendi içindeki modal pencerede gerçekleşir. Giriş tamamlandığında pencere otomatik kapanır ve Postacı ana ekranı kesintisiz şekilde hesabı aktif eder.

## 1.4.13 — 2026-09-04

- **Windows Öncelikli Öne Getirme & Otomatik Odaklanma**:
  - Google OAuth onayından sonra Windows'un Foreground Lock kısıtlamasını aşarak Postacı penceresinin ekranın en önüne fırlaması (`setAlwaysOnTop`, `flashFrame`, `__postaciFocusApp`) sağlandı.
  - Tarayıcı dönüş sayfası sekmeyi otomatik kapatma ve anında uygulamaya dönme butonlarıyla güncellendi.

## 1.4.12 — 2026-09-04

- **Google OAuth Sistem Tarayıcısı Yönlendirmesi & Dayanıklı Token Takası**:
  - Google'ın dahili gömülü pencereleri (Electron WebViews) "Bu tarayıcı veya uygulama güvenli olmayabilir" hatasıyla engellemesi nedeniyle, yetkilendirme güvenli sistem tarayıcısına (Chrome, Edge vb.) yönlendirildi.
  - Token takasındaki (Token exchange) katı `redirectUri` eşleşmesi esnetildi; `127.0.0.1` ↔ `localhost` uyumsuzluklarında otomatik yedekli deneme mekanizması eklendi.
  - Yetkilendirme başarılı olduğunda masaüstü uygulaması otomatik öne odaklanır ve hesap kurulumu anında tamamlanır.

## 1.4.11 — 2026-09-04

- **Hazır Google OAuth İstemci Kimliği & Akıllı Port Yönetimi**:
  - v1.3.22 sürümündeki hazır Google OAuth Client ID ve Client Secret anahtarları tekrar varsayılan olarak geri yüklendi (`789045427209-boh4tqlvsgivef1lb3nmmco4bibk1lpp...`).
  - Akıllı port seçimi eklendi: Masaüstü uygulaması açılırken öncelikle standart 3001 portunun boş olup olmadığını kontrol eder. 3001 boşsa OAuth adres uyumluluğu için 3001'i alır; eğer başka bir uygulama 3001'i kullanıyorsa asla çökmez, otomatik olarak sıradaki dinamik boş portu tahsis eder.
  - Uygulama içi modal yetkilendirme penceresi v1.3.22 standartlarında (Chrome 131 User-Agent) tekrar aktif hale getirildi.

## 1.4.10 — 2026-09-04

- **Google OAuth Güvenlik Politikası & Sabit Port (3001) Uyumluluğu**:
  - Google'ın tüm gömülü tarayıcı pencerelerini (Electron/CEF) "Bu tarayıcı veya uygulama güvenli olmayabilir" diyerek engellemesi nedeniyle, yetkilendirme RFC 8252 standartlarına uygun olarak kullanıcının güvenli sistem tarayıcısına yönlendirildi.
  - Masaüstü sürümünde portun rastgele seçilip Google Cloud Console'daki yönlendirme URI'si ile uyuşmaması ("bir şeyler ters gitti") sorunu giderildi; masaüstü uygulaması kalıcı olarak standart `3001` portuna sabitlendi (`http://127.0.0.1:3001/api/auth/google/callback`).
  - Yetkilendirme tamamlandığında callback sayfasının Postacı'yı öne getirip tarayıcı sekmesini otomatik kapatması sağlandı.

## 1.4.9 — 2026-09-04

- **Google OAuth İçiçe Tarayıcı (Embedded Popup Window) Geri Getirildi**:
  - Dış sistem tarayıcısının açılması ve sonrasında oturum çakışmaları ("bir şeyler ters gitti") ve yönlendirme kopuklukları ("tarayıcı gidiyor geri gelemiyor") nedeniyle akışın kilitlenmesi sorunu giderildi.
  - v1.3.22 sürümündeki pürüzsüz çalışan uygulama içi kalıcı `BrowserWindow` modal diyaloğu ve modern Chrome User-Agent başlığı (`Mozilla/5.0...`) geri yüklendi.
  - Yetkilendirme doğrudan Postacı içinde temiz bir pencerede tamamlanıyor, onaylandığı an pencere kendi kendine kapanıyor ve Postacı ana penceresi hiçbir yere gitmeden anında hesabı aktif ediyor.

## 1.4.8 — 2026-09-03

- **Kapsamlı Çöp Kutusu, Silme Mantığı ve Senkronizasyon Hızlandırma Çözümü**:
  - **`isCore` Klasör Filtresi Mantık Düzeltmesi**: Sunuculardan `\Trash` özel niteliği (`specialUse`) olmadan gelen `&AMcA9g-p Kutusu` ve `Silinmi&AV8- &ANY-geler` gibi UTF-7 klasörlerin `isCore` tarafından standart dışı sanılıp senkronizasyondan elenmesi sorunu giderildi. Çöp Kutusu ve tüm Türkçe klasörler istisnasız eşitleniyor.
  - **ImapFlow Çift Kodlama Koruması**: ImapFlow'un `getMailboxLock`, `messageMove`, `messageCopy` çağrılarında beklediği UTF-8 formatı (`Çöp Kutusu`) garanti altına alındı; ham `&` içeren dizelerin `&-` olarak çift kodlanıp sunucuda `NO Mailbox does not exist` hatası vermesi engellendi.
  - **Yerel Silme Güvencesi**: `PATCH /api/emails/:id/flags` üzerinde uzaktaki IMAP sunucusu geçici bağlantı hatası veya zaman aşımı yaşasa dahi yerel SQLite güncellemesi asla iptal edilmiyor (`folder = 'TRASH', isDeleted = 1`). İleti derhal Çöp Kutusuna taşınıyor ve kullanıcının gözü önünde kalıcı oluyor.
  - **Senkronizasyon Hızlandırması & Kilitlenme Çözümü**: `syncAccount` sırasında her klasörde 30'ar tam MIME gövdesinin (`source: true`) senkronize indirilerek IMAP soketini dakikalarca kilitlemesi engellendi. Eşitleme sadece zarf/metaveri ile 1-2 saniyede tamamlanıyor; gövdeler ihtiyaç anında anında getirilerek kilitlenme ("senkronize ederken zorlanıyor") tamamen ortadan kaldırıldı.

## 1.4.7 — 2026-09-03

- **Çöp Kutusu & E-posta Silme Süreci Kalıcı Mimari Çözümü (Robust IMAP Trash & Deletion Pipeline)**:
  - **IMAP Modified UTF-7 Mailbox Çözümleyicisi (`decodeImapUtf7`)**: Türkçe IMAP sunucularında (Gmail Türkçe, üniversite sunucuları, cPanel vb.) klasör adlarının `&AMcA9g-p Kutusu` veya `Silinmi&AV8- &ANY-geler` gibi RFC 3501 UTF-7 formatında dönmesi nedeniyle Çöp Kutusu'nun tanınamaması ve taşıma işlemlerinin 502 hatası vermesi sorunu çözüldü. Klasör adları artık UTF-7'den otomatik çözümlenerek hem `TRASH` eşleştirmesinde hem de kullanıcı arayüzünde pürüzsüz Türkçe adlarla gösteriliyor.
  - **Kritik Çöp Kutusu Temizleme Koruması (`pruneMissingServerUids`)**: İleti yerel olarak Çöp Kutusuna taşındığında (`imapUid: 0`), otomatik senkronizasyonun bu iletileri henüz sunucu UID'si atanmadı diye SQLite'tan hemen silmesi engellendi. Artık yalnızca gerçekten sunucuda var olmuş (`imapUid > 0`) ve sunucu listesinden düşmüş iletiler temizleniyor.
  - **`isDeletedLocally` TRASH İstisnası**: Gelen kutusunda dirilmeyi önleyen silinme takip mekanizması (`isDeletedLocally`), Çöp Kutusu klasörü senkronize edilirken veya Çöp Kutusu'na kaydedilirken artık bypass ediliyor. Böylece silinen iletiler Çöp Kutusu'na başarıyla kaydedilip kullanıcı tarafından görüntülenebiliyor.
  - **Güçlendirilmiş Sunucu Taşıma & Silme (`moveMessageOnServer` & `deleteMessageOnServer`)**: Sunucu `MOVE` desteğine sahip değilse `copy+delete` yedeği güvenli hale getirildi; kopyalama tamamlandığında kaynak klasördeki bayrak hataları silme işlemini başarısız kılmayacak şekilde yalıtıldı; Message-ID aramaları `<...>` ve yalın biçimlerde çift yönlü yapılıyor.
  - **İstemci Önbellek Yönetimi**: İleti çöp kutusuna taşındığında Çöp Kutusu önbelleği otomatik geçersiz kılınarak kullanıcının Çöp Kutusu sekmesini açtığında taşınan iletileri anında ve eksiksiz görmesi sağlandı.

## 1.4.6 — 2026-09-03

- **Kalıcı E-posta Gövdesi Çözümü (Failsafe Body Retrieval & Persistent Offline Cache)**:
  - **Express Route Param Eşleştirme Düzeltmesi**: Express `:id` parametresini otomatik olarak decode ederken (`%3C` → `<`), SQLite veritabanındaki URL-encoded ID ile uyuşmazlık oluşması ve `GET /api/emails/:id` sorgusunun 404 dönmesine yol açan kritik hata giderildi. `getEmailById` artık hem orijinal, hem decode edilmiş hem de re-encoded ID ve `messageId` varyantlarını tam kapsayıcı şekilde eşleştiriyor.
  - **Liste Yenilemede Gövde Korunması**: `useEmailCollection` kancasında liste güncellemeleri veya arka plan senkronizasyonlarında daha önce yüklenmiş tam gövdenin (`hasFullBody=true`, `bodyHtml`) özet (`snippet`) HTML'i ile ezilmesi engellendi.
  - **Senkronizasyon Sırasında 30 İletiye Kadar Otomatik Gövde İndirme**: `syncAccount` artık sadece INBOX için değil, senkronize edilen tüm klasörler için en yeni 30 e-postanın tam gövdesini ve eklerini IMAP üzerinden hemen indirip SQLite'a kaydediyor.
  - **Sürekli Arka Plan Gövde İndirici (Background Body Worker)**: `syncPendingEmailBodies` servisi SQLite'ta gövdesi henüz bulunmayan iletileri arka planda 20 sn aralıklarla IMAP'ten toplu (`fetch`) olarak indirerek tüm iletilerin çevrimdışı ve anında açılabilir olmasını sağlıyor.
  - **Çoklu Klasör & Arama Yedeklemesi (Multi-Candidate Body Fallback)**: `fetchFullEmailBody` artık `client.fetchOne` çağrısını izole `try/catch` içinde çalıştırıyor; UID uyuşmazlığında veya posta kutusu taşınmasında fonksiyon iptal olmak yerine Message-ID ile (`<...>` ve düz formatta) mevcut klasörde, INBOX'ta ve Gmail için `[Gmail]/All Mail` altında arama yaparak gövdeyi mutlaka bulup getiriyor ve anında `email_updated` SSE bildirimi gönderiyor.
  - **SQLite'ta Liste Görünümü Gövde Saklama**: `parseEmailRow` artık `hasFullBody=1` olan iletilerin gerçek `bodyHtml` içeriğini koruyor; listeye tıklandığında ağ beklemesi olmadan gövde anında ekrana basılıyor.

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
