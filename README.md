# Postacı

React, TypeScript, Express ve Electron ile geliştirilmiş yerel e-posta istemcisi. Sürüm: **1.4.0**.

## Özellikler

- IMAP/SMTP ile birden fazla hesap; Google OAuth veya uygulama parolası.
- SQLite önbellek; yeni veri dizinlerinde yerel modül kullanılamıyorsa JSON alternatifi. Mevcut SQLite açılamazsa veri kaybını önlemek için başlatma durur.
- Sayfalı posta listesi, sunucudan eski iletileri getirme, arama ve sıralama.
- Kalıcı sabitleme/erteleme, klasörler, kişiler, takvim, temalar ve kısayollar.
- Gerçek görsel ve izleyici engelleme; izole HTML görüntüleme.
- 5–30 saniyelik gönderimi geri alma; eksik ek ve geçersiz alıcı uyarıları.
- Şifreli hesap saklama; parolalı tam yedek ve mevcut verilerle birleştirerek geri yükleme.
- Varsayılan kural tabanlı asistan; isteğe bağlı **yerel Ollama** ile özet, yanıt ve taslak üretimi.
- Tekrarlanan API isteklerinde çift gönderim koruması.

## Geliştirme

Node.js **22.21.1 veya üstü**, npm ve Git gerekir. Electron/SQLite paketleme işlemleri için platforma ait derleme araçları gerekebilir.

```sh
npm ci
npm run dev
```

Arayüz: `http://127.0.0.1:5173`. Yerel API: `http://127.0.0.1:3001`.

```sh
npm run desktop        # geliştirme ortamında Electron
npm run check          # tür kontrolü, lint, SQLite ve JSON testleri
npm run build          # üretim istemci/sunucu derlemesi
npm run test:bundle    # derlenmiş sunucuya karşı API testleri
npm run preview        # gerçek veri dizininden ayrı geçici önizleme (3101)
npm run pack:win       # NSIS kurulum + ZIP
npm run pack:linux     # AppImage + DEB
```

Testler sahte hesaplar ve geçici dizinler kullanır; gerçek postayı senkronize etmez veya göndermez. `provider: demo` gönderimleri yalnızca yerel test kaydı oluşturur. CI, Windows ve Linux üzerinde kontrolleri çalıştırır. Test/paketleme komutları yayın yapmaz.

## Hesaplar ve Google OAuth

Ayarlar bölümünde sağlayıcı, sunucu ve kimlik bilgilerini girin. Düzenlerken boş bırakılan parola mevcut parolayı korur; API mevcut sırları arayüze göndermez.

Google OAuth için kendi Google Cloud **Desktop app** istemci kimliğinizi yapılandırın. Giriş sistem tarayıcısında açılır. Varsayılan dönüş adresi `http://127.0.0.1:3001/api/auth/google/callback`; özel PORT kullanıldığında değişir. Sağlayıcıya ait onay/izin ve test kullanıcısı ayarları ayrıca gerekebilir. Alternatif olarak hesabın desteklediği uygulama parolası kullanılabilir.

## Yerel asistan

Ayarlar → Genel → Asistan motoru bölümünden **Yerel Ollama modeli** seçip bilgisayarınızda kurulu modelin adını girin ve tercihleri kaydedin. Ollama `127.0.0.1:11434` üzerinde çalışmalıdır. Postacı model indirmez ve bulut AI hizmetine bağlanmaz. Model erişilemiyorsa kural tabanlı sonuç kullanılır.

Model çıktıları taslaktır: göndermeden önce doğrulayın. Takvim/görev ayıklama ve phishing uyarıları kural tabanlıdır.

## Yedekleme ve taşıma

Ayarlar → Yedekleme & Veri bölümünde en az 12 karakterli bir parola ile şifreli yedek alın. Yedek; hesap sırları ve OAuth alanları, yerel iletiler/ekler, kişiler, takvim, klasörler ve tercihleri içerir. Parola saklanmaz; kaybedilirse yedek açılamaz.

Geri yükleme mevcut verileri silmeden birleştirir. Eski şifresiz hesap yedekleri okunabilir. İndirilmemiş ileti gövdeleri yedekte değildir. Tek dosyalı dışa aktarım ham içerikte 32 MB ile sınırlıdır; bu sınır aşılırsa açık hata verilir.

## Yapı

| Dizin | Görev |
|---|---|
| `client/src/components` | Arayüz ve ayrı yedekleme paneli |
| `client/src/hooks` | Sayfalama, istek yarışı kontrolü, gönderimi geri alma |
| `server/routes` | OAuth rotaları |
| `server/services` | Veritabanı, IMAP/SMTP, şifreleme, yedek, AI |
| `shared` | Ortak posta tipleri, sürüm ve tercih sözleşmesi |
| `desktop` | Electron, IPC ve işletim sistemi anahtar kasası |
| `tests` | Birim ve API entegrasyon testleri |

## Yapılandırma

| Değişken | Açıklama |
|---|---|
| `PORT` | Yerel sunucu portu; varsayılan 3001 |
| `POSTACI_DATA_DIR` | Veri dizini; CLI'da varsayılan `./data`, Electron'da kullanıcı uygulama verisi |
| `POSTACI_STORAGE=json` | JSON saklama biçimini açıkça seçer |
| `POSTACI_SEED_DEMO=0` | Başlangıç örnek verisini devre dışı bırakır |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sunucu tarafı OAuth yapılandırması |
| `POSTACI_AI_MODEL` | Yerel model adını geçersiz kılar; UI'da Ollama ayrıca etkin olmalıdır |
| `POSTACI_API_TOKEN` | İsteğe bağlı yerel otomasyon Bearer anahtarı; paylaşmayın |

API tek kullanıcı ve yerel kullanım içindir. E-posta listeleme artık `{items, hasMore, nextOffset}` döndürür; `limit`, `offset`, `sort` destekler. Yedek dışa aktarımı parolalı POST isteği gerektirir.

Ayrıntılar ve sınırlar: [Güvenlik](docs/SECURITY.md). Son değişiklikler: [Değişiklik kaydı](CHANGELOG.md). Çalıştırılan testler ve doğrulanmayan alanlar: [Doğrulama kaydı](docs/VALIDATION.md).

Teknik kaynaklar: [Electron güvenliği](https://www.electronjs.org/docs/latest/tutorial/security), [Google masaüstü OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Ollama generate API](https://docs.ollama.com/api/generate).
