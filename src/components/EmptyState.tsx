// src/components/EmptyState.tsx — Modern ve minimalist boş durum ekranı
import React, { memo } from 'react';
import { PostaciLogo } from './PostaciLogo';
import { useTranslation } from '../i18n';
import {
  CheckIcon,
  SparklesIcon,
  StarIcon,
  AttachmentIcon,
  SearchIcon,
  MailOpenIcon,
  FolderIcon,
} from './icons';

export type EmptyStateType =
  | 'inbox-zero'
  | 'no-unread'
  | 'no-starred'
  | 'no-attachment'
  | 'no-search'
  | 'no-selection'
  | 'empty-folder'
  | 'no-account';

interface EmptyStateProps {
  type: EmptyStateType;
  searchQuery?: string;
  onAction?: () => void;
  actionLabel?: string;
}

export const EmptyState = memo(function EmptyState({
  type,
  searchQuery,
  onAction,
  actionLabel,
}: EmptyStateProps) {
  const { t, language } = useTranslation();

  const configs: Record<
    EmptyStateType,
    { renderIcon: () => React.ReactNode; title: string; desc: string; badge?: string }
  > = {
    'inbox-zero': {
      renderIcon: () => <CheckIcon size={28} className="text-emerald-500" strokeWidth={2.5} />,
      title: t('empty.inboxZeroTitle'),
      desc: t('empty.inboxZeroDesc'),
      badge: 'Inbox Zero',
    },
    'no-unread': {
      renderIcon: () => <SparklesIcon size={28} className="text-blue-500" />,
      title: t('empty.noUnreadTitle'),
      desc: t('empty.noUnreadDesc'),
    },
    'no-starred': {
      renderIcon: () => <StarIcon size={28} className="text-amber-500" filled />,
      title: t('empty.noStarredTitle'),
      desc: t('empty.noStarredDesc'),
    },
    'no-attachment': {
      renderIcon: () => <AttachmentIcon size={28} className="text-zinc-400 dark:text-zinc-500" />,
      title: t('empty.noAttachmentTitle'),
      desc: t('empty.noAttachmentDesc'),
    },
    'no-search': {
      renderIcon: () => <SearchIcon size={28} className="text-zinc-400 dark:text-zinc-500" />,
      title: t('empty.noSearchTitle'),
      desc: t('empty.noSearchDesc'),
    },
    'no-selection': {
      renderIcon: () => <MailOpenIcon size={28} className="text-zinc-400 dark:text-zinc-500" />,
      title: language === 'en' ? 'No Email Selected' : 'E-posta Seçilmedi',
      desc: t('empty.noMessageSelected'),
    },
    'empty-folder': {
      renderIcon: () => <FolderIcon size={28} className="text-zinc-400 dark:text-zinc-500" />,
      title: t('empty.emptyFolderTitle'),
      desc: t('empty.emptyFolderDesc'),
    },
    'no-account': {
      renderIcon: () => <PostaciLogo size="lg" />,
      title: t('empty.noAccountTitle'),
      desc: t('empty.noAccountDesc'),
    },
  };

  const config = configs[type] || configs['empty-folder'];
  const isBranded = type === 'no-account' || type === 'no-selection';

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none animate-fadeIn">
      <div className="relative mb-3.5 flex items-center justify-center">
        {isBranded ? (
          <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
            <PostaciLogo size="xl" />
          </div>
        ) : (
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 shadow-inner border border-zinc-200/60 dark:border-zinc-700/60">
            {config.renderIcon()}
            {config.badge && (
              <span className="absolute -top-2 -right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white shadow-xs">
                {config.badge}
              </span>
            )}
          </div>
        )}
      </div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {config.title}
      </h3>
      <p className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {searchQuery ? (language === 'en' ? `No results found for "${searchQuery}".` : `"${searchQuery}" için sonuç bulunamadı.`) : config.desc}
      </p>
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
});

