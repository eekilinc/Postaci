// src/components/settings/ScalingTab.tsx — "Ölçeklendirme" sekmesi.
//
// SettingsModal'dan ayrıldı: üç ayar kartı (uygulama arayüz ölçeği, e-posta
// içerik ölçeği, metin biçimlendirme modu) + canlı özet. Ayar DEĞİŞTİRMEZ —
// değerleri ve değiştirme callback'lerini props olarak alır, böylece ana modal'ın
// state'lerinden bağımsız test edilebilir.
import { useTranslation } from '../../i18n';

export interface ScalingTabProps {
  /** Arayüz ölçeği yüzde (80-140) */
  appScale: number;
  /** E-posta gövdesi ölçeği yüzde (80-150) */
  mailScale: number;
  /** Subpixel (ideal) vs standart — bulanıklık sorunu için */
  textRenderingMode: 'ideal' | 'standard';
  onAppScaleChange: (v: number) => void;
  onMailScaleChange: (v: number) => void;
  onTextRenderingModeChange: (m: 'ideal' | 'standard') => void;
}

export function ScalingTab({
  appScale,
  mailScale,
  textRenderingMode,
  onAppScaleChange,
  onMailScaleChange,
  onTextRenderingModeChange,
}: ScalingTabProps) {
  const { language } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Uygulama Ölçeği */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {language === 'en' ? 'Application UI Scale' : 'Uygulama Arayüz Ölçeği'}
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {language === 'en' ? 'Scales the entire app interface — sidebar, toolbars and all panels.' : 'Kenar çubuğu, araç çubuğu ve tüm paneller dahil tüm arayüzü ölçekler.'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={80}
            max={140}
            step={5}
            value={appScale}
            onChange={(e) => onAppScaleChange(Number(e.target.value))}
            className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-zinc-700"
          />
          <span className="text-sm font-black text-blue-600 dark:text-blue-400 w-12 text-right">
            %{appScale}
          </span>
          {appScale !== 100 && (
            <button
              onClick={() => onAppScaleChange(100)}
              className="shrink-0 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {language === 'en' ? 'Reset' : 'Sıfırla'}
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {[80, 90, 100, 110, 120, 130, 140].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onAppScaleChange(v)}
              className={`flex-1 rounded-lg py-1 text-[10px] font-semibold border transition ${
                appScale === v
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
              }`}
            >
              {v}%
            </button>
          ))}
        </div>
      </div>

      {/* E-posta İçerik Ölçeği */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {language === 'en' ? 'Email Content Scale' : 'E-posta İçeriği Ölçeği'}
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {language === 'en' ? 'Only affects message body text and HTML content size.' : 'Yalnızca ileti gövdesi metni ve HTML içerik boyutunu etkiler.'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={80}
            max={150}
            step={5}
            value={mailScale}
            onChange={(e) => onMailScaleChange(Number(e.target.value))}
            className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-purple-600 dark:bg-zinc-700"
          />
          <span className="text-sm font-black text-purple-600 dark:text-purple-400 w-12 text-right">
            %{mailScale}
          </span>
          {mailScale !== 100 && (
            <button
              onClick={() => onMailScaleChange(100)}
              className="shrink-0 text-[11px] text-purple-600 dark:text-purple-400 hover:underline"
            >
              {language === 'en' ? 'Reset' : 'Sıfırla'}
            </button>
          )}
        </div>
      </div>

      {/* Metin Biçimlendirme Modu */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {language === 'en' ? 'Text Rendering Mode' : 'Metin Biçimlendirme Modu'}
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {language === 'en' ? 'Change this if text appears blurry during scaling.' : 'Ölçekleme sırasında metin bulanık görünüyorsa bunu değiştirin.'}
          </p>
        </div>
        <div className="flex gap-2">
          {(['ideal', 'standard'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onTextRenderingModeChange(mode)}
              className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                textRenderingMode === mode
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-blue-400'
              }`}
            >
              {mode === 'ideal'
                ? (language === 'en' ? '✨ Ideal (Subpixel Smooth)' : '✨ İdeal (Subpixel Smooth)')
                : (language === 'en' ? '⚙ Standard' : '⚙ Standart')}
            </button>
          ))}
        </div>
      </div>

      {/* Canlı Ölçek Özet Kartı */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-3 uppercase tracking-wider">
          {language === 'en' ? 'Current Scale Summary' : 'Mevcut Ölçek Özeti'}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">%{appScale}</div>
            <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">
              {language === 'en' ? 'App UI' : 'Uygulama'}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">%{mailScale}</div>
            <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">
              {language === 'en' ? 'Email Body' : 'E-posta'}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <div className="text-xl font-black text-zinc-600 dark:text-zinc-300">{textRenderingMode === 'ideal' ? '✨' : '⚙'}</div>
            <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">
              {textRenderingMode === 'ideal' ? (language === 'en' ? 'Ideal' : 'İdeal') : (language === 'en' ? 'Standard' : 'Standart')}
            </div>
          </div>
        </div>
      </div>

      {/* İpuçları */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-[11px] leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
        <p className="font-semibold mb-1.5">💡 {language === 'en' ? 'Scaling Tips' : 'Ölçeklendirme İpuçları'}</p>
        <ul className="space-y-1 list-disc list-inside text-[11px] text-blue-800/80 dark:text-blue-300/80">
          <li>{language === 'en' ? 'App UI scale affects the entire interface — sidebar, toolbars, panels.' : 'Uygulama ölçeği kenar çubuğu, araç çubuğu ve tüm panelleri etkiler.'}</li>
          <li>{language === 'en' ? 'Email scale only affects message body content.' : 'E-posta ölçeği yalnızca ileti gövdesi içeriğini etkiler.'}</li>
          <li>{language === 'en' ? 'If text appears blurry, switch text rendering to Standard.' : 'Metin bulanık görünüyorsa metin modunu Standart\'a alın.'}</li>
        </ul>
      </div>
    </div>
  );
}