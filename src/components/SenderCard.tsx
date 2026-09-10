// src/components/SenderCard.tsx — Okuma paneli gönderen ve alıcı ayrıntıları kartı
import { memo, useState } from 'react';
import type { Msg } from '../types';
import { Avatar } from './Avatar';
import { CopyIcon, CheckIcon, StarIcon, ChevronDownIcon } from './icons';

interface SenderCardProps {
  msg: Msg;
  starred?: boolean;
  onToggleStar?: () => void;
}

function parseSender(fromAddr: string | null): { name: string; email: string } {
  if (!fromAddr) return { name: '(Gönderen yok)', email: '' };
  const trimmed = fromAddr.trim();
  const match = trimmed.match(/^(?:"?([^"]*)"?\s)?(?:<(.+)>)?$/);
  if (match) {
    const name = (match[1] || '').trim();
    const email = (match[2] || '').trim();
    if (name && email) return { name, email };
    if (email) return { name: email.split('@')[0], email };
    if (name) return { name, email: name.includes('@') ? name : '' };
  }
  return { name: trimmed.split('@')[0], email: trimmed };
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export const SenderCard = memo(function SenderCard({
  msg,
  starred,
  onToggleStar,
}: SenderCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const { name: senderName, email: senderEmail } = parseSender(msg.from_addr);
  const fullDate = formatFullDate(msg.date);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!senderEmail) return;
    navigator.clipboard.writeText(senderEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-850/50 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        {/* Sol Taraf: Avatar & Gönderen Bilgisi */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Avatar name={senderName} email={senderEmail} size="md" className="mt-0.5 shrink-0 ring-2 ring-white dark:ring-zinc-800" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                {senderName}
              </span>

              {/* E-posta adresi hapı & kopyalama */}
              {senderEmail && (
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-200/70 px-2.5 py-0.5 text-[11px] text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-700/60 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  title="E-posta adresini kopyala"
                >
                  <span className="truncate max-w-[180px] sm:max-w-[260px]">{senderEmail}</span>
                  {copied ? (
                    <CheckIcon size={11} className="text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CopyIcon size={11} className="text-zinc-400" />
                  )}
                </button>
              )}

              {copied && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  Kopyalandı!
                </span>
              )}
            </div>

            {/* Kime bilgisi & Ayrıntılar butonu */}
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="truncate max-w-[220px] sm:max-w-sm">
                Kime: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{msg.to_addr || 'Bana'}</strong>
              </span>
              <span>•</span>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400 font-medium"
              >
                <span>{showDetails ? 'Ayrıntıları Gizle' : 'Ayrıntılar'}</span>
                <ChevronDownIcon size={12} className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Sağ Taraf: Tarih & Yıldız */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-400 dark:text-zinc-500" title={msg.date || ''}>
            {fullDate}
          </span>

          {onToggleStar && (
            <button
              type="button"
              onClick={onToggleStar}
              className="p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 text-zinc-400 hover:text-amber-500 transition-colors focus:outline-hidden"
              title={starred ? 'Yıldızı Kaldır' : 'Yıldızla'}
            >
              <StarIcon
                size={16}
                filled={!!starred}
                className={starred ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-400'}
              />
            </button>
          )}
        </div>
      </div>

      {/* Genişletilmiş Ayrıntılar Paneli (Drawer) */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400 animate-fadeIn">
          <div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Kimden:</span> {msg.from_addr}
          </div>
          <div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Kime:</span> {msg.to_addr || '-'}
          </div>
          <div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Tarih:</span> {fullDate}
          </div>
          <div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Klasör:</span> {msg.folder_path || 'INBOX'}
          </div>
          {msg.account_email && (
            <div className="sm:col-span-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Bağlı Hesap:</span> {msg.account_email}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
