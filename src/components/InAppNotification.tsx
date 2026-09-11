import React, { useEffect, useState } from 'react';
import { MailIcon, CloseIcon } from './icons';

export interface IncomingMailData {
  id: string;
  from: string;
  email: string;
  subject: string;
  folderPath: string;
  uid?: string;
  count?: number;
}

interface InAppNotificationProps {
  data: IncomingMailData | null;
  onClose: () => void;
  onView: (data: IncomingMailData) => void;
  accent?: string;
}

export const InAppNotification: React.FC<InAppNotificationProps> = ({
  data,
  onClose,
  onView,
  accent = '#2563eb',
}) => {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      setClosing(true);
      setTimeout(onClose, 300);
    }, 7000);
    return () => clearTimeout(timer);
  }, [data, onClose]);

  if (!data) return null;

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-5 right-5 z-[99999] w-[360px] max-w-[calc(100vw-2.5rem)] transition-all duration-300 ease-out transform ${
        !closing
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-3 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl transition-colors dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:text-zinc-100">
        {/* Sol tarafta vurgu şeridi (Accent color bar) */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5"
          style={{ backgroundColor: accent }}
        />

        <div className="flex items-start justify-between gap-3 pl-1">
          {/* İkon */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
            style={{ backgroundColor: accent }}
          >
            <MailIcon size={18} />
          </div>

          {/* İçerik */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {data.count && data.count > 1 ? `${data.count} Yeni E-posta` : 'Yeni E-posta'}
              </span>
              <span className="text-[10px] text-zinc-400">şimdi</span>
            </div>

            <p className="mt-0.5 truncate text-xs font-bold text-zinc-900 dark:text-white">
              {data.from || data.email}
            </p>

            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
              {data.subject || '(konusuz e-posta)'}
            </p>

            {/* Alt İşlemler */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDismiss();
                  onView(data);
                }}
                className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-95"
                style={{ backgroundColor: accent }}
              >
                Görüntüle
              </button>
            </div>
          </div>

          {/* Kapat Butonu */}
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            aria-label="Kapat"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
