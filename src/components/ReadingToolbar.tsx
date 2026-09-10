// src/components/ReadingToolbar.tsx — Okuma paneli eylem çubuğu
import { memo, useEffect, useRef, useState } from 'react';
import type { Folder } from '../types';
import {
  ReplyIcon,
  ForwardIcon,
  ArchiveIcon,
  FolderIcon,
  MailIcon,
  CheckIcon,
  TrashIcon,
  PrintIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ComposeIcon,
} from './icons';

interface ReadingToolbarProps {
  isRead: boolean;
  isTrash: boolean;
  isDraft: boolean;
  folders: Folder[];
  currentFolder?: string;
  onBackToList?: () => void;
  onReply: () => void;
  onForward: () => void;
  onToggleRead: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMove?: (toFolder: string) => void;
  onExportEml?: () => void;
  onEditDraft?: () => void;
}

export const ReadingToolbar = memo(function ReadingToolbar({
  isRead,
  isTrash,
  isDraft,
  folders,
  currentFolder,
  onBackToList,
  onReply,
  onForward,
  onToggleRead,
  onArchive,
  onDelete,
  onMove,
  onExportEml,
  onEditDraft,
}: ReadingToolbarProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const moveCandidates = folders.filter((f) => f.path !== currentFolder);

  return (
    <div className="flex items-center justify-between gap-1.5 border-b border-zinc-200/70 pb-3 dark:border-zinc-800/80 overflow-x-auto no-scrollbar">
      {/* Sol Grup: Geri / Yanıtla / İlet / Taslağı Düzenle */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 mr-1 shrink-0"
            title="Mesaj listesine dön"
          >
            <ChevronLeftIcon size={15} />
            <span className="hidden sm:inline">Listeye Dön</span>
          </button>
        )}
        {isDraft ? (
          <button
            type="button"
            onClick={onEditDraft}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 shrink-0"
          >
            <ComposeIcon size={14} />
            <span>Taslağı Düzenle</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-750 shrink-0"
              title="Yanıtla (r)"
            >
              <ReplyIcon size={14} />
              <span className="hidden sm:inline">Yanıtla</span>
              <kbd className="hidden md:inline-block rounded-md border border-zinc-200 px-1 py-0.2 text-[9px] text-zinc-400 dark:border-zinc-700">
                R
              </kbd>
            </button>

            <button
              type="button"
              onClick={onForward}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-750 shrink-0"
              title="İlet (f)"
            >
              <ForwardIcon size={14} />
              <span className="hidden sm:inline">İlet</span>
              <kbd className="hidden md:inline-block rounded-md border border-zinc-200 px-1 py-0.2 text-[9px] text-zinc-400 dark:border-zinc-700">
                F
              </kbd>
            </button>
          </>
        )}
      </div>

      {/* Sağ Grup: Arşivle / Taşı / Okundu Yap / Sil / Yazdır / İndir */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onArchive && !isTrash && (
          <button
            type="button"
            onClick={onArchive}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-750 shrink-0"
            title="Arşivle (e)"
          >
            <ArchiveIcon size={14} />
            <span className="hidden md:inline">Arşivle</span>
            <kbd className="hidden lg:inline-block rounded-md border border-zinc-200 px-1 py-0.2 text-[9px] text-zinc-400 dark:border-zinc-700">
              E
            </kbd>
          </button>
        )}

        {/* Klasöre Taşı Dropdown */}
        {onMove && moveCandidates.length > 0 && (
          <div className="relative inline-block text-left shrink-0" ref={moveMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoveMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-750"
              title="Klasöre Taşı (v)"
            >
              <FolderIcon size={14} />
              <span className="hidden md:inline">Taşı</span>
              <ChevronDownIcon size={12} className="text-zinc-400" />
            </button>

            {showMoveMenu && (
              <div className="absolute right-0 mt-1 z-50 w-52 rounded-2xl border border-zinc-200 bg-white/95 py-1.5 shadow-xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/95 max-h-60 overflow-y-auto animate-fadeIn">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  Klasör Seçin
                </div>
                {moveCandidates.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      onMove(f.path);
                      setShowMoveMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 truncate flex items-center gap-2 text-zinc-700 dark:text-zinc-200 transition"
                  >
                    <FolderIcon size={14} className="text-zinc-400 shrink-0" />
                    <span className="truncate">{f.name || f.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Okundu/Okunmadı Yap */}
        <button
          type="button"
          onClick={onToggleRead}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-750 shrink-0"
          title={isRead ? 'Okunmadı İşaretle (u)' : 'Okundu İşaretle (i)'}
        >
          {isRead ? <MailIcon size={14} /> : <CheckIcon size={14} />}
          <span className="hidden lg:inline">{isRead ? 'Okunmadı' : 'Okundu'}</span>
        </button>

        {/* Sil Butonu */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-2xs transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40 shrink-0"
            title={isTrash ? 'Kalıcı Olarak Sil (#)' : 'Çöp Kutusuna Taşı (#)'}
          >
            <TrashIcon size={14} />
            <span className="hidden md:inline">{isTrash ? 'Kalıcı Sil' : 'Sil'}</span>
            <kbd className="hidden lg:inline-block rounded-md border border-red-200 px-1 py-0.2 text-[9px] text-red-400 dark:border-red-800">
              #
            </kbd>
          </button>
        )}

        {/* Yazdır Butonu */}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center rounded-xl border border-zinc-200/80 bg-white/90 p-2 text-xs text-zinc-500 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:bg-zinc-750 shrink-0"
          title="Yazdır (Ctrl+P)"
        >
          <PrintIcon size={14} />
        </button>

        {/* EML Dışa Aktar */}
        {onExportEml && (
          <button
            type="button"
            onClick={onExportEml}
            className="inline-flex items-center rounded-xl border border-zinc-200/80 bg-white/90 p-2 text-xs text-zinc-500 shadow-2xs transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:bg-zinc-750 shrink-0"
            title="E-posta dosyasını kaydet (.eml)"
          >
            <DownloadIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

