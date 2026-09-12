/// src/components/CommandPaletteModal.tsx — Superhuman / Spotlight tarzı Hızlı Komut Paleti (Ctrl+K)
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Account, Folder, FilterKey } from '../types';
import type { LayoutMode } from './LayoutSwitcher';
import { organizeAndDeduplicateFolders } from '../utils/folders';
import { PostaciLogo } from './PostaciLogo';
import {
  ComposeIcon,
  SyncIcon,
  SettingsIcon,
  KeyboardIcon,
  BellIcon,
  FolderRoleIcon,
  GoogleBrandIcon,
  MicrosoftBrandIcon,
  UserIcon,
  InboxIcon,
  MailIcon,
  StarIcon,
  AttachmentIcon,
  CloseIcon,
  SearchIcon,
  ThreeColumnIcon,
  HorizontalLayoutIcon,
  CompactLayoutIcon,
} from './icons';
import { useTranslation } from '../i18n';

interface CommandItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  renderIcon: () => React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  activeAccount: string | null;
  onSelectAccount: (email: string) => void;
  folders: Folder[];
  activeFolder: string;
  onSelectFolder: (folderPath: string) => void;
  onNewMail: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenShortcutsHelp: () => void;
  activeFilter: FilterKey;
  onSelectFilter: (filter: FilterKey) => void;
  layoutMode?: LayoutMode;
  onSelectLayoutMode?: (mode: LayoutMode) => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  accounts,
  activeAccount,
  onSelectAccount,
  folders,
  activeFolder,
  onSelectFolder,
  onNewMail,
  onSync,
  onOpenSettings,
  onOpenShortcutsHelp,
  activeFilter,
  onSelectFilter,
  layoutMode,
  onSelectLayoutMode,
}: CommandPaletteModalProps) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Komutların listesini dinamik olarak oluştur
  const allCommands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    const catActions = t('cmd.catActions');
    const catLayout = t('cmd.catLayout');
    const catFolders = t('cmd.catFolders');
    const catAccounts = t('cmd.catAccounts');
    const catFilters = t('cmd.catFilters');

    // 1. Eylemler
    list.push({
      id: 'act-compose',
      category: catActions,
      title: t('cmd.compose'),
      subtitle: t('cmd.composeDesc'),
      renderIcon: () => <ComposeIcon size={16} />,
      shortcut: 'C',
      action: () => {
        onNewMail();
        onClose();
      },
    });

    list.push({
      id: 'act-sync',
      category: catActions,
      title: t('cmd.refresh'),
      subtitle: t('cmd.refreshDesc'),
      renderIcon: () => <SyncIcon size={16} />,
      shortcut: 'Y',
      action: () => {
        onSync();
        onClose();
      },
    });

    list.push({
      id: 'act-settings',
      category: catActions,
      title: t('cmd.settings'),
      subtitle: t('cmd.settingsDesc'),
      renderIcon: () => <SettingsIcon size={16} />,
      action: () => {
        onOpenSettings();
        onClose();
      },
    });

    list.push({
      id: 'act-shortcuts',
      category: catActions,
      title: t('cmd.shortcuts'),
      subtitle: t('cmd.shortcutsDesc'),
      renderIcon: () => <KeyboardIcon size={16} />,
      shortcut: '?',
      action: () => {
        onOpenShortcutsHelp();
        onClose();
      },
    });

    list.push({
      id: 'act-test-notify',
      category: catActions,
      title: language === 'en' ? 'Send Test Desktop Notification' : 'Test Masaüstü Bildirimi Gönder',
      subtitle: language === 'en' ? 'Test Windows Action Center notifications' : 'Windows İşlem Merkezi bildirimini test et',
      renderIcon: () => <BellIcon size={16} />,
      action: () => {
        window.postaci?.notifications?.test().catch(() => {});
        onClose();
      },
    });

    // 2. Düzen (Layout) Seçenekleri
    if (onSelectLayoutMode) {
      list.push({
        id: 'layout-three-column',
        category: catLayout,
        title: t('cmd.layoutThreeCol'),
        subtitle: layoutMode === 'three-column' ? (language === 'en' ? 'Current active layout' : 'Şu anki aktif düzen') : t('cmd.layoutThreeColDesc'),
        renderIcon: () => <ThreeColumnIcon size={16} />,
        action: () => {
          onSelectLayoutMode('three-column');
          onClose();
        },
      });

      list.push({
        id: 'layout-horizontal',
        category: catLayout,
        title: t('cmd.layoutTwoCol'),
        subtitle: layoutMode === 'horizontal' ? (language === 'en' ? 'Current active layout' : 'Şu anki aktif düzen') : t('cmd.layoutTwoColDesc'),
        renderIcon: () => <HorizontalLayoutIcon size={16} />,
        action: () => {
          onSelectLayoutMode('horizontal');
          onClose();
        },
      });

      list.push({
        id: 'layout-compact',
        category: catLayout,
        title: t('cmd.layoutNoPane'),
        subtitle: layoutMode === 'compact' ? (language === 'en' ? 'Current active layout' : 'Şu anki aktif düzen') : t('cmd.layoutNoPaneDesc'),
        renderIcon: () => <CompactLayoutIcon size={16} />,
        action: () => {
          onSelectLayoutMode('compact');
          onClose();
        },
      });
    }

    // 3. Klasörler
    const isGoogle = activeAccount?.includes('gmail');
    const { allDisplayFolders } = organizeAndDeduplicateFolders(folders, activeFolder, isGoogle, language);
    allDisplayFolders.forEach((f) => {
      const isCurrent = f.path === activeFolder;
      list.push({
        id: `folder-${f.path}`,
        category: catFolders,
        title: f.displayName || f.name || f.path,
        subtitle: isCurrent ? (language === 'en' ? 'Current active folder' : 'Şu anki aktif klasör') : (language === 'en' ? `Jump to folder (${f.path})` : `Klasöre zıpla (${f.path})`),
        renderIcon: () => <FolderRoleIcon role={f.role} size={16} />,
        action: () => {
          onSelectFolder(f.path);
          onClose();
        },
      });
    });

    // 3. Hesaplar
    accounts.forEach((acc) => {
      const isCurrent = acc.email === activeAccount;
      list.push({
        id: `account-${acc.id}`,
        category: catAccounts,
        title: acc.display_name ? `${acc.display_name} (${acc.email})` : acc.email,
        subtitle: isCurrent ? (language === 'en' ? 'Current active account' : 'Şu anki aktif hesap') : (language === 'en' ? `Switch to ${acc.provider.toUpperCase()} account` : `${acc.provider.toUpperCase()} hesabına geçiş yap`),
        renderIcon: () =>
          acc.provider === 'google' ? (
            <GoogleBrandIcon size={16} />
          ) : acc.provider === 'microsoft' ? (
            <MicrosoftBrandIcon size={16} />
          ) : (
            <UserIcon size={16} />
          ),
        action: () => {
          onSelectAccount(acc.email);
          onClose();
        },
      });
    });

    // 4. Filtreler
    const filterOptions: {
      key: FilterKey;
      label: string;
      renderIcon: () => React.ReactNode;
      desc: string;
    }[] = [
      { key: 'all', label: t('cmd.filterAll'), renderIcon: () => <InboxIcon size={16} />, desc: t('cmd.filterAllDesc') },
      { key: 'unread', label: t('cmd.filterUnread'), renderIcon: () => <MailIcon size={16} />, desc: t('cmd.filterUnreadDesc') },
      { key: 'starred', label: t('cmd.filterStarred'), renderIcon: () => <StarIcon size={16} filled />, desc: t('cmd.filterStarredDesc') },
      { key: 'attachment', label: t('cmd.filterAttachments'), renderIcon: () => <AttachmentIcon size={16} />, desc: t('cmd.filterAttachmentsDesc') },
    ];

    filterOptions.forEach((f) => {
      const isCurrent = f.key === activeFilter;
      list.push({
        id: `filter-${f.key}`,
        category: catFilters,
        title: f.label,
        subtitle: isCurrent ? (language === 'en' ? 'Current active filter' : 'Şu anki aktif filtre') : f.desc,
        renderIcon: f.renderIcon,
        action: () => {
          onSelectFilter(f.key);
          onClose();
        },
      });
    });

    return list;
  }, [
    accounts,
    activeAccount,
    folders,
    activeFolder,
    activeFilter,
    onNewMail,
    onSync,
    onOpenSettings,
    onOpenShortcutsHelp,
    onSelectAccount,
    onSelectFolder,
    onSelectFilter,
    layoutMode,
    onSelectLayoutMode,
    onClose,
    language,
    t,
  ]);

  // Arama sorgusuna göre filtrele
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase().trim();
    return allCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q)
    );
  }, [allCommands, query]);

  // Modal açıldığında input'a odaklan
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const safeSelectedIndex = selectedIndex >= filteredCommands.length ? Math.max(0, filteredCommands.length - 1) : selectedIndex;

  const handleClose = () => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  };

  // Seçili öğeyi ekranda görünür tut
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[safeSelectedIndex] as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [safeSelectedIndex]);

  // Klavye yön tuşları ve Enter / Esc dinleyicisi
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[safeSelectedIndex]) {
        filteredCommands[safeSelectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs transition-opacity duration-150"
      onClick={handleClose}
    >
      <div
        className="w-[36rem] max-w-[92vw] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 transition-all duration-150 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arama Başlığı */}
        <div className="flex items-center gap-3 border-b border-zinc-200/80 px-4 py-3.5 dark:border-zinc-800">
          <PostaciLogo size="xs" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('cmd.placeholder')}
            className="flex-1 bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <CloseIcon size={14} />
            </button>
          )}
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
            ESC
          </span>
        </div>

        {/* Sonuç Listesi */}
        <div
          ref={listRef}
          className="max-h-[22rem] overflow-y-auto p-2 scroll-py-1 space-y-0.5"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
              <SearchIcon size={28} className="mx-auto text-zinc-400 mb-2" />
              <p className="font-medium">{t('cmd.noResults')}</p>
              <p className="text-xs mt-1 text-zinc-400">{language === 'en' ? 'Try a different search term' : 'Farklı bir arama terimi deneyin'}</p>
            </div>
          ) : (
            filteredCommands.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white'
                      : 'text-zinc-700 hover:bg-zinc-100/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="shrink-0">{item.renderIcon()}</span>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm font-semibold ${
                            isSelected ? 'text-white' : 'text-zinc-800 dark:text-zinc-100'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p
                          className={`truncate text-xs mt-0.5 ${
                            isSelected ? 'text-blue-100' : 'text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {item.shortcut && (
                    <kbd
                      className={`ml-3 shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold ${
                        isSelected
                          ? 'border-blue-400/50 bg-blue-700/50 text-white'
                          : 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Alt Kılavuz Bilgisi */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-xs border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800">
                ↑
              </kbd>
              <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-xs border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800">
                ↓
              </kbd>
              <span>{language === 'en' ? 'Navigate' : 'Gezin'}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-xs border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800">
                ↵
              </kbd>
              <span>{language === 'en' ? 'Select' : 'Seç'}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-xs border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800">
                ESC
              </kbd>
              <span>{t('common.close')}</span>
            </span>
          </div>

          <span className="text-[11px] text-zinc-400">
            {language === 'en'
              ? `${filteredCommands.length} actions listed`
              : `${filteredCommands.length} eylem listelendi`}
          </span>
        </div>
      </div>
    </div>
  );
}
