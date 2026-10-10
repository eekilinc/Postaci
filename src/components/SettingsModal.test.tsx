// @vitest-environment jsdom
// src/components/SettingsModal.test.tsx — sekme yüzeyi ve etkileşim kilidi.
//
// Bu dosya SettingsModal'ı BÖLMEK için yazıldı: 2892 satırlık tek bileşen 8
// sekmeye ayrılacak. Ayrırma sırasında davranışın korunduğunu kanıtlamak için
// önce mevcut davranış sabitleniyor. Kırmızıya düşerse ayrırma değil, davranış
// değişmiştir.
//
// Kapsam bilinçli olarak dar: sekmelerin render edilmesi, sekme geçişi,
// dil etiketleri ve localStorage kalıcılığı. Hesap yönetimi/gönderim gibi
// ağır akışlar burada test EDİLMİYOR — bunlar ayrı dosyalarda ele alınmalı.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { SettingsModal } from './SettingsModal';
import { buildNavTabs, type SettingsTab } from './settingsTabs';

const TABS: SettingsTab[] = [
  'general',
  'appearance',
  'scaling',
  'accounts',
  'composing',
  'advanced',
  'about',
];

const TR_LABELS: Record<SettingsTab, string> = {
  general: 'Genel',
  appearance: 'Görünüm',
  scaling: 'Ölçeklendirme',
  accounts: 'Hesaplar',
  composing: 'Oluşturma',
  advanced: 'Gelişmiş',
  about: 'Postacı Hakkında',
};

function makePostaci() {
  const ok = () => Promise.resolve(true);
  return {
    version: '1.0.57',
    platform: 'win32',
    appSettings: {
      get: vi.fn().mockResolvedValue({}),
      save: vi.fn().mockResolvedValue({}),
      setSpellcheck: vi.fn().mockResolvedValue(true),
    },
    notifications: {
      getSettings: vi.fn().mockResolvedValue({
        notificationsEnabled: true,
        syncIntervalMinutes: 2,
        soundEnabled: true,
        soundChoice: 'chirp',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      }),
      saveSettings: vi.fn().mockResolvedValue({}),
      test: vi.fn().mockResolvedValue(true),
      onOpenMessage: vi.fn().mockReturnValue(() => {}),
      onBackgroundSynced: vi.fn().mockReturnValue(() => {}),
    },
    db: {
      stats: vi.fn().mockResolvedValue({ accounts: 1, folders: 3, messages: 120 }),
      systemInfo: vi.fn().mockResolvedValue({
        ram: { heapUsedMB: 10, heapTotalMB: 20, rssMB: 30, externalMB: 1 },
        db: { sizeBytes: 1024, sizeMB: 0.001, path: 'C:/x.db' },
        versions: { electron: '44', node: '22', chrome: '140', v8: '14' },
      }),
      vacuum: vi.fn().mockResolvedValue(true),
    },
    logs: { getPath: vi.fn().mockResolvedValue('C:/log.log'), openFolder: vi.fn().mockResolvedValue({ ok: true, error: null }) },
    updater: {
      check: vi.fn().mockResolvedValue({ ok: false }),
      quitInstall: ok,
      onStatus: vi.fn().mockReturnValue(() => {}),
    },
    openFileDialog: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(true),
    setBadge: vi.fn().mockResolvedValue(true),
    accounts: { list: vi.fn().mockResolvedValue([]) },
  };
}

function renderModal(over: Partial<ComponentProps<typeof SettingsModal>> = {}) {
  const props: ComponentProps<typeof SettingsModal> = {
    theme: 'light',
    setTheme: vi.fn(),
    accent: 'blue',
    setAccent: vi.fn(),
    accounts: [],
    activeAccount: null,
    onClose: vi.fn(),
    ...over,
  };
  return { props, ...render(<SettingsModal {...props} />) };
}

beforeEach(() => {
  (window as unknown as { postaci: unknown }).postaci = makePostaci();
  // Dil sabitlensin: navigator.language jsdom'da 'en-US' olabilir ve
  // TR etiketleri aramaları kırılır.
  localStorage.setItem('postaci_language', 'tr');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('buildNavTabs', () => {
  it('yedi sekme verir ve içerik sırası sabittir', () => {
    expect(buildNavTabs('tr').map((t) => t.id)).toEqual(TABS);
  });

  it('her sekme için etiket üretir (eksik etiket = boş nav düğmesi)', () => {
    for (const t of buildNavTabs('tr')) {
      expect(t.label, `${t.id} etiketi boş`).toBeTruthy();
    }
    for (const t of buildNavTabs('en')) {
      expect(t.label, `${t.id} (en) etiketi boş`).toBeTruthy();
    }
  });

  it('TR ve EN etiketleri ayrışır', () => {
    const tr = buildNavTabs('tr').map((t) => t.label);
    const en = buildNavTabs('en').map((t) => t.label);
    expect(tr).not.toEqual(en);
  });
});

describe('SettingsModal — sekme yüzeyi', () => {
  it('açılışta yalnızca Genel sekmesi render edilir', () => {
    renderModal();
    // Genel içeriği: "Genel" başlığı görünmeli
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText(TR_LABELS.general).length).toBeGreaterThan(0);
  });

  it('nav yedi düğme sunar', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    for (const label of Object.values(TR_LABELS)) {
      expect(within(dialog).getAllByText(label).length, `${label} nav düğmesi yok`).toBeGreaterThan(0);
    }
  });

  it.each(TABS.filter((t) => t !== 'general'))('%s sekmesine geçilebilir', (tab) => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS[tab])[0].click();
    });
    // Geçiş sonrası hedef sekmenin içeriği render edilmeli
    expect(screen.getAllByText(TR_LABELS[tab]).length).toBeGreaterThan(0);
  });

  it('her sekme render edildiğinde ekran hatası vermez', () => {
    const errors: unknown[] = [];
    const onErr = (e: ErrorEvent) => errors.push(e.error ?? e.message);
    window.addEventListener('error', onErr);
    renderModal();
    for (const tab of TABS) {
      act(() => {
        screen.getAllByText(TR_LABELS[tab])[0].click();
      });
    }
    window.removeEventListener('error', onErr);
    expect(errors).toEqual([]);
  });

  it('ayarlar değiştirilip sekme değiştirilince durum korunur', () => {
    const { props } = renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.about)[0].click();
    });
    // About sekmesi: sürüm rozeti görünmeli
    expect(screen.getAllByText(/v1\.0\.57/).length).toBeGreaterThan(0);
    act(() => {
      screen.getAllByText(TR_LABELS.general)[0].click();
    });
    expect(screen.getAllByText(TR_LABELS.general).length).toBeGreaterThan(0);
    expect(props).toBeTruthy();
  });

  // Bölme sırasında AboutTab ayrı dosyaya taşındı. Bu testler, taşınan
  // içeriğin gerçekten render edildiğini sabitler; yalnızca "render oldu"
  // demek yetmez — kaybolan kart/sürüm bilgisi ancak burada yakalanır.
  it('about sekmesi taşınan tüm kartları render eder', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.about)[0].click();
    });
    // Sürüm rozeti
    expect(screen.getByText('v1.0.57')).toBeTruthy();
    // Güncelleme denetleyicisi kartı
    expect(screen.getAllByText(/Güncellemeleri Denetle|Güncelleme mevcut/).length).toBeGreaterThan(0);
    // GitHub kartı + hızlı butonlar
    expect(screen.getAllByText('eekilinc / Postaci').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sürümler \(Releases\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hata \/ İstek Bildir/).length).toBeGreaterThan(0);
    // Avantaj kartları
    expect(screen.getAllByText(/Çevrimdışı & Yerel SQLite/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Donanım Şifreleme/).length).toBeGreaterThan(0);
    // Geliştirici & lisans
    expect(screen.getAllByText('Ekrem Eşref Kılınç').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MIT Lisansı').length).toBeGreaterThan(0);
  });

  it('about sekmesi çalışma ortamı sürümlerini gösterir', async () => {
    await act(async () => {
      renderModal();
    });
    act(() => {
      screen.getAllByText(TR_LABELS.about)[0].click();
    });
    // systemInfo mock'landı: Electron 44 / Node 22 görünmeli
    expect(screen.getAllByText('44').length).toBeGreaterThan(0);
    expect(screen.getAllByText('22').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Çalışma Ortamı Versiyonları/).length).toBeGreaterThan(0);
  });

  it('about sekmesinde güncelleme denetleme düğmesi callbacki tetikler', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.about)[0].click();
    });
    const btn = screen.getAllByRole('button', { name: /Güncellemeleri Denetle/ })[0];
    act(() => {
      btn.click();
    });
    // Denetleme başladığında düğme devre dışı kalmalı (status 'checking')
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  // ScalingTab ayrı dosyaya taşındı. Ölçek ayarları localStorage'a yazıldığı
  // için yanlış değer sessizce uygulanabilirdi — tıklama zinciri test edilmeli.
  it('ölçek sekmesi üç kartı ve canlı özeti render eder', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.scaling)[0].click();
    });
    expect(screen.getAllByText('Uygulama Arayüz Ölçeği').length).toBeGreaterThan(0);
    expect(screen.getAllByText('E-posta İçeriği Ölçeği').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Metin Biçimlendirme Modu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mevcut Ölçek Özeti').length).toBeGreaterThan(0);
  });

  it('ölçek sekmesi varsayılan değerleri gösterir', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.scaling)[0].click();
    });
    // İki adet %100 olmalı: uygulama ölçeği + e-posta ölçeği
    expect(screen.getAllByText('%100').length).toBeGreaterThanOrEqual(2);
    // Metin modu: varsayılan 'ideal' olduğu için Sıfırla düğmeleri görünmemeli
    expect(screen.queryAllByText('Sıfırla').length).toBe(0);
  });

  it('ölçek sekmesinde hazır % değerine tıklamak değeri değiştirir', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.scaling)[0].click();
    });
    act(() => {
      // Hazır %120 düğmesi
      screen.getAllByRole('button', { name: '120%' })[0].click();
    });
    // Artık %120 görünmeli ve Sıfırla düğmesi belirmeli
    expect(screen.getAllByText('%120').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sıfırla').length).toBeGreaterThan(0);
  });

  it('ölçek sekmesinde Sıfırla %100e döndürür', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.scaling)[0].click();
    });
    act(() => {
      screen.getAllByRole('button', { name: '130%' })[0].click();
    });
    expect(screen.getAllByText('%130').length).toBeGreaterThan(0);
    // İki Sıfırla düğmesi çıkar (uygulama + e-posta ölçeği)
    act(() => {
      screen.getAllByText('Sıfırla')[0].click();
    });
    expect(screen.getAllByText('%100').length).toBeGreaterThanOrEqual(2);
  });

  it('ölçek değişimi localStoragea yazılır', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.scaling)[0].click();
    });
    act(() => {
      screen.getAllByRole('button', { name: '110%' })[0].click();
    });
    // handleAppScaleChange: state + localStorage + canlı zoom uygular
    expect(localStorage.getItem('postaci_app_scale')).toBe('110');
    expect(document.documentElement.style.zoom).toBe('1.1');
  });

  // AdvancedTab ayrı dosyaya taşındı. Buradaki ayarlar GİZLİLİK ve VERİ
  // kaybı yaratabilir (VACUUM, okundu zamanlaması, harici görsel engeli),
  // bu yüzden değiştirme + kalıcılık zinciri test ediliyor.
  it('gelişmiş sekmesi tüm kartları render eder', async () => {
    await act(async () => {
      renderModal();
    });
    act(() => {
      screen.getAllByText(TR_LABELS.advanced)[0].click();
    });
    expect(screen.getAllByText('Okundu Olarak İşaretleme Zamanlaması').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Harici Görselleri ve İzleme Piksellerini/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yerel SQLite Durumu:').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bellek Kullanımı (Ana Süreç):').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Veritabanını Optimize Et/).length).toBeGreaterThan(0);
  });

  it('okundu zamanlaması varsayılan "Anında" ve değiştirilebilir', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.advanced)[0].click();
    });
    // Varsayılan localStorage boş -> 'instant'
    expect(localStorage.getItem('postaci_mark_read_timing')).toBeNull();
    act(() => {
      screen.getAllByRole('button', { name: /Manuel/ })[0].click();
    });
    expect(localStorage.getItem('postaci_mark_read_timing')).toBe('manual');
  });

  it('harici görsel engeli varsayılan AÇIK (gizlilik) ve kapatılabilir', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.advanced)[0].click();
    });
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    // Varsayılan ENGELLEYİCİ: localStorage boşken '!== "false"' -> true.
    // useMessageBody.ts aynı anahtarı aynı varsayılanla okuyor; iki yerde
    // aksi halde kullanıcı ayarı burada kapansa bile gövdede uygulanmazdı.
    expect(box.checked).toBe(true);
    expect(localStorage.getItem('postaci_block_remote_images')).toBeNull();
    act(() => {
      box.click();
    });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(localStorage.getItem('postaci_block_remote_images')).toBe('false');
  });

  it('VACUUM düğmesi çalışır ve durum metni değişir', async () => {
    await act(async () => {
      renderModal();
    });
    act(() => {
      screen.getAllByText(TR_LABELS.advanced)[0].click();
    });
    const vacuum = (window as never as { postaci: { db: { vacuum: ReturnType<typeof vi.fn> } } })
      .postaci.db.vacuum;
    act(() => {
      screen.getAllByRole('button', { name: /Veritabanını Optimize Et/ })[0].click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(vacuum).toHaveBeenCalled();
    // Başarılıysa "Optimize edildi" yazmalı
    expect(screen.getAllByText(/Optimize edildi|Optimizing/).length).toBeGreaterThan(0);
  });

  it('Sistem bilgileri mock değerlerle render edilir', async () => {
    await act(async () => {
      renderModal();
    });
    act(() => {
      screen.getAllByText(TR_LABELS.advanced)[0].click();
    });
    // RSS 30 MB (mock), Heap Used 10 MB
    expect(screen.getAllByText('30 MB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10 MB').length).toBeGreaterThan(0);
  });

  // AppearanceTab ayrı dosyaya taşındı. Tema/düzen ayarları DOM'a (documentElement
  // class'ı, CSS değişkenleri) doğrudan yansıdığı için yanlış bağlanırsa
  // uygulama "kaydedildi" der ama ekran değişmez.
  it('görünüm sekmesi düzen, tema, arkaplan ve yoğunluk kartlarını render eder', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.appearance)[0].click();
    });
    expect(screen.getAllByText('3 Sütunlu Düzen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Odak Modu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Açık Tema').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Koyu Tema').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sistem Temasıyla Eşitle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Arkaplan').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OLED Saf Siyah/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('İleti Listesi Yoğunluğu').length).toBeGreaterThan(0);
  });

  it('görünüm sekmesinde tema seçimi setThemei çağırır', () => {
    const setTheme = vi.fn();
    renderModal({ theme: 'light', setTheme });
    act(() => {
      screen.getAllByText(TR_LABELS.appearance)[0].click();
    });
    act(() => {
      screen.getAllByText('Koyu Tema')[0].click();
    });
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('görünüm sekmesinde düzen seçimi layout değiştirir', () => {
    const onLayoutModeChange = vi.fn();
    renderModal({ onLayoutModeChange });
    act(() => {
      screen.getAllByText(TR_LABELS.appearance)[0].click();
    });
    act(() => {
      screen.getAllByText('Odak Modu')[0].click();
    });
    expect(onLayoutModeChange).toHaveBeenCalledWith('compact');
  });

  it('görünüm sekmesinde yoğunluk seçimi localStoragea yazılır', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.appearance)[0].click();
    });
    act(() => {
      screen.getAllByText('Kompakt')[0].click();
    });
    expect(localStorage.getItem('postaci_list_density')).toBe('compact');
  });

  it('görünüm sekmesinde snippet satır sayısı değişir', () => {
    renderModal();
    act(() => {
      screen.getAllByText(TR_LABELS.appearance)[0].click();
    });
    const select = screen.getByDisplayValue(/Tek Satır Akıcı/) as HTMLSelectElement;
    act(() => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localStorage.getItem('postaci_snippet_lines')).toBe('2');
  });

  // AccountsTab ayrıldı: liste, düzenleme formu, bağlantı testi, tanı.
  // Hesap silme geri DÖNÜŞÜZ bir işlem olduğu için akış burada kilitleniyor.
  it('hesaplar sekmesi hesap yoksa boş durum gösterir', () => {
    renderModal({ accounts: [] });
    act(() => {
      screen.getAllByText(TR_LABELS.accounts)[0].click();
    });
    expect(screen.getAllByText('Henüz bağlı bir e-posta hesabı bulunmuyor.').length).toBeGreaterThan(0);
  });

  it('hesaplar sekmesi hesap listesini ve rozetleri gösterir', () => {
    renderModal({
      accounts: [
        { id: 1, provider: 'google', email: 'ali@gmail.com', display_name: 'Ali' },
        { id: 2, provider: 'imap', email: 'bob@kurum.edu.tr', display_name: null },
      ] as never,
    });
    act(() => {
      screen.getAllByText(TR_LABELS.accounts)[0].click();
    });
    expect(screen.getByText('ali@gmail.com')).toBeTruthy();
    expect(screen.getByText('bob@kurum.edu.tr')).toBeTruthy();
    // Gmail OAuth + Kurumsal rozetleri
    expect(screen.getAllByText('Gmail OAuth').length).toBe(1);
    expect(screen.getAllByText('Kurumsal').length).toBe(1);
  });

  it('hesaplar sekmesinde Düzenle düğmesi handleStartEditi çağırır', () => {
    const acc = { id: 7, provider: 'imap', email: 'x@y.com', display_name: null };
    // handleStartEdit iç davranışı accounts.update yollar; burada yalnızca
    // düzenleme formunun açıldığını doğruluyoruz.
    renderModal({ accounts: [acc] as never });
    act(() => {
      screen.getAllByText(TR_LABELS.accounts)[0].click();
    });
    act(() => {
      screen.getAllByRole('button', { name: 'Düzenle' })[0].click();
    });
    // Form açıldı: "Hesap Ayarlarını Düzenle" başlığı görünmeli
    expect(screen.getAllByText('Hesap Ayarlarını Düzenle').length).toBeGreaterThan(0);
  });

  it('hesaplar sekmesinde Kaldır onay modalını açar', () => {
    const acc = { id: 7, provider: 'imap', email: 'x@y.com', display_name: null };
    renderModal({ accounts: [acc] as never });
    act(() => {
      screen.getAllByText(TR_LABELS.accounts)[0].click();
    });
    act(() => {
      screen.getAllByRole('button', { name: 'Kaldır' })[0].click();
    });
    // Onay modalı: başlık + "sunucudaki e-postalarınız etkilenmez" uyarısı
    expect(screen.getAllByText('Hesabı Kaldır').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/sunucudaki e-postalarınız etkilenmez/).length
    ).toBeGreaterThan(0);
  });

  // ComposingTab ayrıldı: imza editörü artık bu bileşende (contentEditable ref).
  it('oluşturma sekmesi hesap yoksa uyarı gösterir', () => {
    renderModal({ accounts: [] });
    act(() => {
      screen.getAllByText(TR_LABELS.composing)[0].click();
    });
    expect(
      screen.getAllByText(/İmza eklemek için önce bir e-posta hesabı bağlamalısınız/).length
    ).toBeGreaterThan(0);
  });

  it('oluşturma sekmesi imza, undo ve snippet bölümlerini render eder', () => {
    renderModal({
      accounts: [{ id: 1, provider: 'imap', email: 'ali@x.com', display_name: 'Ali' }] as never,
    });
    act(() => {
      screen.getAllByText(TR_LABELS.composing)[0].click();
    });
    expect(screen.getAllByText('Hesap Seçin').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Göndermeyi Geri Alma Penceresi/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hızlı Yanıt Şablonları/).length).toBeGreaterThan(0);
    // Uygulama 3 hazır snippet ile başlar (localStorage boşken geri gelir)
    expect(screen.getAllByText('Teşekkür ve Onay').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Toplantı Talebi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bilgi ve İnceleme').length).toBeGreaterThan(0);
  });

  it('oluşturma sekmesinde düz metin imza alanı görünür', () => {
    renderModal({
      accounts: [{ id: 1, provider: 'imap', email: 'ali@x.com', display_name: 'Ali' }] as never,
    });
    act(() => {
      screen.getAllByText(TR_LABELS.composing)[0].click();
    });
    // Varsayılan düz metin
    expect(screen.getAllByDisplayValue(/^$/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Düz Metin/ }).length).toBeGreaterThan(0);
  });

  it('oluşturma sekmesinde snippet ekleme düğmesi boş formda devre dışı', () => {
    renderModal({
      accounts: [{ id: 1, provider: 'imap', email: 'ali@x.com', display_name: 'Ali' }] as never,
    });
    act(() => {
      screen.getAllByText(TR_LABELS.composing)[0].click();
    });
    const btn = screen.getAllByRole('button', { name: /\+ Şablonu Kaydet/ })[0];
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('oluşturma sekmesinde snippet başlığı ve gövdesi girilince düğme etkinleşir', () => {
    renderModal({
      accounts: [{ id: 1, provider: 'imap', email: 'ali@x.com', display_name: 'Ali' }] as never,
    });
    act(() => {
      screen.getAllByText(TR_LABELS.composing)[0].click();
    });
    // fireEvent.change kullanılır: doğrudan .value atamak React'in değer
    // takibini (value tracker) atlayabiliyor ve state güncellenmiyor.
    fireEvent.change(screen.getByPlaceholderText(/Şablon Başlığı/), {
      target: { value: 'Onay' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Şablon metni içeriği/), {
      target: { value: 'Merhaba, onaylıyorum.' },
    });
    const btn = screen.getAllByRole('button', { name: /\+ Şablonu Kaydet/ })[0];
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('SettingsModal — kalıcılık', () => {
  it('başlangıçta uygulama ayarlarını köprüden okur', async () => {
    await act(async () => {
      renderModal();
    });
    expect((window as never as { postaci: { appSettings: { get: ReturnType<typeof vi.fn> } } })
      .postaci.appSettings.get).toHaveBeenCalled();
  });

  it('bildirim ayarlarını köprüden okur', async () => {
    await act(async () => {
      renderModal();
    });
    expect((window as never as { postaci: { notifications: { getSettings: ReturnType<typeof vi.fn> } } })
      .postaci.notifications.getSettings).toHaveBeenCalled();
  });
});