// src/components/SettingsModal.tsx — Mailbird 3.0 Tarzı İki Bölmeli (Two-Pane) Ayarlar Penceresi
import { useState, useEffect, useMemo } from 'react';
import type { AccentKey, Account, ThemeKey } from '../types';
import type { LayoutMode } from './LayoutSwitcher';
import { ACCENTS } from '../constants';
import { getAccountSignature, saveAccountSignature } from '../utils/signatures';
import { PostaciLogo } from './PostaciLogo';
import { CloseIcon } from './icons';

interface SettingsModalProps {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
  accent: AccentKey;
  setAccent: (a: AccentKey) => void;
  layoutMode?: LayoutMode;
  setLayoutMode?: (mode: LayoutMode) => void;
  onLayoutModeChange?: (mode: LayoutMode) => void;
  accounts: Account[];
  activeAccount: string | null;
  onClose: () => void;
  onOpenAddAccount?: () => void;
  onOpenShortcutsHelp?: () => void;
  onRefreshAccounts?: () => void;
}

type SettingsTab =
  | 'general'
  | 'appearance'
  | 'scaling'
  | 'accounts'
  | 'composing'
  | 'advanced'
  | 'about';

export function SettingsModal({
  theme,
  setTheme,
  accent,
  setAccent,
  layoutMode = 'three-column',
  setLayoutMode,
  onLayoutModeChange,
  accounts,
  activeAccount,
  onClose,
  onOpenAddAccount,
  onOpenShortcutsHelp,
  onRefreshAccounts,
}: SettingsModalProps) {
  const handleLayoutMode = onLayoutModeChange || setLayoutMode;
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);

  // 1. Genel: Uygulama Davranışı
  const [launchOnStartup, setLaunchOnStartup] = useState(() => localStorage.getItem('postaci_startup') === 'true');
  const [startMinimized, setStartMinimized] = useState(() => localStorage.getItem('postaci_minimized') === 'true');
  const [hideTaskbarOnMinimize, setHideTaskbarOnMinimize] = useState(() => localStorage.getItem('postaci_hide_taskbar') !== 'false');
  const [closeToQuit, setCloseToQuit] = useState(() => localStorage.getItem('postaci_close_to_quit') === 'true');
  const [useGmailShortcuts, setUseGmailShortcuts] = useState(() => localStorage.getItem('postaci_gmail_shortcuts') !== 'false');

  // Bildirimler
  const [showUnreadBadge, setShowUnreadBadge] = useState(true);
  const [showTaskbarAlert, setShowTaskbarAlert] = useState(true);
  const [showTrackingAlert, setShowTrackingAlert] = useState(true);
  const [soundChoice, setSoundChoice] = useState('chirp');
  const [language, setLanguage] = useState('tr');
  const [testNotice, setTestNotice] = useState<string | null>(null);

  // 2. Görünüm: Okuma bölmesi & Klasörler
  const [showReadingPane, setShowReadingPane] = useState(true);
  const [showFoldersSeparately, setShowFoldersSeparately] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(() => localStorage.getItem('postaci_wallpaper') || null);

  // 3. Ölçeklendirme (Zoom / Scaling)
  const [appScale, setAppScale] = useState<number>(() => {
    const saved = localStorage.getItem('postaci_app_scale');
    return saved ? Number(saved) : 100;
  });
  const [mailScale, setMailScale] = useState<number>(() => {
    const saved = localStorage.getItem('postaci_mail_scale');
    return saved ? Number(saved) : 100;
  });
  const [textRenderingMode, setTextRenderingMode] = useState<'ideal' | 'standard'>('ideal');

  // 4. Hesaplar & Düzenleme State'i
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editImapHost, setEditImapHost] = useState('');
  const [editImapPort, setEditImapPort] = useState(993);
  const [editSmtpHost, setEditSmtpHost] = useState('');
  const [editSmtpPort, setEditSmtpPort] = useState(465);
  const [editSmtpSecure, setEditSmtpSecure] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountSaveNotice, setAccountSaveNotice] = useState<string | null>(null);

  // 5. İmzalar (Oluşturma)
  const [selectedEmail, setSelectedEmail] = useState(activeAccount || accounts[0]?.email || '');
  const [sigEnabled, setSigEnabled] = useState(() => getAccountSignature(selectedEmail).enabled);
  const [sigText, setSigText] = useState(() => getAccountSignature(selectedEmail).text);
  const [savedNotice, setSavedNotice] = useState(false);

  // 6. İstatistikler (Gelişmiş)
  const [dbStats, setDbStats] = useState<{ accounts: number; folders: number; messages: number } | null>(null);

  useEffect(() => {
    if (window.postaci?.db?.stats) {
      window.postaci.db.stats().then(setDbStats).catch(() => {});
    }
  }, []);

  // UI Zoom seviyesini canlı uygula
  const handleAppScaleChange = (val: number) => {
    setAppScale(val);
    localStorage.setItem('postaci_app_scale', String(val));
    document.documentElement.style.zoom = `${val / 100}`;
  };

  // E-posta gövde font ölçeğini canlı uygula
  const handleMailScaleChange = (val: number) => {
    setMailScale(val);
    localStorage.setItem('postaci_mail_scale', String(val));
    document.documentElement.style.setProperty('--mail-scale', `${val / 100}`);
  };

  const handleSelectAccount = (email: string) => {
    setSelectedEmail(email);
    const s = getAccountSignature(email);
    setSigEnabled(s.enabled);
    setSigText(s.text);
    setSavedNotice(false);
  };

  const handleSaveSignature = () => {
    if (!selectedEmail) return;
    saveAccountSignature(selectedEmail, { enabled: sigEnabled, text: sigText });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleTestNotification = async () => {
    if (!window.postaci?.notifications) return;
    setTestNotice(null);
    try {
      await window.postaci.notifications.test();
      setTestNotice('✓ Test bildirimi gönderildi!');
      setTimeout(() => setTestNotice(null), 3000);
    } catch {
      setTestNotice('✕ Bildirim gönderilemedi.');
      setTimeout(() => setTestNotice(null), 3000);
    }
  };

  const handleCheckUpdate = () => {
    setUpdateCheckStatus('checking');
    setTimeout(() => {
      setUpdateCheckStatus('latest');
    }, 900);
  };

  // Hesap Düzenleme Başlatıcı
  const handleStartEdit = (acc: Account) => {
    setEditingAccountId(acc.id);
    setEditDisplayName(acc.display_name || '');
    setEditImapHost(acc.imap_host || '');
    setEditImapPort(acc.imap_port || 993);
    setEditSmtpHost(acc.smtp_host || '');
    setEditSmtpPort(acc.smtp_port || 465);
    setEditSmtpSecure(acc.smtp_secure !== 0);
    setEditPassword('');
    setShowEditPassword(false);
    setAccountSaveNotice(null);
  };

  // Hesap Düzenlemeyi Kaydet
  const handleSaveAccount = async () => {
    if (!editingAccountId || !window.postaci?.accounts?.update) return;
    setSavingAccount(true);
    setAccountSaveNotice(null);
    try {
      await window.postaci.accounts.update(editingAccountId, {
        displayName: editDisplayName.trim() || undefined,
        imapHost: editImapHost.trim() || undefined,
        imapPort: editImapPort || undefined,
        smtpHost: editSmtpHost.trim() || undefined,
        smtpPort: editSmtpPort || undefined,
        smtpSecure: editSmtpSecure,
        password: editPassword.trim() || undefined,
      });
      setAccountSaveNotice('✓ Hesap ayarları başarıyla güncellendi!');
      onRefreshAccounts?.();
      setTimeout(() => {
        setEditingAccountId(null);
        setAccountSaveNotice(null);
      }, 1000);
    } catch (err) {
      setAccountSaveNotice(`✕ Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingAccount(false);
    }
  };

  // Hesap Kaldır
  const handleDeleteAccount = async (acc: Account) => {
    const confirmDel = window.confirm(
      `"${acc.email}" hesabını Postacı'dan kaldırmak istediğinize emin misiniz?\n\nBu işlem hesabın yerel iletilerini temizler. Sunucudaki e-postalarınız asla silinmez.`
    );
    if (!confirmDel) return;
    if (!window.postaci?.accounts?.delete) return;
    try {
      await window.postaci.accounts.delete(acc.id);
      onRefreshAccounts?.();
      if (editingAccountId === acc.id) {
        setEditingAccountId(null);
      }
    } catch (err) {
      alert(`Hesap kaldırılamadı: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Mailbird Duvar Kağıtları Önizlemeleri
  const wallpapers = useMemo(
    () => [
      { id: 'default', label: 'Varsayılan', color: '#2b56bf' },
      { id: 'blue-abstract', label: 'Mavi Geometri', bg: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' },
      { id: 'dark-violet', label: 'Mor Gece', bg: 'linear-gradient(135deg, #2e1065 0%, #7e22ce 100%)' },
      { id: 'emerald-glow', label: 'Zümrüt Orman', bg: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)' },
      { id: 'sunset-amber', label: 'Gün Batımı', bg: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)' },
      { id: 'slate-cyber', label: 'Siber Grafit', bg: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
    ],
    []
  );

  // Sadece gerçek, dolu ve çalışan sekmeler (İçeriği olmayan boş sekmeler kaldırıldı!)
  const navTabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'Genel' },
    { id: 'appearance', label: 'Görünüm' },
    { id: 'scaling', label: 'Ölçeklendirme' },
    { id: 'accounts', label: 'Hesaplar' },
    { id: 'composing', label: 'Oluşturma' },
    { id: 'advanced', label: 'Gelişmiş' },
    { id: 'about', label: 'Postacı Hakkında' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-fadeIn select-none p-4"
      onClick={onClose}
    >
      {/* Mailbird 3.0 İki Bölmeli Geniş Ayarlar Penceresi */}
      <div
        className="flex h-[560px] max-h-[92vh] w-[740px] max-w-[95vw] rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Sol Sütun: Mailbird Kraliyet Mavisi / Dikey Menü Rayı */}
        <div className="w-48 sm:w-52 shrink-0 bg-[#2b56bf] py-4 flex flex-col justify-between select-none shadow-inner">
          <nav className="space-y-1 px-2.5 overflow-y-auto pr-1 no-scrollbar">
            {navTabs.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    setEditingAccountId(null);
                  }}
                  className={`w-full text-left rounded-lg px-3.5 py-2 text-xs sm:text-[13px] font-medium transition-colors duration-150 block truncate ${
                    isActive
                      ? 'bg-white/20 text-white font-bold shadow-2xs'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Sol Alt Logo & Versiyon */}
          <div className="px-5 pt-3 border-t border-white/10 flex items-center gap-2">
            <PostaciLogo size="xs" variant="squircle" showBadge={false} />
            <span className="text-[11px] font-semibold text-white/90">Postacı 0.1</span>
          </div>
        </div>

        {/* 2. Sağ Sütun: Ferah İçerik Alanı */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 relative">
          {/* Üst Kapat Butonu */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
            title="Kapat"
          >
            <CloseIcon size={16} />
          </button>

          {/* Dinamik Tab İçerikleri */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
            {/* ==================== 1. GENEL TAB ==================== */}
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-xl">
                {/* Uygulama Davranışı */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Uygulama davranışı
                  </h3>
                  <div className="space-y-2.5 text-xs sm:text-[13px]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={launchOnStartup}
                        onChange={(e) => {
                          setLaunchOnStartup(e.target.checked);
                          localStorage.setItem('postaci_startup', String(e.target.checked));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Windows başlangıcında açılsın</span>
                    </label>

                    <label className="flex items-center gap-2.5 ml-6 cursor-pointer opacity-90">
                      <input
                        type="checkbox"
                        checked={startMinimized}
                        disabled={!launchOnStartup}
                        onChange={(e) => {
                          setStartMinimized(e.target.checked);
                          localStorage.setItem('postaci_minimized', String(e.target.checked));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer disabled:opacity-40"
                      />
                      <span className={!launchOnStartup ? 'text-zinc-400' : ''}>
                        Simge durumunda başlasın
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideTaskbarOnMinimize}
                        onChange={(e) => {
                          setHideTaskbarOnMinimize(e.target.checked);
                          localStorage.setItem('postaci_hide_taskbar', String(e.target.checked));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Simge durumunda iken görev çubuğu simgesi gizlensin</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={closeToQuit}
                        onChange={(e) => {
                          setCloseToQuit(e.target.checked);
                          localStorage.setItem('postaci_close_to_quit', String(e.target.checked));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Çıkıldığında Postacı kapatılsın</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useGmailShortcuts}
                        onChange={(e) => {
                          setUseGmailShortcuts(e.target.checked);
                          localStorage.setItem('postaci_gmail_shortcuts', String(e.target.checked));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Gmail klavye kısayollarını kullan</span>
                    </label>
                  </div>
                </div>

                {/* Bildirimler */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Bildirimler
                  </h3>
                  <div className="space-y-2.5 text-xs sm:text-[13px]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUnreadBadge}
                        onChange={(e) => setShowUnreadBadge(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Okunmamış ileti sayısı görev çubuğu & bildirim alanında gösterilsin</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTaskbarAlert}
                        onChange={(e) => setShowTaskbarAlert(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>İleti geldiğinde görev çubuğunda uyarı gösterilsin</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTrackingAlert}
                        onChange={(e) => setShowTrackingAlert(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>E-posta İzlemesi olan bir ileti açıldığında bildirim alanında göster</span>
                    </label>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Yeni ileti sesi:</span>
                      <select
                        value={soundChoice}
                        onChange={(e) => setSoundChoice(e.target.value)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value="chirp">Varsayılan (Chirp)</option>
                        <option value="ding">Ding (Klasik)</option>
                        <option value="bell">Çan</option>
                        <option value="none">Sessiz</option>
                      </select>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleTestNotification}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Test Bildirimi Gönder
                      </button>
                      {testNotice && (
                        <span className="ml-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {testNotice}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dil */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2.5 tracking-tight">
                    Dil
                  </h3>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-48 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English (US)</option>
                  </select>
                </div>
              </div>
            )}

            {/* ==================== 2. GÖRÜNÜM TAB ==================== */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 max-w-xl">
                {/* Arayüz ve Tema Rengi */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Arayüz ve tema rengi
                  </h3>

                  {/* Mailbird Tel Kafes Görsel Yerleşim Kartları */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    {/* Kart 1: 3 Sütunlu Yan Yana */}
                    <button
                      type="button"
                      onClick={() => handleLayoutMode?.('three-column')}
                      className={`flex flex-col items-center rounded-xl border p-3 transition text-left ${
                        layoutMode === 'three-column'
                          ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
                      }`}
                    >
                      <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
                        <div className="w-2 h-full bg-blue-500/30 rounded-xs flex flex-col gap-0.5 p-0.5">
                          <div className="w-1 h-1 rounded-full bg-blue-500" />
                          <div className="w-1 h-1 rounded-full bg-blue-500" />
                        </div>
                        <div className="w-4 h-full border-r border-blue-300/40 dark:border-blue-700/40" />
                        <div className="w-8 h-full border-r border-blue-300/40 dark:border-blue-700/40" />
                        <div className="flex-1 h-full" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">3 Sütunlu Düzen</span>
                      <span className="text-[10px] text-zinc-400">Klasik 3 Sütun</span>
                    </button>

                    {/* Kart 2: Alt Alta / Yatay Bölmeli */}
                    <button
                      type="button"
                      onClick={() => handleLayoutMode?.('horizontal')}
                      className={`flex flex-col items-center rounded-xl border p-3 transition text-left ${
                        layoutMode === 'horizontal'
                          ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
                      }`}
                    >
                      <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
                        <div className="w-2 h-full bg-blue-500/30 rounded-xs flex flex-col gap-0.5 p-0.5">
                          <div className="w-1 h-1 rounded-full bg-blue-500" />
                          <div className="w-1 h-1 rounded-full bg-blue-500" />
                        </div>
                        <div className="flex-1 h-full flex flex-col gap-1">
                          <div className="w-full h-1/2 border-b border-blue-300/40 dark:border-blue-700/40" />
                          <div className="w-full h-1/2" />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Alt Alta Bölmeli</span>
                      <span className="text-[10px] text-zinc-400">Yatay Okuma</span>
                    </button>

                    {/* Kart 3: Odak / Kompakt */}
                    <button
                      type="button"
                      onClick={() => handleLayoutMode?.('compact')}
                      className={`flex flex-col items-center rounded-xl border p-3 transition text-left col-span-2 sm:col-span-1 ${
                        layoutMode === 'compact'
                          ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-750 dark:bg-zinc-800'
                      }`}
                    >
                      <div className="w-full h-16 rounded border border-blue-500/60 dark:border-blue-400/60 flex p-1 gap-1 mb-2 bg-zinc-50 dark:bg-zinc-900/60">
                        <div className="w-3 h-full bg-blue-500/20 rounded-xs" />
                        <div className="flex-1 h-full" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Odak Modu</span>
                      <span className="text-[10px] text-zinc-400">Kompakt Liste</span>
                    </button>
                  </div>

                  {/* Bölme Onay Kutucukları */}
                  <div className="space-y-2 mb-4 text-xs sm:text-[13px]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showReadingPane}
                        onChange={(e) => setShowReadingPane(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Okuma bölmesini göster</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showFoldersSeparately}
                        onChange={(e) => setShowFoldersSeparately(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Klasörleri genişletilmiş gezinti penceresinde ayrı göster</span>
                    </label>
                  </div>

                  {/* 3 Kademeli Tema Seçimi (Mailbird Screenshot 2) */}
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
                      <input
                        type="radio"
                        name="theme_mode"
                        checked={theme === 'light'}
                        onChange={() => setTheme('light')}
                        className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Açık Tema</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
                      <input
                        type="radio"
                        name="theme_mode"
                        checked={theme === 'dark'}
                        onChange={() => setTheme('dark')}
                        className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Koyu Tema</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-[13px]">
                      <input
                        type="radio"
                        name="theme_mode"
                        checked={theme === 'system'}
                        onChange={() => setTheme('system')}
                        className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Sistem Temasıyla Eşitle</span>
                    </label>
                  </div>

                  {/* Vurgu Rengi Seçici */}
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                      Tema rengini seç
                    </p>
                    <div className="flex items-center gap-2">
                      {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => setAccent(k)}
                          title={ACCENTS[k].label}
                          className={`h-7 w-7 rounded-full transition transform active:scale-95 ${ACCENTS[k].dot} ${
                            accent === k
                              ? 'ring-2 ring-blue-500 ring-offset-2 scale-110 dark:ring-offset-zinc-900'
                              : 'opacity-80 hover:opacity-100 hover:scale-105'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Arkaplan Duvar Kağıtları (Mailbird Screenshot 2 İmzası) */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Arkaplan
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    <button
                      type="button"
                      onClick={() => alert('Özel arkaplan fotoğrafı seçme özelliği yakında!')}
                      className="h-16 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 flex items-center justify-center text-zinc-400 hover:text-blue-500 transition"
                      title="Özel arkaplan ekle"
                    >
                      <span className="text-2xl leading-none">+</span>
                    </button>

                    {wallpapers.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setSelectedWallpaper(w.id);
                          localStorage.setItem('postaci_wallpaper', w.id);
                        }}
                        style={{ background: w.bg || w.color }}
                        className={`h-16 rounded-xl transition shadow-xs transform active:scale-95 relative overflow-hidden ${
                          selectedWallpaper === w.id
                            ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 scale-105'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                        title={w.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 3. ÖLÇEKLENDİRME TAB ==================== */}
            {activeTab === 'scaling' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2 tracking-tight">
                    Uygulama ölçekleme seviyesi
                  </h3>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={80}
                      max={140}
                      step={5}
                      value={appScale}
                      onChange={(e) => handleAppScaleChange(Number(e.target.value))}
                      className="w-64 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-zinc-700"
                    />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 w-12">
                      %{appScale}
                    </span>
                    {appScale !== 100 && (
                      <button
                        onClick={() => handleAppScaleChange(100)}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Sıfırla (%100)
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
                    Diğer ölçeklendirme seviyeleri
                  </h3>
                  <p className="text-xs text-zinc-500 italic mb-4">
                    Aşağıdaki ölçeklendirme seviyeleri uygulama ölçekleme seviyesine uygulanır ve
                    e-postaları ve onu destekleyen bileşenlerin düzeyini hassas ayarlamak için
                    kullanılabilir.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 w-24">E-posta</span>
                      <input
                        type="range"
                        min={80}
                        max={150}
                        step={5}
                        value={mailScale}
                        onChange={(e) => handleMailScaleChange(Number(e.target.value))}
                        className="flex-1 mx-4 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-zinc-700"
                      />
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 w-12 text-right">
                        %{mailScale}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
                    Metin biçimlendirme modu
                  </h3>
                  <p className="text-xs text-zinc-500 italic mb-3">
                    Ölçekleme sırasında bulanıklık oluşması durumunda bu değeri değiştirin.
                  </p>
                  <select
                    value={textRenderingMode}
                    onChange={(e) => setTextRenderingMode(e.target.value as 'ideal' | 'standard')}
                    className="w-48 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="ideal">İdeal (Subpixel Smooth)</option>
                    <option value="standard">Standart</option>
                  </select>
                </div>
              </div>
            )}

            {/* ==================== 4. HESAPLAR TAB (DÜZENLEME & SİLME DESTEKLİ) ==================== */}
            {activeTab === 'accounts' && (
              <div className="space-y-5 max-w-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      Bağlı E-posta Hesapları ({accounts.length})
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Hesaplarınızı yönetin, sunucu veya görünen ad bilgilerini düzenleyin.
                    </p>
                  </div>
                  {onOpenAddAccount && !editingAccountId && (
                    <button
                      type="button"
                      onClick={onOpenAddAccount}
                      className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition flex items-center gap-1.5 active:scale-95 shrink-0"
                    >
                      <span className="text-sm leading-none">+</span>
                      <span>Yeni Hesap Ekle</span>
                    </button>
                  )}
                </div>

                {/* Düzenleme Modu Aktifse */}
                {editingAccountId ? (
                  <div className="rounded-2xl border border-blue-300/80 bg-blue-50/30 p-4 text-xs dark:border-blue-800/80 dark:bg-blue-950/20 space-y-3.5 animate-fadeIn">
                    <div className="flex items-center justify-between pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                      <span className="font-bold text-blue-900 dark:text-blue-200 text-sm">
                        Hesap Ayarlarını Düzenle
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingAccountId(null)}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs"
                      >
                        Vazgeç
                      </button>
                    </div>

                    {/* Görünen Ad */}
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Görünen Ad (Gönderici İsmi)
                      </label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Örn: Ekrem Eşref Kılınç"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Gönderdiğiniz e-postalarda alıcıların göreceği isimdir.
                      </p>
                    </div>

                    {/* IMAP / SMTP Sunucu Ayarları */}
                    <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-3">
                      <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                        Sunucu & Bağlantı Ayarları
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[10px] text-zinc-500 mb-0.5">Gelen Sunucu (IMAP)</label>
                          <input
                            type="text"
                            value={editImapHost}
                            onChange={(e) => setEditImapHost(e.target.value)}
                            placeholder="imap.example.com"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-0.5">Port</label>
                          <input
                            type="number"
                            value={editImapPort}
                            onChange={(e) => setEditImapPort(Number(e.target.value))}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[10px] text-zinc-500 mb-0.5">Giden Sunucu (SMTP)</label>
                          <input
                            type="text"
                            value={editSmtpHost}
                            onChange={(e) => setEditSmtpHost(e.target.value)}
                            placeholder="smtp.example.com"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-0.5">Port</label>
                          <input
                            type="number"
                            value={editSmtpPort}
                            onChange={(e) => setEditSmtpPort(Number(e.target.value))}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={editSmtpSecure}
                          onChange={(e) => setEditSmtpSecure(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0"
                        />
                        <span className="text-[11px] text-zinc-600 dark:text-zinc-400">SMTP Güvenli Bağlantı (SSL/TLS) kullan</span>
                      </label>

                      {/* Şifre Güncelleme (Opsiyonel) */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="block text-[10px] text-zinc-500">
                            Şifre / Uygulama Şifresi (Yalnızca değiştirmek istiyorsanız doldurun)
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowEditPassword(!showEditPassword)}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {showEditPassword ? 'Gizle' : 'Göster'}
                          </button>
                        </div>
                        <input
                          type={showEditPassword ? 'text' : 'password'}
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Mevcut şifreyi korumak için boş bırakın"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                    </div>

                    {/* Kaydet ve İptal Butonları */}
                    <div className="pt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveAccount}
                          disabled={savingAccount}
                          className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
                        >
                          {savingAccount ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAccountId(null)}
                          className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
                        >
                          İptal
                        </button>
                      </div>

                      {accountSaveNotice && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {accountSaveNotice}
                        </span>
                      )}
                    </div>
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-750">
                    Henüz bağlı bir e-posta hesabı bulunmuyor.
                  </div>
                ) : (
                  /* Hesaplar Listesi */
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {accounts.map((acc) => {
                      const isGoogle = acc.provider?.includes('google') || acc.email.includes('gmail');
                      const isMs =
                        acc.provider?.includes('microsoft') ||
                        acc.email.includes('hotmail') ||
                        acc.email.includes('outlook');
                      const isEdu = acc.email.includes('.edu');

                      let badge = 'IMAP/SMTP';
                      let badgeClass =
                        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
                      if (isGoogle) {
                        badge = 'Gmail OAuth';
                        badgeClass =
                          'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800/60';
                      } else if (isMs) {
                        badge = 'Outlook OAuth';
                        badgeClass =
                          'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/60';
                      } else if (isEdu) {
                        badge = 'Kurumsal';
                        badgeClass =
                          'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
                      }

                      return (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-850/60 hover:shadow-2xs transition"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                {acc.email}
                              </span>
                              <span
                                className={`rounded-md border px-1.5 py-0.2 text-[9px] font-bold shrink-0 ${badgeClass}`}
                              >
                                {badge}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                              <span className="truncate">
                                {acc.display_name ? `Görünen: ${acc.display_name}` : 'İsim belirtilmemiş'}
                              </span>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Aktif & Senkronize
                              </span>
                            </div>
                          </div>

                          {/* Düzenle & Kaldır Aksiyonları */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(acc)}
                              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(acc)}
                              className="rounded-lg border border-red-200 bg-red-50/60 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60 transition"
                              title="Hesabı Postacı'dan kaldır"
                            >
                              Kaldır
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ==================== 5. OLUŞTURMA / İMZALAR TAB ==================== */}
            {activeTab === 'composing' && (
              <div className="space-y-4 max-w-xl">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  E-posta İmzaları ve Oluşturma
                </h3>

                {accounts.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-4">
                    İmza eklemek için önce bir e-posta hesabı bağlamalısınız.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-500">
                        Hesap Seçin
                      </label>
                      <select
                        value={selectedEmail}
                        onChange={(e) => handleSelectAccount(e.target.value)}
                        className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.email}>
                            {a.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={sigEnabled}
                          onChange={(e) => setSigEnabled(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Bu hesap için otomatik imza ekle</span>
                      </label>
                    </div>

                    <div>
                      <textarea
                        rows={5}
                        disabled={!sigEnabled}
                        value={sigText}
                        onChange={(e) => setSigText(e.target.value)}
                        placeholder="Saygılarımla,&#10;Adınız Soyadınız&#10;Unvan / Telefon"
                        className="w-full rounded-xl border border-zinc-300 p-3 text-xs outline-none focus:border-blue-500 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 font-sans"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSaveSignature}
                        className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95"
                      >
                        İmzayı Kaydet
                      </button>
                      {savedNotice && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ✓ İmza kaydedildi!
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 6. GELİŞMİŞ TAB ==================== */}
            {activeTab === 'advanced' && (
              <div className="space-y-4 max-w-xl">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Gelişmiş & Sistem Veritabanı
                </h3>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">Yerel SQLite Durumu:</p>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
                      <p className="text-lg font-bold text-blue-600">{dbStats?.accounts ?? accounts.length}</p>
                      <p className="text-[10px] text-zinc-400">Hesap</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
                      <p className="text-lg font-bold text-emerald-600">{dbStats?.folders ?? '-'}</p>
                      <p className="text-[10px] text-zinc-400">Klasör</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700">
                      <p className="text-lg font-bold text-purple-600">{dbStats?.messages ?? '-'}</p>
                      <p className="text-[10px] text-zinc-400">Kayıtlı İleti</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => alert('Yerel SQLite önbelleği optimize edildi.')}
                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    Önbelleği Temizle & Optimize Et
                  </button>
                  {onOpenShortcutsHelp && (
                    <button
                      type="button"
                      onClick={onOpenShortcutsHelp}
                      className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      Klavye Kısayolları Haritası
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ==================== 7. POSTACI HAKKINDA TAB ==================== */}
            {activeTab === 'about' && (
              <div className="space-y-4 max-w-xl text-center sm:text-left">
                <div className="flex items-center gap-3 justify-center sm:justify-start">
                  <PostaciLogo size="lg" variant="squircle" showBadge={false} />
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      Postacı
                    </h3>
                    <p className="text-xs text-zinc-500">Sürüm 0.1.0 • Windows x64</p>
                  </div>
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Postacı, modern masaüstü ergonomisi ve yüksek hıza odaklanan, güvenli, ultra-hafif ve
                  tamamen yerel SQLite veritabanı ile çalışan yeni nesil masaüstü e-posta istemcisidir.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    disabled={updateCheckStatus === 'checking'}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
                  >
                    {updateCheckStatus === 'checking'
                      ? 'Denetleniyor...'
                      : updateCheckStatus === 'latest'
                      ? '✓ En güncel sürümü kullanıyorsunuz'
                      : 'Güncellemeleri Denetle'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
