import { Account, Email, Contact, CalendarEvent } from '../types.js';

export const initialAccounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Ahmet Yılmaz (İş)',
    email: 'ahmet.yilmaz@teknocorp.com',
    provider: 'demo',
    color: '#3b82f6', // blue
    isDefault: true,
    signature: '--\nAhmet Yılmaz\nKıdemli Yazılım Mimarı | TeknoCorp A.Ş.\nTel: +90 532 111 22 33',
    syncInterval: 60,
    lastSyncedAt: new Date().toISOString()
  },
  {
    id: 'acc-2',
    name: 'Ahmet (Kişisel)',
    email: 'ahmet.personal@gmail.com',
    provider: 'demo',
    color: '#10b981', // emerald
    isDefault: false,
    signature: 'İyi çalışmalar,\nAhmet',
    syncInterval: 120,
    lastSyncedAt: new Date().toISOString()
  },
  {
    id: 'acc-3',
    name: 'Açık Kaynak & Topluluk',
    email: 'dev@postaci.app',
    provider: 'demo',
    color: '#8b5cf6', // purple
    isDefault: false,
    signature: '🚀 Postacı Topluluğu | postacı.app',
    syncInterval: 300,
    lastSyncedAt: new Date().toISOString()
  }
];

export const initialContacts: Contact[] = [
  {
    id: 'cnt-1',
    name: 'Zeynep Kaya',
    email: 'zeynep.kaya@teknocorp.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    company: 'TeknoCorp A.Ş.',
    role: 'Ürün Yöneticisi',
    phone: '+90 533 222 33 44',
    isStarred: true,
    notes: 'Q3 Yol Haritası ve Mobil Uygulama sorumlusu.',
    lastContactedAt: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'cnt-2',
    name: 'Emre Demir',
    email: 'emre.demir@teknocorp.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    company: 'TeknoCorp A.Ş.',
    role: 'DevOps & Bulut Lideri',
    phone: '+90 535 333 44 55',
    isStarred: true,
    notes: 'Kubernetes altyapısı ve AWS maliyet optimizasyonu.',
    lastContactedAt: new Date(Date.now() - 3600000 * 18).toISOString()
  },
  {
    id: 'cnt-3',
    name: 'Dr. Selin Arslan',
    email: 'selin.arslan@bogazici.edu.tr',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    company: 'Boğaziçi Üniversitesi',
    role: 'Yapay Zeka Araştırmacısı',
    phone: '+90 212 359 00 00',
    isStarred: false,
    notes: 'LLM mimarileri ve Türkçe NLP işbirliği.',
    lastContactedAt: new Date(Date.now() - 3600000 * 48).toISOString()
  },
  {
    id: 'cnt-4',
    name: 'GitHub Bildirimleri',
    email: 'notifications@github.com',
    avatar: 'https://github.githubassets.com/favicons/favicon.png',
    company: 'GitHub Inc.',
    role: 'CI/CD & Repository Bot',
    isStarred: false
  },
  {
    id: 'cnt-5',
    name: 'Canan Özkan',
    email: 'canan.ozkan@fintechplus.io',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    company: 'FintechPlus',
    role: 'Finans Direktörü',
    phone: '+90 532 999 88 77',
    isStarred: true,
    lastContactedAt: new Date(Date.now() - 3600000 * 72).toISOString()
  }
];

const now = Date.now();
const hour = 3600 * 1000;
const day = 24 * hour;

export const initialEmails: Email[] = [
  {
    id: 'mail-1',
    accountId: 'acc-1',
    threadId: 'thread-q3-sync',
    fromName: 'Zeynep Kaya',
    fromEmail: 'zeynep.kaya@teknocorp.com',
    to: [{ name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@teknocorp.com' }],
    cc: [{ name: 'Emre Demir', email: 'emre.demir@teknocorp.com' }],
    bcc: [],
    subject: '🚨 Q3 Sistem Mimarisi Değerlendirmesi & Canlıya Çıkış Planı',
    snippet: 'Ahmet selam, yeni e-posta ve bildirim altyapısının yük testleri tamamlandı. Çarşamba günü saat 14:00 için toplantı...',
    bodyText: `Ahmet selam,

Yeni e-posta ve bildirim altyapısının yük testleri başarıyla tamamlandı. Sonuçlar beklediğimizden çok daha iyi: saniyede 15.000 eşzamanlı işlemde gecikme süresi 45ms altında kaldı.

Çarşamba günü saat 14:00'te mimari ekiple son bir kontrol toplantısı yapıp canlıya geçiş adımlarını netleştirelim.

Toplantı daveti ektedir, lütfen takvimine ekleyip katılım durumunu belirt.

Gündem Maddeleri:
1. IMAP IDLE canlı senkronizasyon performans metrikleri
2. SQLite FTS5 arama indeksi bellek kullanımı
3. Oltalama ve spam tespit filtresi doğruluk oranı

Sevgiler,
Zeynep Kaya`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><strong>Ahmet selam,</strong></p>
  <p>Yeni e-posta ve bildirim altyapısının yük testleri başarıyla tamamlandı. Sonuçlar beklediğimizden çok daha iyi: <strong>saniyede 15.000 eşzamanlı işlemde gecikme süresi 45ms altında kaldı.</strong> 🚀</p>
  <p>Çarşamba günü saat 14:00'te mimari ekiple son bir kontrol toplantısı yapıp canlıya geçiş adımlarını netleştirelim.</p>
  
  <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 8px; margin: 18px 0;">
    <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 15px;">📅 Toplantı Gündemi:</h4>
    <ol style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
      <li>IMAP IDLE canlı senkronizasyon performans metrikleri</li>
      <li>SQLite FTS5 arama indeksi bellek kullanımı</li>
      <li>Oltalama ve spam tespit filtresi doğruluk oranı</li>
    </ol>
  </div>

  <p>Toplantı daveti eklenmiştir, lütfen takvimine ekleyip katılım durumunu belirt.</p>
  <p style="margin-top: 24px; color: #64748b; font-size: 13px;">Sevgiler,<br><strong>Zeynep Kaya</strong><br>Ürün Yöneticisi | TeknoCorp</p>
</div>`,
    date: new Date(now - 25 * 60 * 1000).toISOString(), // 25 min ago
    isRead: false,
    isStarred: true,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'INBOX',
    labels: ['İş', 'Yüksek Öncelik', 'Mimari'],
    priority: 'high',
    attachments: [
      {
        id: 'att-1',
        filename: 'Yuk_Testi_Raporu_v2.pdf',
        contentType: 'application/pdf',
        size: 2458000, // 2.4 MB
        url: '#'
      },
      {
        id: 'att-2',
        filename: 'Mimari_Semasi_v3.png',
        contentType: 'image/png',
        size: 1120000, // 1.1 MB
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80'
      }
    ],
    meetingInvite: {
      uid: 'meet-q3-sync-2026',
      summary: 'Q3 Sistem Mimarisi Değerlendirmesi & Canlıya Geçiş',
      description: 'Yük testi sonuçlarının analizi ve canlı dağıtım adımlarının kesinleştirilmesi.',
      location: 'TeknoCorp Ana Bina - Toplantı Odası 4A / Google Meet',
      startTime: new Date(now + 2 * day).toISOString().split('T')[0] + 'T11:00:00.000Z',
      endTime: new Date(now + 2 * day).toISOString().split('T')[0] + 'T12:00:00.000Z',
      organizer: { name: 'Zeynep Kaya', email: 'zeynep.kaya@teknocorp.com' },
      status: 'NEEDS-ACTION'
    },
    aiSummary: 'Zeynep, yeni bildirim ve e-posta altyapısının yük testlerinin 45ms altında tamamlandığını bildirdi. Çarşamba 14:00 toplantısı için takvim daveti ve 2 ek rapor paylaştı.',
    aiSmartReplies: [
      'Harika haber Zeynep! Çarşamba 14:00 toplantısına katılıyorum, takvime işledim.',
      'Yük testi sonuçları çok etkileyici. Raporu inceleyip toplantı öncesi notlarımı ileteceğim.',
      'Teşekkürler, sunucu tarafındaki son metrikleri de toplantıda sunmaya hazır hale getireceğim.'
    ],
    aiCategory: 'İş & Proje'
  },
  {
    id: 'mail-2',
    accountId: 'acc-1',
    threadId: 'thread-k8s-cost',
    fromName: 'Emre Demir',
    fromEmail: 'emre.demir@teknocorp.com',
    to: [{ name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@teknocorp.com' }],
    cc: [],
    bcc: [],
    subject: 'Kubernetes Cluster Optimizasyonu ve AWS Maliyet Düşüşü (%34)',
    snippet: 'Selam Ahmet, geçen hafta konuştuğumuz Karpenter ve Graviton3 geçişini tamamladık. Son 7 günün maliyet grafiğini ekte paylaşıyorum...',
    bodyText: `Selam Ahmet,

Geçen hafta konuştuğumuz Karpenter ve AWS Graviton3 node geçişini staging ve prod cluster'larında tamamladık.

İlk 7 günlük verilere göre:
- Toplam sunucu maliyetlerinde %34 net tasarruf sağlandı.
- Pod başlatma süreleri 85 saniyeden 12 saniyeye indi.
- Bellek tüketiminde %18 daha verimli profil elde ettik.

Dashboard bağlantısı: https://grafana.internal.teknocorp.com/d/k8s-cost

Eline sağlık, mimari dokümanındaki önerilerin tam isabet oldu.

Emre Demir`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Selam Ahmet,</p>
  <p>Geçen hafta konuştuğumuz <strong>Karpenter</strong> ve <strong>AWS Graviton3</strong> node geçişini staging ve prod cluster'larında tamamladık.</p>
  
  <div style="background: linear-gradient(135deg, #10b98115, #3b82f615); border: 1px solid #10b98140; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <h4 style="margin: 0 0 10px 0; color: #059669; font-size: 15px;">📊 7 Günlük İlk Kazanımlar:</h4>
    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
      <li>Toplam sunucu maliyetlerinde <strong>%34 net tasarruf</strong> sağlandı.</li>
      <li>Pod başlatma süreleri 85 saniyeden <strong>12 saniyeye</strong> indi.</li>
      <li>Bellek tüketiminde <strong>%18 daha verimli</strong> profil elde ettik.</li>
    </ul>
  </div>

  <p>Grafana paneli üzerinden detaylı metrikleri inceleyebilirsin: <a href="#" style="color: #2563eb; text-decoration: underline;">Grafana Maliyet Paneli</a></p>
  <p>Eline sağlık, mimari dokümanındaki önerilerin tam isabet oldu!</p>
  <p style="color: #64748b; font-size: 13px;">— Emre Demir | DevOps Lideri</p>
</div>`,
    date: new Date(now - 3 * hour).toISOString(),
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'INBOX',
    labels: ['DevOps', 'Bulut'],
    priority: 'normal',
    attachments: [
      {
        id: 'att-3',
        filename: 'Maliyet_Tasarruf_Grafana.csv',
        contentType: 'text/csv',
        size: 45000,
        url: '#'
      }
    ],
    aiSummary: 'Emre, Karpenter ve Graviton3 geçişiyle AWS maliyetlerinde %34 tasarruf ve pod açılış hızında %85 iyileşme sağlandığını bildirdi.',
    aiSmartReplies: [
      'Harika bir sonuç Emre! Emeğine sağlık, yönetime sunulacak rapora bu verileri ekleyelim.',
      'Süper haber. Staging testlerinde herhangi bir CPU darboğazı gözlendi mi?',
      'Eline sağlık, hafta sonu cluster loglarını da birlikte kontrol edelim.'
    ],
    aiCategory: 'DevOps & Altyapı'
  },
  {
    id: 'mail-3',
    accountId: 'acc-2',
    threadId: 'thread-gym-pass',
    fromName: 'FitLife Club',
    fromEmail: 'uyelik@fitlifeclub.com.tr',
    to: [{ name: 'Ahmet Yılmaz', email: 'ahmet.personal@gmail.com' }],
    cc: [],
    bcc: [],
    subject: '🌟 Yıllık Üyeliğiniz Yenilendi & Özel Spa Avantajınız',
    snippet: 'Değerli Ahmet Bey, FitLife Platinum üyeliğiniz başarıyla yenilenmiştir. Bu aya özel 2 adet ücretsiz seans...',
    bodyText: `Değerli Ahmet Bey,

FitLife Platinum üyeliğiniz başarıyla yenilenmiştir. Spor dolu bir yıl dileriz!

Üyeliğinize tanımlanan ayrıcalıklar:
- Sınırsız Havuz, Sauna & Buhar Odası kullanımı
- 2 Adet Ücretsiz Bireysel Antrenör (PT) seansı
- FitLife Cafe'de geçerli %20 indirim çeki

Faturanız ektedir.

Sağlıklı günler dileriz,
FitLife Ekibi`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 22px; letter-spacing: 0.5px;">FITLIFE PLATINUM</h2>
    <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 13px;">Premium Spor ve Sağlıklı Yaşam Kulübü</p>
  </div>
  <div style="padding: 24px;">
    <p style="font-size: 16px; margin-top: 0;">Değerli <strong>Ahmet Bey</strong>,</p>
    <p style="color: #475569;">FitLife Platinum üyeliğiniz başarıyla yenilendi. Yeni dönemde hedeflerinize ulaşmanız için yanınızdayız.</p>
    
    <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h4 style="margin: 0 0 8px 0; color: #0f172a;">🎁 Size Özel Hediye Kuponunuz:</h4>
      <p style="margin: 0; font-family: monospace; font-size: 16px; color: #e11d48; font-weight: bold;">FIT-PLATINUM-2026</p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">2 Adet Ücretsiz PT Seansı & Spa Girişi içerir.</p>
    </div>

    <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">E-faturanız sisteme kayıtlı e-posta adresinize iletilmiştir.</p>
  </div>
</div>`,
    date: new Date(now - 12 * hour).toISOString(),
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'INBOX',
    labels: ['Kişisel', 'Faturalar'],
    priority: 'low',
    attachments: [
      {
        id: 'att-4',
        filename: 'FitLife_E-Fatura_TR992384.pdf',
        contentType: 'application/pdf',
        size: 184000,
        url: '#'
      }
    ],
    aiSummary: 'FitLife spor kulübü yıllık üyelik yenilemesini ve hediye 2 PT seans kuponunu iletti.',
    aiSmartReplies: [
      'Bilgilendirme için teşekkürler.',
      'PT seansları için hangi günlerde randevu alabilirim?'
    ],
    aiCategory: 'Kişisel & Abonelik'
  },
  {
    id: 'mail-4',
    accountId: 'acc-3',
    threadId: 'thread-github-pr',
    fromName: 'GitHub - Postaci App',
    fromEmail: 'notifications@github.com',
    to: [{ name: 'Postacı Maintainers', email: 'dev@postaci.app' }],
    cc: [],
    bcc: [],
    subject: '[PR #142 Merged] Feat: IMAP IDLE Push Notifications & Offline Sync Engine',
    snippet: 'Pull request #142 was successfully merged into main by @ahmet-dev. All 68 unit & integration tests passed...',
    bodyText: `Pull request #142 by @ahmet-dev has been merged into main.

Title: Feat: IMAP IDLE Push Notifications & Offline Sync Engine
Changes: +1,420 / -180 lines across 14 files.

Checks:
✅ TypeScript TypeCheck: Passed
✅ Vitest Unit Tests: 68/68 Passed (100%)
✅ Bundle Analyzer: Total client bundle size 142KB gzipped

View on GitHub: https://github.com/postaci-app/postaci/pull/142`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #24292f; line-height: 1.5;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
    <span style="background-color: #8250df; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold;">Merged #142</span>
    <span style="font-size: 14px; font-weight: 600;">Feat: IMAP IDLE Push Notifications & Offline Sync Engine</span>
  </div>
  <p style="color: #57606a; font-size: 13px;">Merged by <strong>@ahmet-dev</strong> into <code>main</code></p>
  
  <div style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 13px;">Automated Checks:</p>
    <div style="font-size: 13px; color: #1a7f37; margin-bottom: 4px;">✔ TypeScript Compilation: 0 errors</div>
    <div style="font-size: 13px; color: #1a7f37; margin-bottom: 4px;">✔ Vitest Suite: 68 tests passed (1.4s)</div>
    <div style="font-size: 13px; color: #1a7f37;">✔ Client Gzip Bundle: 142.8 KB</div>
  </div>
</div>`,
    date: new Date(now - 1 * day).toISOString(),
    isRead: false,
    isStarred: true,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'INBOX',
    labels: ['GitHub', 'Geliştirme'],
    priority: 'normal',
    attachments: [],
    aiSummary: 'GitHub PR #142 (IMAP IDLE ve Çevrimdışı senkronizasyon motoru) başarıyla main dalına merge edildi, tüm testler geçti.',
    aiSmartReplies: [
      'Sürüm notlarına ve CHANGELOG.md dosyasına ekleyelim.',
      'Test ortamında yeni paketi derleyip deploy edelim.'
    ],
    aiCategory: 'Yazılım & Açık Kaynak'
  },
  {
    id: 'mail-5',
    accountId: 'acc-1',
    threadId: 'thread-phishing-alert',
    fromName: 'IT Güvenlik Ekibi',
    fromEmail: 'security-warning@teknocorp.com',
    to: [{ name: 'Tüm Çalışanlar', email: 'all@teknocorp.com' }],
    cc: [],
    bcc: [],
    subject: '⚠️ DİKKAT: Şüpheli E-Posta ve Oltalama (Phishing) Girişimleri Hakkında',
    snippet: 'Son 24 saat içinde şirket dışından gelen sahte "Şifre Güncelleme" başlıklı e-postalara karşı dikkatli olunması...',
    bodyText: `Değerli Çalışanlarımız,

Son 24 saat içinde şirket dışı sahte sunuculardan çalışanlarımıza gönderilen "Şifrenizin Süresi Doldu, Hemen Güncelleyin" başlıklı e-postalar tespit edilmiştir.

Lütfen dikkat ediniz:
1. Şirket IT departmanı hiçbir zaman e-posta üzerinden şifre girmenizi isteyen harici bağlantı göndermez.
2. Gelen e-postalardaki gönderici alan adını (teknocorp.com harici uzantılar) kontrol ediniz.
3. Şüpheli iletileri açmadan Postacı üzerindeki "Spam / Oltalama Bildir" butonunu kullanınız.

Güvenli günler dileriz,
Bilgi Güvenliği Operasyon Merkezi (SOC)`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 6px solid #ef4444; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 8px 0; color: #991b1b; font-size: 16px;">🛡️ BİLGİ GÜVENLİĞİ VE OLTALAMA UYARISI</h3>
    <p style="margin: 0; color: #b91c1c; font-size: 13px;">Son 24 saatte tespit edilen sahte şifre yenileme e-postalarına karşı şirket genelinde güvenlik seviyesi artırılmıştır.</p>
  </div>
  
  <p>Değerli Çalışanlarımız,</p>
  <p>Son 24 saat içinde şirket dışı sahte sunuculardan çalışanlarımıza gönderilen <em>"Şifrenizin Süresi Doldu"</em> başlıklı e-postalar tespit edilmiştir.</p>
  
  <ul style="color: #334155; line-height: 1.8;">
    <li>Şirket IT departmanı <strong>asla harici link üzerinden şifre talep etmez</strong>.</li>
    <li>Gönderen adresinin <code>@teknocorp.com</code> olduğundan emin olunuz.</li>
    <li>Şüpheli bir posta aldığınızda istemcinizdeki <strong>"Oltalama Bildir"</strong> özelliğini kullanınız.</li>
  </ul>

  <p style="margin-top: 20px; color: #64748b; font-size: 13px;">TeknoCorp SOC Ekibi</p>
</div>`,
    date: new Date(now - 1.5 * day).toISOString(),
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'INBOX',
    labels: ['Güvenlik', 'Duyuru'],
    priority: 'high',
    attachments: [],
    aiSummary: 'Şirket SOC ekibi, şüpheli şifre yenileme oltalama postalarına karşı uyarıda bulundu.',
    aiSmartReplies: [
      'Bilgilendirme için teşekkürler, ekibime ilettim.',
      'Şüpheli bir e-posta tespit ettiğimde SOC ekibine yönlendireceğim.'
    ],
    aiCategory: 'Güvenlik & Duyuru'
  },
  {
    id: 'mail-6',
    accountId: 'acc-1',
    threadId: 'thread-sent-1',
    fromName: 'Ahmet Yılmaz',
    fromEmail: 'ahmet.yilmaz@teknocorp.com',
    to: [{ name: 'Zeynep Kaya', email: 'zeynep.kaya@teknocorp.com' }],
    cc: [],
    bcc: [],
    subject: 'Re: API v2 Dokümantasyonu ve Swagger Dosyaları',
    snippet: 'Zeynep merhaba, hazırladığımız yeni REST ve GraphQL API dokümantasyonunu ekte paylaşıyorum...',
    bodyText: `Zeynep merhaba,

Hazırladığımız yeni REST ve GraphQL API dokümantasyonunu ve test endpointlerini incelemen için paylaşıyorum.

Tüm kimlik doğrulama akışları JWT ve OAuth2 PKCE standardına uygun hale getirildi.

İyi çalışmalar,
Ahmet Yılmaz`,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <p>Zeynep merhaba,</p>
  <p>Hazırladığımız yeni REST ve GraphQL API dokümantasyonunu ve test endpointlerini incelemen için paylaşıyorum.</p>
  <p>Tüm kimlik doğrulama akışları JWT ve OAuth2 PKCE standardına uygun hale getirildi.</p>
  <br>
  <p>İyi çalışmalar,<br><strong>Ahmet Yılmaz</strong></p>
</div>`,
    date: new Date(now - 2 * day).toISOString(),
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    isDraft: false,
    isSpam: false,
    folder: 'SENT',
    labels: ['Gönderilen', 'Dokümantasyon'],
    priority: 'normal',
    attachments: [
      {
        id: 'att-5',
        filename: 'API_v2_OpenAPI_Spec.json',
        contentType: 'application/json',
        size: 32000,
        url: '#'
      }
    ]
  },
  {
    id: 'mail-7',
    accountId: 'acc-1',
    threadId: 'thread-draft-1',
    fromName: 'Ahmet Yılmaz',
    fromEmail: 'ahmet.yilmaz@teknocorp.com',
    to: [{ name: 'Dr. Selin Arslan', email: 'selin.arslan@bogazici.edu.tr' }],
    cc: [],
    bcc: [],
    subject: '[Taslak] Boğaziçi Üniversitesi Yapay Zeka Laboratuvarı Ziyareti',
    snippet: 'Selin Hocam merhaba, önümüzdeki ay gerçekleştirmeyi planladığımız Ar-Ge çalıştayı için...',
    bodyText: `Selin Hocam merhaba,

Önümüzdeki ay şirketimizin Ar-Ge ekibiyle birlikte Boğaziçi Üniversitesi Bilgisayar Mühendisliği bölümündeki laboratuvarınızı ziyaret etmek ve ortak LLM projesi üzerine konuşmak isteriz.

Haftaya Salı veya Perşembe günleri sizin için uygun mudur?`,
    bodyHtml: `<p>Selin Hocam merhaba,</p><p>Önümüzdeki ay şirketimizin Ar-Ge ekibiyle birlikte Boğaziçi Üniversitesi Bilgisayar Mühendisliği bölümündeki laboratuvarınızı ziyaret etmek ve ortak LLM projesi üzerine konuşmak isteriz.</p><p>Haftaya Salı veya Perşembe günleri sizin için uygun mudur?</p>`,
    date: new Date(now - 4 * hour).toISOString(),
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    isDraft: true,
    isSpam: false,
    folder: 'DRAFTS',
    labels: ['Taslak'],
    priority: 'normal',
    attachments: []
  }
];

export const initialCalendarEvents: CalendarEvent[] = [
  {
    id: 'cal-1',
    uid: 'meet-q3-sync-2026',
    title: 'Q3 Sistem Mimarisi Değerlendirmesi & Canlıya Geçiş',
    description: 'Yük testi sonuçlarının analizi ve canlı dağıtım adımlarının kesinleştirilmesi.',
    location: 'TeknoCorp Ana Bina - Toplantı Odası 4A / Google Meet',
    startTime: new Date(now + 2 * day).toISOString().split('T')[0] + 'T11:00:00.000Z',
    endTime: new Date(now + 2 * day).toISOString().split('T')[0] + 'T12:00:00.000Z',
    isAllDay: false,
    color: '#3b82f6',
    accountId: 'acc-1',
    organizer: { name: 'Zeynep Kaya', email: 'zeynep.kaya@teknocorp.com' },
    status: 'CONFIRMED'
  },
  {
    id: 'cal-2',
    uid: 'cal-weekly-sync',
    title: 'Haftalık Mühendislik & Mimarlık Bülteni',
    description: 'Tüm mühendislik ekibiyle haftalık sprint değerlendirmesi.',
    location: 'Ana Konferans Salonu',
    startTime: new Date(now + 1 * day).toISOString().split('T')[0] + 'T07:30:00.000Z',
    endTime: new Date(now + 1 * day).toISOString().split('T')[0] + 'T08:30:00.000Z',
    isAllDay: false,
    color: '#10b981',
    accountId: 'acc-1',
    status: 'CONFIRMED'
  },
  {
    id: 'cal-3',
    uid: 'cal-gym-pt',
    title: 'FitLife Bireysel PT Antrenmanı',
    description: 'FitLife Club Levent Şubesi Antrenör Görüşmesi',
    location: 'FitLife Club Levent',
    startTime: new Date(now + 3 * day).toISOString().split('T')[0] + 'T15:00:00.000Z',
    endTime: new Date(now + 3 * day).toISOString().split('T')[0] + 'T16:00:00.000Z',
    isAllDay: false,
    color: '#f59e0b',
    accountId: 'acc-2',
    status: 'CONFIRMED'
  }
];
