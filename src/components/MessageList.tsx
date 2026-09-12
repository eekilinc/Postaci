// src/components/MessageList.tsx — Modern, modüler ve yüksek performanslı e-posta listesi
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccentKey, DateFormatPreference, FilterKey, Folder, ListDensity, Msg, SnippetLines } from '../types';
import { ACCENTS } from '../constants';
import { organizeAndDeduplicateFolders } from '../utils/folders';
import { MessageItem } from './MessageItem';
import { EmptyState, type EmptyStateType } from './EmptyState';
import {
  SearchIcon,
  SyncIcon,
  TrashIcon,
  StarIcon,
  AttachmentIcon,
  MailIcon,
  MailOpenIcon,
  ArchiveIcon,
  FolderIcon,
  CloseIcon,
  ChevronDownIcon,
  FolderRoleIcon,
  SortAscIcon,
  SortDescIcon,
} from './icons';

interface MessageListProps {
  messages: Msg[];
  selected: Msg | null;
  onSelect: (m: Msg) => void;
  activeAccount: string | null;
  activeFolder: string | null;
  syncing: boolean;
  inElectron: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchAll: boolean;
  setSearchAll: (v: boolean | ((prev: boolean) => boolean)) => void;
  activeFilter: FilterKey;
  setActiveFilter: (f: FilterKey) => void;
  filterCounts: { all: number; unread: number; starred: number; attachment: number };
  accent: AccentKey;
  hasMoreDb: boolean;
  hasMoreServer: boolean;
  loadingMore: boolean;
  totalDbCount: number;
  serverTotal: number;
  onLoadMore: () => void;
  onLoadMoreServer: () => void;
  onSync: () => void;
  onDelete: (m: Msg) => void;
  onToggleStar: (m: Msg) => void;
  onToggleRead: (m: Msg) => void;
  onArchive?: (m: Msg) => void;
  isUnified?: boolean;
  onEmptyTrash?: () => void;
  selectedUids?: Set<string>;
  onToggleSelectUid?: (uid: string, shiftKey?: boolean) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onBatchDelete?: () => void;
  onBatchMarkRead?: (isRead: boolean) => void;
  onBatchStar?: (starred: boolean) => void;
  onBatchArchive?: () => void;
  onBatchMove?: (toFolder: string) => void;
  folders?: Folder[];
  className?: string;
  density?: ListDensity;
  showAvatars?: boolean;
  snippetLines?: SnippetLines;
  dateFormat?: DateFormatPreference;
}

export function MessageList({
  messages,
  selected,
  onSelect,
  activeAccount,
  activeFolder,
  syncing,
  inElectron,
  searchQuery,
  setSearchQuery,
  searchAll,
  setSearchAll,
  activeFilter,
  setActiveFilter,
  filterCounts,
  accent,
  hasMoreDb,
  hasMoreServer,
  loadingMore,
  totalDbCount,
  serverTotal,
  onLoadMore,
  onLoadMoreServer,
  onSync,
  onDelete,
  onToggleStar,
  onToggleRead,
  onArchive,
  isUnified,
  onEmptyTrash,
  selectedUids,
  onToggleSelectUid,
  onSelectAll,
  onClearSelection,
  onBatchDelete,
  onBatchMarkRead,
  onBatchStar,
  onBatchArchive,
  onBatchMove,
  folders = [],
  className = 'w-96 shrink-0 border-r border-zinc-200/80 dark:border-zinc-800/80',
  density,
  showAvatars,
  snippetLines,
  dateFormat,
}: MessageListProps) {
  const A = ACCENTS[accent];

  const effectiveDensity = density || (localStorage.getItem('postaci_list_density') as ListDensity) || 'normal';
  const effectiveShowAvatars = showAvatars !== undefined ? showAvatars : localStorage.getItem('postaci_show_avatars') !== 'false';
  const effectiveSnippetLines = snippetLines !== undefined ? snippetLines : (Number(localStorage.getItem('postaci_snippet_lines') ?? 1) as SnippetLines);
  const effectiveDateFormat = dateFormat || (localStorage.getItem('postaci_date_format') as DateFormatPreference) || 'smart';
  const isTrash = !isUnified && /trash|çöp|deleted|bin/i.test(activeFolder || '');
  const [showBatchMove, setShowBatchMove] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const batchMoveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (batchMoveRef.current && !batchMoveRef.current.contains(e.target as Node)) {
        setShowBatchMove(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const moveCandidateFolders = useMemo(() => {
    const isGoogle = activeAccount?.includes('gmail');
    const { allDisplayFolders } = organizeAndDeduplicateFolders(folders, activeFolder, isGoogle);
    return allDisplayFolders.filter((f) => f.path !== activeFolder);
  }, [folders, activeFolder, activeAccount]);

  const filterTabs: { key: FilterKey; label: string; icon?: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'Tümü', count: filterCounts.all },
    { key: 'unread', label: 'Okunmamış', count: filterCounts.unread },
    {
      key: 'starred',
      label: 'Yıldızlı',
      icon: <StarIcon size={12} className="text-amber-500 shrink-0" filled />,
      count: filterCounts.starred,
    },
    {
      key: 'attachment',
      label: 'Ekli',
      icon: <AttachmentIcon size={12} className="text-zinc-400 shrink-0" />,
      count: filterCounts.attachment,
    },
  ];

  const folderDisplayName = useMemo(() => {
    if (isUnified) return 'Gelen Kutusu';
    if (!activeFolder || activeFolder.toUpperCase() === 'INBOX') return 'Gelen Kutusu';
    const found = folders.find((f) => f.path === activeFolder);
    return found?.displayName || found?.name || found?.path || activeFolder;
  }, [folders, activeFolder, isUnified]);

  const displayedMessages = useMemo(() => {
    if (sortOrder === 'desc') return messages;
    return [...messages].reverse();
  }, [messages, sortOrder]);

  const listRef = useRef<HTMLDivElement>(null);

  // Klasör veya hesap değişince listeyi en üste kaydır
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [activeFolder, activeAccount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 70) {
      if (hasMoreDb && !loadingMore) {
        onLoadMore();
      }
    }
  };

  const emptyType: EmptyStateType = useMemo(() => {
    if (!activeAccount && !isUnified) return 'no-account';
    if (searchQuery) return 'no-search';
    if (activeFilter === 'unread') return 'no-unread';
    if (activeFilter === 'starred') return 'no-starred';
    if (activeFilter === 'attachment') return 'no-attachment';
    if (activeFolder === 'INBOX' || !activeFolder) return 'inbox-zero';
    return 'empty-folder';
  }, [activeAccount, isUnified, searchQuery, activeFilter, activeFolder]);

  return (
    <section className={`flex flex-col bg-white dark:bg-zinc-900 print:hidden select-none min-w-0 ${className}`}>
      {/* Üst Araç Çubuğu: Mailbird 3.0 Akıcı Arama ve Eşitleme */}
      <div className="flex items-center gap-1.5 border-b border-zinc-200/70 p-2.5 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md min-w-0">
        <div className="relative flex-1 min-w-0">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none transition-colors" />
          <input
            id="search-input"
            placeholder={
              isUnified
                ? 'Gelen kutularında ara... (/)'
                : `${activeFolder || 'INBOX'} içinde ara... (/)`
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200/90 bg-zinc-100/60 py-1.5 pl-9 pr-7 text-xs text-zinc-900 shadow-2xs outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-750 dark:bg-zinc-800/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-800 dark:focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              title="Aramayı temizle"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        <button
          onClick={() => setSearchAll((s) => !s)}
          className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition shadow-2xs ${
            searchAll
              ? 'bg-zinc-200/90 border-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:border-zinc-600 dark:text-white font-semibold'
              : 'border-zinc-200/80 bg-white/90 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 dark:border-zinc-750 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-750'
          }`}
          title="Tüm klasörlerde ara"
        >
          {searchAll ? 'Tümü ✓' : 'Tümü'}
        </button>

        <button
          onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
          className="shrink-0 h-7.5 w-7.5 rounded-xl border border-zinc-200/80 bg-white/90 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 dark:border-zinc-750 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-750 flex items-center justify-center transition shadow-2xs"
          title={sortOrder === 'desc' ? 'Sıralama: En Yeni İlk (Tıkla: En Eski İlk)' : 'Sıralama: En Eski İlk (Tıkla: En Yeni İlk)'}
        >
          {sortOrder === 'desc' ? <SortDescIcon size={13} /> : <SortAscIcon size={13} />}
        </button>

        <button
          onClick={onSync}
          disabled={(!activeAccount && !isUnified) || syncing || !inElectron}
          className={`shrink-0 h-7.5 w-7.5 rounded-xl ${A.btn} text-xs font-medium text-white shadow-2xs transition disabled:opacity-50 flex items-center justify-center`}
          title={isUnified ? 'Tüm Gelen Kutularını Eşitle' : 'Klasörü Eşitle'}
        >
          <SyncIcon size={13} className={syncing ? 'animate-spin' : ''} />
        </button>

        {/* Çöp Kutusunu Boşalt Butonu + Inline Onay */}
        {isTrash && onEmptyTrash && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowEmptyTrashConfirm(true)}
              disabled={syncing || messages.length === 0}
              className="h-7.5 px-2 rounded-xl border border-red-200 bg-red-50/80 text-xs font-semibold text-red-600 shadow-2xs transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50 flex items-center gap-1"
              title="Çöp kutusunu kalıcı olarak boşalt"
            >
              <TrashIcon size={13} />
              <span className="hidden sm:inline text-[11px]">Boşalt</span>
            </button>

            {/* Inline Onay Popup */}
            {showEmptyTrashConfirm && (
              <div className="absolute right-0 top-9 z-50 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                    <TrashIcon size={14} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Çöp Kutusunu Boşalt</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Tüm iletiler sunucudan ve yerel bellekten kalıcı olarak silinecek. Bu işlem geri alınamaz.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEmptyTrashConfirm(false)}
                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEmptyTrashConfirm(false); onEmptyTrash(); }}
                    className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-[11px] font-semibold transition active:scale-95 flex items-center gap-1"
                  >
                    <TrashIcon size={11} />
                    Kalıcı Sil
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mailbird 3.0 Segmented Control: Filtre Sekmeleri */}
      <div className="border-b border-zinc-200/70 bg-zinc-50/50 px-2.5 py-1.5 dark:border-zinc-800/80 dark:bg-zinc-950/40 min-w-0">
        <div className="flex rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800/70 min-w-0">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex-1 rounded-lg py-1 px-1.5 text-center text-xs transition-all duration-150 flex items-center justify-center gap-1 min-w-0 truncate ${
                  isActive
                    ? 'bg-white shadow-xs font-semibold text-zinc-900 dark:bg-zinc-700 dark:text-white'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 font-medium'
                }`}
                title={tab.label}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0 transition-transform ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                        : tab.key === 'unread'
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'bg-zinc-300/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mailbird 3.0 Klasör Başlığı & İleti Sayısı */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-950/20">
        <div className="flex items-baseline gap-2 min-w-0 truncate">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
            {folderDisplayName}
          </h2>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium shrink-0">
            {totalDbCount !== undefined && totalDbCount > messages.length ? `${messages.length} / ${totalDbCount} ileti` : `${messages.length} ileti`}
          </span>
        </div>
      </div>

      {/* Arama / Filtre Durum Bilgisi */}
      {searchQuery && (
        <div className="border-b border-zinc-100 bg-zinc-100/70 px-3.5 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-850/60 flex items-center justify-between">
          <span>
            Sonuçlar: <strong>"{searchQuery}"</strong> {searchAll ? '(tüm klasörler)' : ''}
          </span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {messages.length} ileti
          </span>
        </div>
      )}

      {/* Toplu Eylem Çubuğu: Mailbird Havada Asılı Panel Hissi */}
      {selectedUids && selectedUids.size > 0 && (
        <div className="mx-2 my-1.5 flex items-center justify-between gap-1.5 rounded-xl border border-blue-200/90 bg-blue-50/95 px-3 py-1.5 text-xs text-blue-900 shadow-sm backdrop-blur-md dark:border-blue-900/70 dark:bg-blue-950/90 dark:text-blue-200 animate-fadeIn min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="font-bold text-[11px] shrink-0">{selectedUids.size} seçildi</span>
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[10px] underline hover:text-blue-700 dark:hover:text-blue-100 truncate"
            >
              {selectedUids.size === messages.length ? 'Bırak' : 'Tümü'}
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onBatchMarkRead?.(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              title="Seçilenleri Okundu İşaretle"
            >
              <MailOpenIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => onBatchMarkRead?.(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              title="Seçilenleri Okunmadı Yap"
            >
              <MailIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => onBatchStar?.(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-amber-500 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              title="Seçilenleri Yıldızla"
            >
              <StarIcon size={14} filled />
            </button>
            {onBatchArchive && !isTrash && (
              <button
                type="button"
                onClick={() => onBatchArchive()}
                className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                title="Seçilenleri Arşivle"
              >
                <ArchiveIcon size={14} />
              </button>
            )}
            {onBatchMove && folders.length > 0 && (
              <div className="relative inline-block text-left" ref={batchMoveRef}>
                <button
                  type="button"
                  onClick={() => setShowBatchMove((v) => !v)}
                  className="h-7 px-1.5 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  title="Seçilenleri Klasöre Taşı"
                >
                  <FolderIcon size={14} />
                  <ChevronDownIcon size={10} className="text-zinc-400" />
                </button>
                {showBatchMove && (
                  <div className="absolute right-0 mt-1 z-50 w-48 rounded-xl border border-zinc-200 bg-white/95 py-1 shadow-xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/95 max-h-52 overflow-y-auto animate-fadeIn">
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Klasöre Taşı
                    </div>
                    {moveCandidateFolders.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => {
                          onBatchMove(f.path);
                          setShowBatchMove(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 truncate flex items-center gap-2 text-zinc-700 dark:text-zinc-200"
                      >
                        <FolderRoleIcon role={f.role} size={14} className="text-zinc-400 shrink-0" />
                        <span className="truncate">{f.displayName || f.name || f.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="h-7 w-7 flex items-center justify-center rounded-lg bg-red-600 text-white shadow-2xs transition hover:bg-red-700"
                title={isTrash ? 'Seçilenleri Kalıcı Sil' : 'Seçilenleri Çöpe Taşı'}
              >
                <TrashIcon size={14} />
              </button>

              {showBatchDeleteConfirm && (
                <div className="absolute right-0 top-9 z-50 w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-3.5 space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                      <TrashIcon size={13} className="text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {isTrash
                        ? `Seçili ${selectedUids?.size ?? ''} ileti kalıcı olarak silinecek.`
                        : `Seçili ${selectedUids?.size ?? ''} ileti çöp kutusuna taşınacak.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowBatchDeleteConfirm(false)}
                      className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowBatchDeleteConfirm(false); onBatchDelete?.(); }}
                      className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[11px] font-semibold transition active:scale-95"
                    >
                      {isTrash ? 'Kalıcı Sil' : 'Çöpe Taşı'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Seçimi İptal Et"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Mesaj Listesi (Kaydırılabilir Alan) */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-1 py-1"
      >
        {messages.length === 0 ? (
          <EmptyState type={emptyType} searchQuery={searchQuery} />
        ) : (
          displayedMessages.map((m) => (
            <MessageItem
              key={m.uid}
              msg={m}
              isSelected={selected?.uid === m.uid}
              isChecked={!!selectedUids?.has(m.uid)}
              isUnified={isUnified}
              isTrash={isTrash}
              accentSelClass={A.sel}
              hasMultiSelection={!!selectedUids && selectedUids.size > 0}
              density={effectiveDensity}
              showAvatars={effectiveShowAvatars}
              snippetLines={effectiveSnippetLines}
              dateFormat={effectiveDateFormat}
              onSelect={onSelect}
              onToggleSelectUid={onToggleSelectUid}
              onToggleStar={onToggleStar}
              onToggleRead={onToggleRead}
              onDelete={onDelete}
              onArchive={onArchive}
            />
          ))
        )}

        {/* Sonsuz Kaydırma / Sayfalama Alt Bilgi Paneli */}
        {messages.length > 0 && (
          <div className="p-3 text-center text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/60">
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                <SyncIcon size={13} className="animate-spin" />
                <span>İletiler yükleniyor...</span>
              </div>
            ) : hasMoreDb ? (
              <button
                type="button"
                onClick={onLoadMore}
                className="w-full py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-xs font-medium transition shadow-2xs"
              >
                Daha Fazla Göster ({totalDbCount - messages.length} ileti daha var)
              </button>
            ) : hasMoreServer ? (
              <button
                type="button"
                onClick={onLoadMoreServer}
                className="w-full py-2 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40 text-xs font-medium transition shadow-2xs inline-flex items-center justify-center gap-1.5"
              >
                <SyncIcon size={13} />
                <span>Sunucudaki Daha Eski İletileri Getir (Toplam {serverTotal} ileti)</span>
              </button>
            ) : (
              <span className="text-[11px] text-zinc-400">
                Tüm iletiler yüklendi ({messages.length} ileti)
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
