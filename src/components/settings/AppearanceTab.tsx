// src/components/settings/AppearanceTab.tsx — "Görünüm" sekmesi.
//
// SettingsModal'dan ayrıldı: düzen seçimi, bölme onay kutucukları, tema (açık/
// koyu/sistem), vurgu rengi, arkaplan duvarı, OLED modu, liste yoğunluğu,
// snippet satır sayısı, tarih formatı ve avatarlar.
//
// Ayar DEĞİŞTİRMEZ — hepsi props + callback. Duvar listesi de bu bileşenin
// sahipliğinde: yalnızca bu sekme kullanıyordu.
import { useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { ACCENTS } from '../../constants';
import type { AccentKey, DateFormatPreference, ListDensity, SnippetLines, ThemeKey } from '../../types';
import type { LayoutMode } from '../LayoutSwitcher';

export interface AppearanceTabProps {
  layoutMode: LayoutMode;
  onLayoutModeChange: (m: LayoutMode) => void;

  showReadingPane: boolean;
  onShowReadingPaneChange: (v: boolean) => void;
  showFoldersSeparately: boolean;
  onShowFoldersSeparatelyChange: (v: boolean) => void;

  theme: ThemeKey;
  onThemeChange: (t: ThemeKey) => void;
  accent: AccentKey;
  onAccentChange: (a: AccentKey) => void;

  selectedWallpaper: string | null;
  customWallpaperDataUrl: string | null;
  onSelectWallpaper: (id: string) => void;
  onCustomWallpaperPicked: (dataUrl: string) => void;

  oledMode: boolean;
  onOledToggle: (v: boolean) => void;

  listDensity: ListDensity;
  onDensityChange: (d: ListDensity) => void;
  snippetLines: SnippetLines;
  onSnippetLinesChange: (n: SnippetLines) => void;
  dateFormat: DateFormatPreference;
  onDateFormatChange: (f: DateFormatPreference) => void;
  showAvatars: boolean;
  onShowAvatarsChange: (v: boolean) => void;
}

export function AppearanceTab({
  layoutMode,
  onLayoutModeChange,
  showReadingPane,
  onShowReadingPaneChange,
  showFoldersSeparately,
  onShowFoldersSeparatelyChange,
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  selectedWallpaper,
  customWallpaperDataUrl,
  onSelectWallpaper,
  onCustomWallpaperPicked,
  oledMode,
  onOledToggle,
  listDensity,
  onDensityChange,
  snippetLines,
  onSnippetLinesChange,
  dateFormat,
  onDateFormatChange,
  showAvatars,
  onShowAvatarsChange,
}: AppearanceTabProps) {
  const { language } = useTranslation();

  const wallpapers = useMemo(
    () => [
      { id: 'default', label: language === 'en' ? 'Default' : 'Varsayılan', color: '#2b56bf' },
      { id: 'blue-abstract', label: language === 'en' ? 'Blue Geometry' : 'Mavi Geometri', bg: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' },
      { id: 'dark-violet', label: language === 'en' ? 'Dark Violet' : 'Mor Gece', bg: 'linear-gradient(135deg, #2e1065 0%, #7e22ce 100%)' },
      { id: 'emerald-glow', label: language === 'en' ? 'Emerald Forest' : 'Zümrüt Orman', bg: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)' },
      { id: 'sunset-amber', label: language === 'en' ? 'Sunset Amber' : 'Gün Batımı', bg: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)' },
      { id: 'slate-cyber', label: language === 'en' ? 'Cyber Slate' : 'Siber Grafit', bg: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
    ],
    [language]
  );

  return (
    <div className="space-y-6">
      {/* Arayüz ve Tema Rengi */}
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
          {language === 'en' ? 'Interface & theme color' : 'Arayüz ve tema rengi'}
        </h3>

        {/* Mailbird Tel Kafes Görsel Yerleşim Kartları */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {/* Kart 1: 3 Sütunlu Yan Yana */}
          <button
            type="button"
            onClick={() => onLayoutModeChange('three-column')}
            className={`flex flex-col items-center rounded-xl border p-3 transition text-left ${
              layoutMode === 'three-column'
                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
            }`}
          >
            <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
              <div className="w-2 h-full bg-blue-500/30 rounded-xs flex flex-col gap-0.5 p-0.5">
                <div className="w-1 h-1 rounded-full bg-blue-500" />
                <div className="w-1 h-1 rounded-full bg-blue-500" />
              </div>
              <div className="w-4 h-full border-r border-blue-300/40 dark:border-blue-700/40" />
              <div className="w-8 h-full border-r border-blue-300/40 dark:border-blue-700/40" />
              <div className="flex-1 h-full" />
            </div>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {language === 'en' ? '3-Column Layout' : '3 Sütunlu Düzen'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {language === 'en' ? 'Classic 3-Column' : 'Klasik 3 Sütun'}
            </span>
          </button>

          {/* Kart 2: Alt Alta / Yatay Bölmeli */}
          <button
            type="button"
            onClick={() => onLayoutModeChange('horizontal')}
            className={`flex flex-col items-center rounded-xl border p-3 transition text-left ${
              layoutMode === 'horizontal'
                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
            }`}
          >
            <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
              <div className="w-2 h-full bg-blue-500/30 rounded-xs flex flex-col gap-0.5 p-0.5">
                <div className="w-1 h-1 rounded-full bg-blue-500" />
                <div className="w-1 h-1 rounded-full bg-blue-500" />
              </div>
              <div className="flex-1 h-full flex flex-col gap-1">
                <div className="w-full h-1/2 border-b border-blue-300/40 dark:border-blue-700/40" />
                <div className="w-full h-1/2" />
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {language === 'en' ? 'Horizontal Split' : 'Alt Alta Bölmeli'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {language === 'en' ? 'Horizontal Reading' : 'Yatay Okuma'}
            </span>
          </button>

          {/* Kart 3: Odak / Kompakt */}
          <button
            type="button"
            onClick={() => onLayoutModeChange('compact')}
            className={`flex flex-col items-center rounded-xl border p-3 transition text-left col-span-2 sm:col-span-1 ${
              layoutMode === 'compact'
                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
            }`}
          >
            <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
              <div className="w-3 h-full bg-blue-500/20 rounded-xs" />
              <div className="flex-1 h-full" />
            </div>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {language === 'en' ? 'Focus Mode' : 'Odak Modu'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {language === 'en' ? 'Compact List' : 'Kompakt Liste'}
            </span>
          </button>
        </div>

        {/* Bölme Onay Kutucukları */}
        <div className="space-y-2 mb-4 text-xs sm:text-[13px]">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showReadingPane}
              onChange={(e) => onShowReadingPaneChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Show reading pane' : 'Okuma bölmesini göster'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showFoldersSeparately}
              onChange={(e) => onShowFoldersSeparatelyChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Show folders separately in expanded navigation' : 'Klasörleri genişletilmiş gezinti penceresinde ayrı göster'}</span>
          </label>
        </div>

        {/* 3 Kademeli Tema Seçimi (Mailbird Screenshot 2) */}
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
            <input
              type="radio"
              name="theme_mode"
              checked={theme === 'light'}
              onChange={() => onThemeChange('light')}
              className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Light Theme' : 'Açık Tema'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
            <input
              type="radio"
              name="theme_mode"
              checked={theme === 'dark'}
              onChange={() => onThemeChange('dark')}
              className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Dark Theme' : 'Koyu Tema'}</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
            <input
              type="radio"
              name="theme_mode"
              checked={theme === 'system'}
              onChange={() => onThemeChange('system')}
              className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{language === 'en' ? 'Match System Theme' : 'Sistem Temasıyla Eşitle'}</span>
          </label>
        </div>

        {/* Vurgu Rengi Seçici */}
        <div className="pt-2">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            {language === 'en' ? 'Choose theme accent color' : 'Tema rengini seç'}
          </p>
          <div className="flex items-center gap-2">
            {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
              <button
                key={k}
                onClick={() => onAccentChange(k)}
                title={ACCENTS[k].label}
                className={`h-7 w-7 rounded-full transition transform active:scale-95 ${ACCENTS[k].dot} ${
                  accent === k
                    ? 'ring-2 ring-blue-500 ring-offset-2 scale-110 dark:ring-offset-zinc-900'
                    : 'opacity-80 hover:opacity-100 hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Arkaplan Duvar Kağıtları (Mailbird Screenshot 2 İmzası) */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
          {language === 'en' ? 'Background' : 'Arkaplan'}
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!window.postaci?.openFileDialog) return;
              const dataUrl = await window.postaci.openFileDialog({
                title: language === 'en' ? 'Choose Custom Background Image' : 'Özel Arkaplan Resmi Seç',
                filters: [{ name: 'Resim', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
              });
              if (dataUrl) onCustomWallpaperPicked(dataUrl);
            }}
            className="h-16 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 flex items-center justify-center text-zinc-400 hover:text-blue-500 transition relative group"
            title={language === 'en' ? 'Add custom background' : 'Özel arkaplan ekle'}
          >
            <span className="text-2xl leading-none">+</span>
            {customWallpaperDataUrl && (
              <span className="absolute inset-0 rounded-xl overflow-hidden opacity-60">
                <img src={customWallpaperDataUrl} className="w-full h-full object-cover" alt="" />
              </span>
            )}
          </button>

          {wallpapers.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWallpaper(w.id)}
              style={{ background: w.bg || w.color }}
              className={`h-16 rounded-xl transition shadow-xs transform active:scale-95 relative overflow-hidden ${
                selectedWallpaper === w.id
                  ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 scale-105'
                  : 'opacity-85 hover:opacity-100'
              }`}
              title={w.label}
            />
          ))}
        </div>
      </div>

      {/* OLED Saf Siyah (True Black) Modu */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={oledMode}
            onChange={(e) => onOledToggle(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {language === 'en' ? 'OLED True Black Mode (#000000)' : 'OLED Saf Siyah (True Black) Modu'}
          </span>
        </label>
        <p className="text-[11px] text-zinc-500 pl-6.5 mt-0.5">
          {language === 'en'
            ? 'Sets pure #000000 black background in dark mode for maximum contrast and battery saving on OLED/AMOLED screens.'
            : 'Koyu temada arka planı tam #000000 yaparak OLED/AMOLED ekranlarda maksimum kontrast ve enerji tasarrufu sağlar.'}
        </p>
      </div>

      {/* İleti Listesi Yoğunluğu ve Detayları */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
        <div>
          <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            {language === 'en' ? 'Message List Density' : 'İleti Listesi Yoğunluğu'}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'compact',
                label: language === 'en' ? 'Compact' : 'Kompakt',
                desc: language === 'en' ? 'Tight rows, more emails' : 'Dar satırlar, çok ileti',
              },
              {
                id: 'normal',
                label: language === 'en' ? 'Normal' : 'Normal',
                desc: language === 'en' ? 'Balanced spacing' : 'Dengeli satır aralığı',
              },
              {
                id: 'relaxed',
                label: language === 'en' ? 'Relaxed' : 'Rahat',
                desc: language === 'en' ? 'Spacious view' : 'Geniş ve ferah görünüm',
              },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onDensityChange(d.id as ListDensity)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  listDensity === d.id
                    ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500'
                    : 'border-zinc-200 dark:border-zinc-750 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{d.label}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Snippet Satır Sayısı */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {language === 'en' ? 'Snippet Lines' : 'Özet (Snippet) Satır Sayısı'}
            </label>
            <select
              value={snippetLines}
              onChange={(e) => onSnippetLinesChange(Number(e.target.value) as SnippetLines)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value={0}>{language === 'en' ? 'Subject only (0 lines)' : 'Yalnızca Konu (0 satır)'}</option>
              <option value={1}>{language === 'en' ? 'Single line (1 line)' : 'Tek Satır Akıcı (1 satır)'}</option>
              <option value={2}>{language === 'en' ? 'Detailed snippet (2 lines)' : 'Detaylı Özet (2 satır)'}</option>
            </select>
          </div>

          {/* Tarih Formatı */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {language === 'en' ? 'Date Format' : 'Tarih Gösterim Formatı'}
            </label>
            <select
              value={dateFormat}
              onChange={(e) => onDateFormatChange(e.target.value as DateFormatPreference)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="smart">{language === 'en' ? 'Smart (Time today, date older)' : 'Akıllı (Bugün saat, eski gün/ay)'}</option>
              <option value="relative">{language === 'en' ? 'Relative (2 hours ago, Yesterday)' : 'Göreceli (2 saat önce, Dün)'}</option>
              <option value="absolute">{language === 'en' ? 'Full Date (11.09.2026 14:30)' : 'Tam Tarih (11.09.2026 14:30)'}</option>
            </select>
          </div>
        </div>

        {/* Avatarları Göster */}
        <label className="flex items-center gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={showAvatars}
            onChange={(e) => onShowAvatarsChange(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">
            {language === 'en'
              ? 'Show sender avatars in message list (faster scrolling when disabled)'
              : 'İleti listesinde kişi avatarlarını göster (Gizlendiğinde liste daha hızlı kaydırılır)'}
          </span>
        </label>
      </div>
    </div>
  );
}