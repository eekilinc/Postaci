// src/components/settingsTabs.ts — SettingsModal sekme tanımları.
// Component dosyasından ayrı tutulur: (a) hızlı yenileme (Fast Refresh) bu
// dosyada export edilen tek şey component değil, sabit/fonksiyon olduğu için
// bozulmaz, (b) sekme listesi test edilebilir hale gelir.
export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'scaling'
  | 'accounts'
  | 'composing'
  | 'advanced'
  | 'about';

/** Sıra ve etiketler render sırasında değişmemeli; test edilebilirlik için ayrıldı. */
export function buildNavTabs(language: string): { id: SettingsTab; label: string }[] {
  return [
    { id: 'general', label: language === 'en' ? 'General' : 'Genel' },
    { id: 'appearance', label: language === 'en' ? 'Appearance' : 'Görünüm' },
    { id: 'scaling', label: language === 'en' ? 'Scaling & Zoom' : 'Ölçeklendirme' },
    { id: 'accounts', label: language === 'en' ? 'Accounts' : 'Hesaplar' },
    { id: 'composing', label: language === 'en' ? 'Composing' : 'Oluşturma' },
    { id: 'advanced', label: language === 'en' ? 'Advanced' : 'Gelişmiş' },
    { id: 'about', label: language === 'en' ? 'About Postacı' : 'Postacı Hakkında' },
  ];
}