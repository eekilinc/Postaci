// src/hooks/useKeyboardShortcuts.ts — Global Superhuman / Vim tarzı klavye kısayolları
import { useEffect } from 'react';
import type { Msg } from '../types';

interface UseKeyboardShortcutsProps {
  selected: Msg | null;
  setSelected: (m: Msg | null) => void;
  filteredMessages: Msg[];
  onNewEmail: () => void;
  onReply: () => void;
  onReplyAll?: () => void;
  onForward: () => void;
  onToggleStar: (m: Msg) => void;
  onToggleRead: (m: Msg) => void;
  onArchive: (m: Msg) => void;
  onDelete: (m: Msg) => void;
  onOpenCommandPalette: () => void;
  onOpenShortcutsHelp: () => void;
  isModalOpen: boolean;
}

export function useKeyboardShortcuts({
  selected,
  setSelected,
  filteredMessages,
  onNewEmail,
  onReply,
  onReplyAll,
  onForward,
  onToggleStar,
  onToggleRead,
  onArchive,
  onDelete,
  onOpenCommandPalette,
  onOpenShortcutsHelp,
  isModalOpen,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K veya Cmd+K (Superhuman / Spotlight Komut Paleti) — her zaman çalışır
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // Ctrl+/ veya Cmd+/ — Kısayol rehberi
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        onOpenShortcutsHelp();
        return;
      }

      // Herhangi bir modal açıkken veya form alanında yazarken harf kısayollarını tetikleme
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (isModalOpen) return;

      switch (e.key) {
        case '?':
          e.preventDefault();
          onOpenShortcutsHelp();
          break;
        case 'c':
        case 'n':
          e.preventDefault();
          onNewEmail();
          break;
        case 'r':
          if (selected) {
            e.preventDefault();
            onReply();
          }
          break;
        case 'a':
          if (selected) {
            e.preventDefault();
            if (onReplyAll) {
              onReplyAll();
            } else {
              onReply();
            }
          }
          break;
        case 'f':
          if (selected) {
            e.preventDefault();
            onForward();
          }
          break;
        case 's':
          if (selected) {
            e.preventDefault();
            onToggleStar(selected);
          }
          break;
        case 'u':
          if (selected) {
            e.preventDefault();
            onToggleRead(selected);
          }
          break;
        case 'e':
          if (selected) {
            e.preventDefault();
            onArchive(selected);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selected) {
            e.preventDefault();
            onDelete(selected);
          }
          break;
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          if (filteredMessages.length === 0) break;
          if (!selected) {
            setSelected(filteredMessages[0]);
          } else {
            const idx = filteredMessages.findIndex((m) => m.uid === selected.uid);
            if (idx >= 0 && idx < filteredMessages.length - 1) {
              setSelected(filteredMessages[idx + 1]);
            }
          }
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          if (filteredMessages.length === 0) break;
          if (!selected) {
            setSelected(filteredMessages[0]);
          } else {
            const idx = filteredMessages.findIndex((m) => m.uid === selected.uid);
            if (idx > 0) {
              setSelected(filteredMessages[idx - 1]);
            }
          }
          break;
        }
        case '/': {
          e.preventDefault();
          const searchEl = document.getElementById('search-input') as HTMLInputElement | null;
          if (searchEl) {
            searchEl.focus();
            searchEl.select();
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selected,
    setSelected,
    filteredMessages,
    onNewEmail,
    onReply,
    onReplyAll,
    onForward,
    onToggleStar,
    onToggleRead,
    onArchive,
    onDelete,
    onOpenCommandPalette,
    onOpenShortcutsHelp,
    isModalOpen,
  ]);
}
