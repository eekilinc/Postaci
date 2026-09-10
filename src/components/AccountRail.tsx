// src/components/AccountRail.tsx — Mailbird 3.0 tarzı dar sol hesap ve araç rayı (Açık ve Koyu Tema Uyumlu)
import { memo } from 'react';
import type { AccentKey, Account } from '../types';
import {
  AllMailIcon,
  SearchIcon,
  SettingsIcon,
  HelpIcon,
  MenuIcon,
} from './icons';

interface AccountRailProps {
  accounts: Account[];
  activeAccount: string | null;
  setActiveAccount: (email: string) => void;
  isUnified?: boolean;
  onSelectUnified?: () => void;
  unifiedUnreadCount?: number;
  onShowAdd: () => void;
  onShowSettings: () => void;
  onOpenCommandPalette?: () => void;
  onOpenShortcutsHelp?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  accent: AccentKey;
}

export const AccountRail = memo(function AccountRail({
  accounts,
  activeAccount,
  setActiveAccount,
  isUnified,
  onSelectUnified,
  unifiedUnreadCount = 0,
  onShowAdd,
  onShowSettings,
  onOpenCommandPalette,
  onOpenShortcutsHelp,
  isCollapsed,
  onToggleCollapse,
}: AccountRailProps) {
  return (
    <div className="w-[52px] h-full shrink-0 flex flex-col justify-between items-center py-2.5 bg-zinc-100 text-zinc-700 border-r border-zinc-200/90 dark:bg-zinc-950 dark:text-zinc-300 dark:border-zinc-850 select-none z-20 transition-colors duration-150">
      {/* Üst Kısım: Hamburger Menü & Hesaplar */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Hamburger Menü Butonu: Klasör Paneli Aç/Kapat */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-850 transition active:scale-95"
          title={isCollapsed ? 'Klasörleri Genişlet (Ctrl+B)' : 'Klasörleri Daralt (Ctrl+B)'}
        >
          <MenuIcon size={18} />
        </button>

        <div className="w-6 h-px bg-zinc-200 dark:bg-zinc-800 my-0.5" />

        {/* Birleşik Gelen Kutusu Simgesi */}
        {accounts.length > 0 && onSelectUnified && (
          <div className="relative group flex items-center justify-center">
            {isUnified && (
              <div className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-blue-600 dark:bg-white shadow-[0_0_8px_rgba(37,99,235,0.6)] dark:shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            )}
            <button
              type="button"
              onClick={onSelectUnified}
              className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                isUnified
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white hover:bg-zinc-200/80 text-zinc-700 hover:text-zinc-950 border border-zinc-200/80 shadow-2xs dark:border-transparent dark:bg-zinc-850/80 dark:hover:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white'
              }`}
              title="Tüm Gelen Kutuları (Birleşik Görünüm)"
            >
              <AllMailIcon size={18} />
            </button>
            {unifiedUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white shadow-xs pointer-events-none">
                {unifiedUnreadCount > 99 ? '99+' : unifiedUnreadCount}
              </span>
            )}
          </div>
        )}

        {/* Dikey Hesap Listesi Squircles */}
        <div className="flex flex-col items-center gap-2 w-full px-1">
          {accounts.map((acc) => {
            const isSelected = !isUnified && activeAccount === acc.email;
            const isGoogle = acc.provider?.includes('google') || acc.email.includes('gmail');
            const isMs = acc.provider?.includes('microsoft') || acc.email.includes('hotmail') || acc.email.includes('outlook');
            const isEdu = acc.email.includes('.edu');

            // İkon harfi ve renk stili
            let badgeLetter = 'M';
            let squircleStyle = '';

            if (isGoogle) {
              badgeLetter = 'G';
              squircleStyle = isSelected
                ? 'bg-white text-zinc-950 font-black shadow-md border-2 border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-white text-zinc-800 font-bold border border-zinc-300 shadow-2xs hover:border-zinc-400 dark:border-transparent dark:bg-white/95 dark:text-zinc-900 dark:hover:bg-white';
            } else if (isMs) {
              badgeLetter = 'O';
              squircleStyle = isSelected
                ? 'bg-sky-600 text-white font-black shadow-md ring-2 ring-sky-400/40'
                : 'bg-sky-500 text-white font-bold hover:bg-sky-600 shadow-2xs';
            } else if (isEdu) {
              badgeLetter = acc.email[0]?.toUpperCase() || 'E';
              squircleStyle = isSelected
                ? 'bg-purple-600 text-white font-black shadow-md ring-2 ring-purple-400/40'
                : 'bg-purple-500 text-white font-bold hover:bg-purple-600 shadow-2xs';
            } else {
              badgeLetter = acc.email[0]?.toUpperCase() || '@';
              squircleStyle = isSelected
                ? 'bg-emerald-600 text-white font-black shadow-md ring-2 ring-emerald-400/40'
                : 'bg-zinc-200/90 text-zinc-700 font-bold border border-zinc-300/80 hover:bg-zinc-300 dark:border-transparent dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 shadow-2xs';
            }

            return (
              <div key={acc.id} className="relative group flex items-center justify-center">
                {isSelected && (
                  <div className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-blue-600 dark:bg-white shadow-[0_0_8px_rgba(37,99,235,0.6)] dark:shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveAccount(acc.email)}
                  className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs transition-all active:scale-95 ${squircleStyle}`}
                  title={acc.email}
                >
                  <span>{badgeLetter}</span>
                </button>
              </div>
            );
          })}

          {/* Yeni Hesap Ekle (+) Butonu */}
          <button
            type="button"
            onClick={onShowAdd}
            className="h-8 w-8 rounded-xl border border-dashed border-zinc-300 hover:border-zinc-500 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:border-zinc-700 dark:hover:border-zinc-400 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-850 transition active:scale-95 text-base font-medium"
            title="Yeni Hesap Ekle (+)"
          >
            +
          </button>
        </div>
      </div>

      {/* Alt Kısım: Araçlar ve Ayarlar */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Komut Paleti */}
        {onOpenCommandPalette && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-850 transition"
            title="Komut Paleti (Ctrl+K)"
          >
            <SearchIcon size={16} />
          </button>
        )}

        {/* Kısayollar Rehberi */}
        {onOpenShortcutsHelp && (
          <button
            type="button"
            onClick={onOpenShortcutsHelp}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-850 transition"
            title="Klavye Kısayolları (?)"
          >
            <HelpIcon size={16} />
          </button>
        )}

        {/* Ayarlar Çarkı */}
        <button
          type="button"
          onClick={onShowSettings}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-850 transition active:rotate-45"
          title="Ayarlar"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </div>
  );
});
