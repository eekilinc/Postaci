# Güvenlik ve veri sınırları

- API yalnızca `127.0.0.1` üzerinde dinler. Yerel tarayıcı oturumu HttpOnly / SameSite=Strict çerezi kullanır; Host ve Origin doğrulanır.
- Bu uygulama tek kullanıcılı bir masaüstü/yerel web istemcisidir. İnternete veya paylaşılan bir sunucuya doğrudan açılmamalıdır. Aynı işletim sistemi kullanıcısıyla çalışan zararlı yazılıma karşı ayrı bir güvenlik sınırı sunmaz.
- IMAP ve SMTP sertifika doğrulaması açıktır. STARTTLS zorunludur; kendinden imzalı sertifikalar otomatik kabul edilmez. Kurumsal sertifika kullanılıyorsa Node/Electron güven deposuna güvenilir CA eklenmelidir.
- Hesap parolaları ve OAuth erişim/yenileme anahtarları AES-256-GCM ile saklanır. Masaüstünde şifreleme anahtarı, kullanılabiliyorsa Electron safeStorage ile işletim sistemi kasasına bağlanır. Kasa olmayan Linux/CLI ortamında 0600 izinli yerel anahtar dosyası kullanılır. Windows CLI kullanımında kullanıcı dizininin ACL izinleri önemlidir.
- Bu koruma tüm posta veritabanını şifrelemez: ileti gövdeleri ve ekler yerel önbellekte bulunur. Disk şifrelemesi önerilir. `credentials.key` dosyası kaybolursa hesap sırları çözülemez; işletim sistemi kasasına bağlı dosyalar başka kullanıcıya kopyalanarak açılamaz. Taşıma için parolalı dışa aktarımı kullanın.
- Eski açık metin hesap alanları ilk açılışta taşınır; SQLite eski sayfaları temizlenir. Daha önce alınmış yedekler veya işletim sistemi anlık görüntüleri kendiliğinden temizlenmez.
- E-postalar scriptsiz, ayrı origin kullanan sandbox iframe içinde gösterilir. DOMPurify, CSS filtreleme, CSP ve görsel engelleme birlikte uygulanır. Görselleri bir ileti için açmak izleyici filtresini kapatmaz. İzleyici tespiti sezgiseldir; her izleyiciyi tanıma garantisi yoktur. Tam gizlilik için tüm dış görselleri kapalı tutun.
- Google OAuth, sistem tarayıcısı, tek kullanımlık ve süreli state, PKCE S256 kullanır. Projede ortak Google istemci sırrı bulunmaz. Kullanıcı kendi masaüstü OAuth istemcisini yapılandırır.
- Asistan varsayılan olarak kural tabanlıdır. İsteğe bağlı Ollama yalnızca localhost adresine bağlanır; cloud adları reddedilir. Postacı modeli kendisi indirmez. Kullanıcı Ollama sunucusunun ve seçtiği modelin yerel çalışmasından sorumludur.
- SMTP sonucu belirsizse otomatik tekrar yapılmaz. Aynı gönderim kimliği ile tekrar isteği yeni ileti üretmez. Kullanıcı elle yeni bir gönderim başlatmadan önce Gönderilenler klasörünü kontrol etmelidir.
- Gönderimi geri alma yalnızca geri sayım sırasında geçerlidir. SMTP sunucusuna iletilmiş bir e-posta geri çağrılmaz.
- Şifreli yedek, yalnızca indirilmiş yerel içeriği içerir. Bu sürüm ham içerikte 32 MB sınırı uygular ve geri yüklemede yalnızca birleştirme yapar. Büyük arşivler için veri dizininin işletim sistemi seviyesinde güvenli yedeğini ayrıca tutun.

Uygulama içi phishing puanı bir doğrulama sonucu değildir; şüpheli iletiler için göndereni bağımsız bir kanaldan kontrol edin.
