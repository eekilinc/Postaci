// src/components/Sidebar.tsx — Mailbird 3.0 tarzı iki kademeli modüler sol panel: AccountRail + FolderNav
import { memo, useEffect, useState } from 'react';
import type { AccentKey, Account, Folder } from '../types';
import { AccountRail } from './AccountRail';
import { FolderNav } from './FolderNav';

interface SidebarProps {
  accounts: Account[];
  activeAccount: string | null;
  setActiveAccount: (email: string) => void;
  folders: Folder[];
  activeFolder: string | null;
  setActiveFolder: (path: string) => void;
  stats: { accounts: number; folders: number; messages: number } | null;
  accent: AccentKey;
  onNewEmail: () => void;
  onShowAdd: () => void;
  onShowSettings: () => void;
  onOpenCommandPalette?: () => void;
  onOpenShortcutsHelp?: () => void;
  isUnified?: boolean;
  onSelectUnified?: () => void;
  unifiedUnreadCount?: number;
  accountUnreadCounts?: Record<string, number>;
  onCloseMobile?: () => void;
}

export const Sidebar = memo(function Sidebar({
  accounts,
  activeAccount,
  setActiveAccount,
  folders,
  activeFolder,
  setActiveFolder,
  stats,
  accent,
  onNewEmail,
  onShowAdd,
  onShowSettings,
  onOpenCommandPalette,
  onOpenShortcutsHelp,
  isUnified,
  onSelectUnified,
  unifiedUnreadCount,
  accountUnreadCounts = {},
  onCloseMobile,
}: SidebarProps) {
  // Klasör panelinin açık/kapalı durumunu yerel depolamada sakla
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('postaci_folder_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('postaci_folder_collapsed', String(next));
      return next;
    });
  };

  // Ctrl+B ile hızlı katlama kısayolu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <aside className="h-full shrink-0 flex print:hidden select-none">
      {/* 1. Aşama: Dar Sol Hesap & Araç Rayı (Her Zaman Görünür) */}
      <AccountRail
        accounts={accounts}
        activeAccount={activeAccount}
        setActiveAccount={setActiveAccount}
        isUnified={isUnified}
        onSelectUnified={onSelectUnified}
        unifiedUnreadCount={unifiedUnreadCount}
        accountUnreadCounts={accountUnreadCounts}
        onShowAdd={onShowAdd}
        onShowSettings={onShowSettings}
        onOpenCommandPalette={onOpenCommandPalette}
        onOpenShortcutsHelp={onOpenShortcutsHelp}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        accent={accent}
      />

      {/* 2. Aşama: Genişletilebilir Klasör Paneli */}
      {!isCollapsed && (
        <FolderNav
          folders={folders}
          activeFolder={activeFolder}
          setActiveFolder={setActiveFolder}
          isUnified={isUnified}
          activeAccount={activeAccount}
          accounts={accounts}
          onNewEmail={onNewEmail}
          stats={stats}
          accent={accent}
          onCloseMobile={onCloseMobile}
        />
      )}
    </aside>
  );
});
