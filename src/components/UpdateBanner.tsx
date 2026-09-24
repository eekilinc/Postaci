// src/components/UpdateBanner.tsx — güncelleme indirme/kurulum şeridi
// UndoSendBar ile aynı görsel dil: altta hap, aksiyon butonlu.
import { memo } from 'react';
import type { UpdaterStatus } from '../hooks/useUpdaterStatus';

interface UpdateBannerProps {
  status: UpdaterStatus;
  language: 'tr' | 'en';
  onRestart: () => void;
  onDismiss: () => void;
}

export const UpdateBanner = memo(function UpdateBanner({
  status,
  language,
  onRestart,
  onDismiss,
}: UpdateBannerProps) {
  if (status.state !== 'downloading' && status.state !== 'downloaded') return null;
  const en = language === 'en';

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-700 bg-zinc-900/95 px-5 py-2.5 text-sm text-white shadow-2xl backdrop-blur-md animate-fadeIn select-none">
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
      {status.state === 'downloading' ? (
        <>
          <span>
            {en ? 'Downloading update' : 'Güncelleme indiriliyor'} %{status.percent}
          </span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <span>
            {en
              ? `Update v${status.version || ''} ready`
              : `v${status.version || ''} güncellemesi hazır`}
          </span>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-95 cursor-pointer"
          >
            {en ? 'Restart & Install' : 'Yeniden Başlat ve Kur'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-2 py-1 text-xs text-zinc-400 transition hover:text-white cursor-pointer"
          >
            {en ? 'Later' : 'Sonra'}
          </button>
        </>
      )}
    </div>
  );
});
