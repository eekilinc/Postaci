// src/components/settings/AdvancedTab.tsx — "Gelişmiş" sekmesi.
//
// SettingsModal'dan ayrıldı: okundu zamanlaması, harici görsel gizlilik kalkanı,
// yerel SQLite/RAM istatistikleri ve bakım düğmeleri. Ayar DEĞİŞTİRMEZ —
// değerler ve callback'ler props olarak gelir; böylece ana modal'ın state'lerinden
// bağımsız ve tek başına test edilebilir.
import { useTranslation } from '../../i18n';
import type { MarkReadTiming } from '../../types';

export interface AdvancedTabProps {
  markReadTiming: MarkReadTiming;
  onMarkReadTimingChange: (v: MarkReadTiming) => void;
  /** Harici görselleri/izleme piksellerini engelle */
  blockRemoteImages: boolean;
  onBlockRemoteImagesChange: (v: boolean) => void;

  dbStats: { accounts: number; folders: number; messages: number } | null;
  /** dbStats henüz gelmediyse gösterilecek hesap sayısı */
  accountCountFallback: number;
  systemInfo: {
    ram: { heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number };
    db: { sizeBytes: number; sizeMB: number; path: string | null };
    versions: { electron: string; node: string; chrome: string; v8: string };
  } | null;
  onRefreshSystemInfo: () => void;

  /** 'running' | 'done' | 'error' | null */
  vacuumStatus: string | null;
  onVacuum: () => void;
  onOpenShortcutsHelp?: () => void;
  onOpenLogFolder: () => void;
}

export function AdvancedTab({
  markReadTiming,
  onMarkReadTimingChange,
  blockRemoteImages,
  onBlockRemoteImagesChange,
  dbStats,
  accountCountFallback,
  systemInfo,
  onRefreshSystemInfo,
  vacuumStatus,
  onVacuum,
  onOpenShortcutsHelp,
  onOpenLogFolder,
}: AdvancedTabProps) {
  const { language } = useTranslation();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {language === 'en' ? 'Advanced Settings & Privacy' : 'Gelişmiş Ayarlar ve Gizlilik'}
        </h3>
        <p className="text-[11px] text-zinc-500">
          {language === 'en'
            ? 'Read timing, remote image privacy shield, and local database maintenance.'
            : 'Okuma zamanlaması, harici görsel gizlilik kalkanı ve yerel veritabanı yönetimi.'}
        </p>
      </div>

      {/* Okundu Olarak İşaretleme Zamanlaması */}
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
          {language === 'en' ? 'Mark as Read Timing' : 'Okundu Olarak İşaretleme Zamanlaması'}
        </h4>
        <p className="text-[11px] text-zinc-500">
          {language === 'en'
            ? 'Determine when an email is automatically marked as read upon selection.'
            : 'Bir ileti seçildiğinde ne zaman okundu olarak işaretleneceğini belirleyin.'}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[
            {
              id: 'instant',
              label: language === 'en' ? 'Instant' : 'Anında',
              desc: language === 'en' ? 'As soon as email is clicked' : 'İleti tıklandığı anda',
            },
            {
              id: 'delay_3s',
              label: language === 'en' ? 'After 3 Seconds' : '3 Saniye Sonra',
              desc: language === 'en' ? 'When viewing for 3 seconds' : 'İletide 3 sn kalındığında',
            },
            {
              id: 'delay_5s',
              label: language === 'en' ? 'After 5 Seconds' : '5 Saniye Sonra',
              desc: language === 'en' ? 'When viewing for 5 seconds' : 'İletide 5 sn kalındığında',
            },
            {
              id: 'manual',
              label: language === 'en' ? 'Manual' : 'Manuel',
              desc: language === 'en' ? 'Only when button is pressed' : 'Sadece düğmeye basıldığında',
            },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMarkReadTimingChange(m.id as MarkReadTiming)}
              className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                markReadTiming === m.id
                  ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500'
                  : 'border-zinc-200 dark:border-zinc-750 hover:bg-white dark:hover:bg-zinc-800'
              }`}
            >
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{m.label}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Harici Görsel Gizlilik Kalkanı */}
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={blockRemoteImages}
            onChange={(e) => onBlockRemoteImagesChange(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {language === 'en'
              ? 'Automatically Block Remote Images & Tracking Pixels'
              : 'Harici Görselleri ve İzleme Piksellerini Otomatik Engelle'}
          </span>
        </label>
        <p className="text-[11px] text-zinc-500 pl-6.5 leading-relaxed">
          {language === 'en'
            ? 'Blocks external web images by default. Prevents senders from tracking your IP address, location, or open time. You can allow images per email anytime.'
            : 'E-postalardaki harici web bağlantılı görselleri varsayılan olarak engeller. Bu sayede gönderenlerin IP adresinizi, konumunuzu veya e-postayı açtığınız saati izlemesini önler. İstediğinizde ileti bölmesinden görsellere izin verebilirsiniz.'}
        </p>
      </div>

      {/* SQLite Durumu + RAM + Boyut */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'en' ? 'Local SQLite Status:' : 'Yerel SQLite Durumu:'}
          </p>
          <button
            type="button"
            onClick={onRefreshSystemInfo}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {language === 'en' ? 'Refresh' : 'Yenile'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
            <p className="text-lg font-bold text-blue-600">{dbStats?.accounts ?? accountCountFallback}</p>
            <p className="text-[10px] text-zinc-400">{language === 'en' ? 'Accounts' : 'Hesap'}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
            <p className="text-lg font-bold text-emerald-600">{dbStats?.folders ?? '-'}</p>
            <p className="text-[10px] text-zinc-400">{language === 'en' ? 'Folders' : 'Klasör'}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
            <p className="text-lg font-bold text-purple-600">{dbStats?.messages ?? '-'}</p>
            <p className="text-[10px] text-zinc-400">{language === 'en' ? 'Cached Emails' : 'Kayıtlı İleti'}</p>
          </div>
        </div>

        {/* DB Boyutu */}
        {systemInfo && (
          <div className="flex items-center justify-between rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 px-3 py-2">
            <span className="text-zinc-500">{language === 'en' ? 'Database File Size' : 'DB Dosya Boyutu'}</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {systemInfo.db.sizeMB < 1
                ? `${Math.round(systemInfo.db.sizeBytes / 1024)} KB`
                : `${systemInfo.db.sizeMB} MB`}
            </span>
          </div>
        )}
      </div>

      {/* RAM Kullanımı */}
      {systemInfo && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'en' ? 'Memory Usage (Main Process):' : 'Bellek Kullanımı (Ana Süreç):'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
              <span className="text-zinc-500">{language === 'en' ? 'RSS (Total)' : 'RSS (Toplam)'}</span>
              <span className="font-bold text-orange-600 dark:text-orange-400">{systemInfo.ram.rssMB} MB</span>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
              <span className="text-zinc-500">{language === 'en' ? 'Heap Used' : 'Heap Kullanılan'}</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{systemInfo.ram.heapUsedMB} MB</span>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
              <span className="text-zinc-500">{language === 'en' ? 'Heap Total' : 'Heap Toplam'}</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300">{systemInfo.ram.heapTotalMB} MB</span>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
              <span className="text-zinc-500">{language === 'en' ? 'External' : 'Harici'}</span>
              <span className="font-bold text-zinc-600 dark:text-zinc-400">{systemInfo.ram.externalMB} MB</span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onVacuum}
          disabled={vacuumStatus === 'running'}
          className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {vacuumStatus === 'running' ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              <span>{language === 'en' ? 'Optimizing...' : 'Optimize ediliyor...'}</span>
            </>
          ) : vacuumStatus === 'done' ? (
            <span className="text-emerald-600 dark:text-emerald-400">{language === 'en' ? '✓ Optimized!' : '✓ Optimize edildi!'}</span>
          ) : vacuumStatus === 'error' ? (
            <span className="text-red-600">{language === 'en' ? '✕ Error occurred' : '✕ Hata oluştu'}</span>
          ) : (
            <span>{language === 'en' ? 'Optimize Database (VACUUM)' : 'Veritabanını Optimize Et (VACUUM)'}</span>
          )}
        </button>
        {onOpenShortcutsHelp && (
          <button
            type="button"
            onClick={onOpenShortcutsHelp}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            {language === 'en' ? 'Keyboard Shortcuts Map' : 'Klavye Kısayolları Haritası'}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenLogFolder}
          className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
        >
          {language === 'en' ? 'Open Log Folder' : 'Log Klasörünü Aç'}
        </button>
      </div>
    </div>
  );
}