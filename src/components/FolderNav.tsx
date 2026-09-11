// src/components/FolderNav.tsx — Mailbird 3.0 tarzı klasör listesi ve "Klasörleri ara" filtreleme alanı (Açık ve Koyu Tema Uyumlu)
import { memo, useMemo, useState } from 'react';
import type { AccentKey, Account, Folder } from '../types';
import { ACCENTS } from '../constants';
import { organizeAndDeduplicateFolders } from '../utils/folders';
import { PostaciLogo } from './PostaciLogo';
import {
  FolderRoleIcon,
  ComposeIcon,
  SearchIcon,
  CloseIcon,
} from './icons';

interface FolderNavProps {
  folders: Folder[];
  activeFolder: string | null;
  setActiveFolder: (path: string) => void;
  isUnified?: boolean;
  activeAccount: string | null;
  accounts: Account[];
  onNewEmail: () => void;
  stats: { accounts: number; folders: number; messages: number } | null;
  accent: AccentKey;
  onCloseMobile?: () => void;
  className?: string;
}

export const FolderNav = memo(function FolderNav({
  folders,
  activeFolder,
  setActiveFolder,
  isUnified,
  activeAccount,
  accounts,
  onNewEmail,
  stats,
  accent,
  onCloseMobile,
  className = '',
}: FolderNavProps) {
  const A = ACCENTS[accent];
  const [folderQuery, setFolderQuery] = useState('');

  const isGoogle = !!accounts.find((a) => a.email === activeAccount)?.provider?.includes('google');

  // Klasörleri tekilleştir ve sistem / özel klasörler olarak grupla
  const { systemFolders, customFolders, allDisplayFolders } = useMemo(() => {
    return organizeAndDeduplicateFolders(folders, activeFolder, isGoogle);
  }, [folders, activeFolder, isGoogle]);

  // "Klasörleri ara" filtresi: Özel klasörler içinde hızlı arama
  const filteredCustomFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return customFolders;
    return customFolders.filter((f) =>
      (f.displayName || f.name || f.path).toLowerCase().includes(q)
    );
  }, [customFolders, folderQuery]);

  return (
    <div className={`w-52 h-full shrink-0 flex flex-col justify-between bg-zinc-50 text-zinc-800 border-r border-zinc-200/90 dark:bg-zinc-925 dark:text-zinc-200 dark:border-zinc-800/80 p-3 select-none transition-colors duration-150 ${className}`}>
      <div className="overflow-y-auto pr-0.5 space-y-3">
        {/* Üst Kısım: Başlık / Hesap Etiketi ve Mobil Kapat Butonu */}
        <div className="flex items-center justify-between px-1 pt-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <PostaciLogo size="xs" variant="squircle" showBadge={false} />
            <span className="text-xs font-semibold tracking-tight text-zinc-800 dark:text-zinc-200 truncate">
              {isUnified ? 'Birleşik Posta' : activeAccount ? activeAccount.split('@')[0] : 'Postacı'}
            </span>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
              title="Kapat"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {/* Yeni E-posta Oluştur Butonu */}
        <button
          onClick={onNewEmail}
          disabled={accounts.length === 0}
          className={`w-full rounded-xl ${A.btn} px-3 py-2 text-xs font-semibold text-white shadow-xs hover:shadow transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]`}
        >
          <ComposeIcon size={15} className="shrink-0" />
          <span>Yeni E-posta</span>
          <kbd className="rounded bg-black/20 px-1.5 py-0.2 text-[9px] font-mono">C</kbd>
        </button>

        {/* Sistem Klasörleri (Mailbird Üst Grup) */}
        <nav className="space-y-0.5">
          {systemFolders.map((f) => {
            const isDraft = f.role === 'drafts';
            const isSelected = !isUnified && (activeFolder === f.path || (isDraft && /draft|taslak/i.test(activeFolder || '')));
            return (
              <button
                key={f.path}
                onClick={() => setActiveFolder(f.path)}
                className={`w-full rounded-xl px-2.5 py-1.5 text-left text-xs transition-all flex items-center justify-between min-w-0 ${
                  isSelected
                    ? 'bg-zinc-200/90 font-semibold text-zinc-950 shadow-2xs dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800/60 font-medium'
                }`}
                title={f.path}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 truncate">
                  <FolderRoleIcon
                    role={f.role}
                    size={15}
                    className={`shrink-0 transition-colors ${
                      isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  />
                  <span className="truncate">{f.displayName}</span>
                </div>
                {f.unread_count && f.unread_count > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 transition-colors shadow-2xs ${
                      isSelected
                        ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white'
                        : 'bg-zinc-200/90 text-zinc-800 border border-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700/60'
                    }`}
                  >
                    {f.unread_count > 999 ? '999+' : f.unread_count}
                  </span>
                ) : null}
              </button>
            );
          })}

          {allDisplayFolders.length === 0 && (
            <div className="space-y-0.5">
              {[
                { name: 'Gelen Kutusu', path: 'INBOX', role: 'inbox' },
                { name: 'Yıldızlı', path: 'STARRED', role: 'starred' },
                { name: 'Gönderilenler', path: 'SENT', role: 'sent' },
                { name: 'Taslaklar', path: 'Taslaklar', role: 'drafts' },
                { name: 'Çöp Kutusu', path: 'TRASH', role: 'trash' },
                { name: 'Spam', path: 'JUNK', role: 'junk' },
              ].map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActiveFolder(f.path)}
                  className={`w-full rounded-xl px-2.5 py-1.5 text-left text-xs flex items-center gap-2.5 min-w-0 ${
                    activeFolder === f.path
                      ? 'bg-zinc-200/90 font-semibold text-zinc-950 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <FolderRoleIcon role={f.role} size={15} className="shrink-0 text-zinc-400" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Klasörleri Ara Arama Çubuğu (Mailbird 3.0 İmzası) */}
        {customFolders.length > 0 && (
          <div className="pt-2">
            <div className="relative mb-1.5">
              <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Klasörleri ara..."
                value={folderQuery}
                onChange={(e) => setFolderQuery(e.target.value)}
                className="w-full rounded-lg bg-white border border-zinc-200/90 py-1 pl-7 pr-6 text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 outline-none transition"
              />
              {folderQuery && (
                <button
                  onClick={() => setFolderQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  <CloseIcon size={10} />
                </button>
              )}
            </div>

            {/* Özel Klasörler Listesi */}
            <div className="space-y-0.5">
              {filteredCustomFolders.map((f) => {
                const isSelected = !isUnified && activeFolder === f.path;
                return (
                  <button
                    key={f.path}
                    onClick={() => setActiveFolder(f.path)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-left text-xs transition-all flex items-center justify-between min-w-0 ${
                      isSelected
                        ? 'bg-zinc-200/90 font-semibold text-zinc-950 shadow-2xs dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800/60 font-medium'
                    }`}
                    title={f.path}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 truncate">
                      <FolderRoleIcon
                        role="custom"
                        size={14}
                        className={`shrink-0 ${
                          isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                      <span className="truncate">{f.displayName}</span>
                    </div>
                    {f.unread_count && f.unread_count > 0 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 transition-colors shadow-2xs ${
                          isSelected
                            ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white'
                            : 'bg-zinc-200/90 text-zinc-800 border border-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700/60'
                        }`}
                      >
                        {f.unread_count > 999 ? '999+' : f.unread_count}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {filteredCustomFolders.length === 0 && folderQuery && (
                <p className="px-2 py-1 text-[11px] text-zinc-400 dark:text-zinc-500 italic">
                  Eşleşen klasör yok
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Alt Bilgi / Klasör Yönetim Alanı */}
      <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
        <p className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
          {stats
            ? `${stats.folders} klasör • ${stats.messages} ileti`
            : 'Yükleniyor...'}
        </p>
      </div>
    </div>
  );
});
