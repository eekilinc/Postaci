// src/components/MessageItem.tsx — Yüksek performanslı, memoize edilmiş modern e-posta kartı
import { memo } from 'react';
import type { DateFormatPreference, ListDensity, Msg, SnippetLines } from '../types';
import { Avatar } from './Avatar';
import {
  StarIcon,
  AttachmentIcon,
  MailIcon,
  ArchiveIcon,
  TrashIcon,
  CheckIcon,
} from './icons';

interface MessageItemProps {
  msg: Msg;
  isSelected: boolean;
  isChecked: boolean;
  isUnified?: boolean;
  isTrash?: boolean;
  accentSelClass: string;
  hasMultiSelection: boolean;
  density?: ListDensity;
  showAvatars?: boolean;
  snippetLines?: SnippetLines;
  dateFormat?: DateFormatPreference;
  onSelect: (m: Msg) => void;
  onToggleSelectUid?: (uid: string, shiftKey?: boolean) => void;
  onToggleStar: (m: Msg) => void;
  onToggleRead: (m: Msg) => void;
  onDelete: (m: Msg) => void;
  onArchive?: (m: Msg) => void;
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

function formatDate(dateStr: string | null, formatPref: DateFormatPreference = 'smart'): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();

    if (formatPref === 'absolute') {
      return d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    if (formatPref === 'relative') {
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Az önce';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`;
      if (diffSec < 172800) return 'Dün';
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }

    // Varsayılan: smart
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Dün';

    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric', year: '2-digit' });
  } catch {
    return '';
  }
}

export const MessageItem = memo(
  function MessageItem({
    msg,
    isSelected,
    isChecked,
    isUnified,
    isTrash,
    accentSelClass,
    hasMultiSelection,
    density = 'normal',
    showAvatars = true,
    snippetLines = 1,
    dateFormat = 'smart',
    onSelect,
    onToggleSelectUid,
    onToggleStar,
    onToggleRead,
    onDelete,
    onArchive,
  }: MessageItemProps) {
    const isUnread = !msg.is_read;
    const { name: senderName, email: senderEmail } = parseSender(msg.from_addr);
    const dateFormatted = formatDate(msg.date, dateFormat);

    const densityClass =
      density === 'compact'
        ? 'py-1.5 px-2.5 my-0.2 min-h-[42px]'
        : density === 'relaxed'
        ? 'py-3.5 px-3.5 my-0.5 min-h-[64px]'
        : 'py-2.5 px-3 my-0.5 min-h-[54px]';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(msg)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(msg)}
        className={`group relative flex items-center gap-3 mx-1.5 text-left rounded-xl transition-card cursor-pointer border ${densityClass} ${
          isChecked
            ? 'border-blue-400 bg-blue-100/70 dark:border-blue-800 dark:bg-blue-950/50 shadow-xs'
            : isSelected
            ? `${accentSelClass} border-blue-300/90 dark:border-blue-700/80 shadow-xs font-normal`
            : isUnread
            ? 'border-blue-100/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-850/60 hover:bg-blue-50/40 dark:hover:bg-zinc-800 shadow-2xs'
            : 'border-transparent hover:border-zinc-200/90 hover:bg-zinc-100/60 dark:hover:border-zinc-800 dark:hover:bg-zinc-850/40'
        }`}
      >
        {/* Okunmadı Sol Çizgi & Işıma Vurgusu (Mailbird 3.0 Tarzı) */}
        {isUnread && (
          <div className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
        )}

        {/* Çoklu Seçim Onay Kutusu (Seçim modunda veya hover ile görünür) */}
        {(hasMultiSelection || isChecked) && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelectUid?.(msg.uid, e.shiftKey);
            }}
            className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-0 cursor-pointer shrink-0"
            title="Seç (Shift ile aralık)"
          />
        )}

        {/* Sol Taraf: Mailbird Pastel Avatarı */}
        {showAvatars && (
          <div className="relative shrink-0">
            <Avatar name={senderName} email={senderEmail} size={density === 'compact' ? 'sm' : 'md'} />
            {/* Çoklu seçim yokken hover anında avatar üzerinde beliren seçim kutusu */}
            {!hasMultiSelection && !isChecked && (
              <input
                type="checkbox"
                checked={false}
                onChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectUid?.(msg.uid, e.shiftKey);
                }}
                className="absolute inset-0 m-auto h-4 w-4 opacity-0 group-hover:opacity-100 cursor-pointer rounded border-zinc-300 text-blue-600 focus:ring-0 transition-opacity"
                title="Seç"
              />
            )}
          </div>
        )}

        {/* Sağ Blok: Mailbird 3.0 İki Satırlı Ultra-Temiz Bilgi Alanı */}
        <div className="min-w-0 flex-1">
          {/* 1. Satır: Gönderen Adı (Sol) + Tarih (Sağ) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                className={`truncate text-xs sm:text-[13px] ${
                  isUnread
                    ? 'font-bold text-zinc-950 dark:text-zinc-50'
                    : 'font-semibold text-zinc-800 dark:text-zinc-300'
                }`}
              >
                {senderName}
              </span>

              {/* Birleşik Görünümde Hesap Rozeti */}
              {isUnified && msg.account_email && (
                <span
                  className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.2 text-[9px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                  title={`Hesap: ${msg.account_email}`}
                >
                  {msg.account_email.split('@')[0]}
                </span>
              )}
            </div>

            {/* Tarih (Mailbird Tarzı Canlı Mavi / Nötr Gösterim) */}
            <span
              className={`shrink-0 text-[11px] font-medium transition-colors ${
                isUnread
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {dateFormatted}
            </span>
          </div>

          {/* 2. Satır: Konu & Snippet Akışı */}
          <div className="mt-0.5 flex items-start justify-between gap-2">
            <div className={`text-xs min-w-0 leading-normal ${snippetLines === 2 ? 'line-clamp-2' : 'truncate'}`}>
              <span
                className={
                  isUnread
                    ? 'font-bold text-zinc-900 dark:text-zinc-100'
                    : 'font-normal text-zinc-700 dark:text-zinc-300'
                }
              >
                {msg.subject || '(konusuz)'}
              </span>
              {snippetLines !== 0 && msg.snippet && (
                <span className="text-zinc-400 dark:text-zinc-500 font-normal">
                  {' — '}{msg.snippet}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Ek Dosya Simgesi */}
              {msg.has_att && (
                <span title="Ek dosya içerir" className="text-zinc-400 dark:text-zinc-500">
                  <AttachmentIcon size={12} strokeWidth={2.2} />
                </span>
              )}

              {/* Yıldız Butonu */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(msg);
                }}
                className="p-0.5 text-zinc-400 transition-colors hover:text-amber-500 focus:outline-hidden"
                title={msg.starred ? 'Yıldızı Kaldır' : 'Yıldızla'}
              >
                <StarIcon
                  size={13}
                  filled={!!msg.starred}
                  className={msg.starred ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-400'}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Hover Hızlı Aksiyon Barı (Mailbird / Apple Mail Tarzı Cam Hap) */}
        <div className="absolute right-2 top-2 hidden items-center gap-0.5 rounded-full border border-zinc-200/90 bg-white/95 px-1.5 py-0.5 action-pill-shadow backdrop-blur-md group-hover:flex dark:border-zinc-700/90 dark:bg-zinc-850/95 animate-fadeIn z-10">
          {/* Okundu/Okunmadı Değiştir */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleRead(msg);
            }}
            className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 transition active:scale-95"
            title={isUnread ? 'Okundu yap (u)' : 'Okunmadı yap (u)'}
          >
            {isUnread ? <CheckIcon size={13} /> : <MailIcon size={13} />}
          </button>

          {/* Arşivle (Çöp kutusunda değilse) */}
          {onArchive && !isTrash && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(msg);
              }}
              className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 transition active:scale-95"
              title="Arşivle (e)"
            >
              <ArchiveIcon size={13} />
            </button>
          )}

          {/* Sil */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(msg);
            }}
            className="rounded-full p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-950/60 dark:hover:text-red-400 transition active:scale-95"
            title={isTrash ? 'Kalıcı sil' : 'Çöpe at (Del)'}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Performans için özel eşitlik karşılaştırması (60 FPS akıcılık)
    return (
      prev.msg.uid === next.msg.uid &&
      prev.msg.is_read === next.msg.is_read &&
      prev.msg.starred === next.msg.starred &&
      prev.isSelected === next.isSelected &&
      prev.isChecked === next.isChecked &&
      prev.hasMultiSelection === next.hasMultiSelection &&
      prev.isUnified === next.isUnified &&
      prev.isTrash === next.isTrash &&
      prev.accentSelClass === next.accentSelClass
    );
  }
);
