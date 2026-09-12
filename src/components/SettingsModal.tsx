import { useState, useEffect, useMemo } from 'react';
import type { AccentKey, Account, DateFormatPreference, ListDensity, MarkReadTiming, QuickSnippet, SnippetLines, ThemeKey } from '../types';
import type { LayoutMode } from './LayoutSwitcher';
import { ACCENTS } from '../constants';
import { getAccountSignature, saveAccountSignature } from '../utils/signatures';
import { playNotificationSound } from '../utils/sound';
import { useTranslation } from '../i18n';
import { CloseIcon, SnippetIcon, TrashIcon } from './icons';
import { PostaciLogo } from './PostaciLogo';
import appIcon from '../assets/icon.png';

interface SettingsModalProps {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
  accent: AccentKey;
  setAccent: (a: AccentKey) => void;
  oledMode?: boolean;
  setOledMode?: (v: boolean) => void;
  listDensity?: ListDensity;
  setListDensity?: (d: ListDensity) => void;
  showAvatars?: boolean;
  setShowAvatars?: (v: boolean) => void;
  snippetLines?: SnippetLines;
  setSnippetLines?: (n: SnippetLines) => void;
  dateFormat?: DateFormatPreference;
  setDateFormat?: (f: DateFormatPreference) => void;
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
  oledMode,
  setOledMode,
  listDensity,
  setListDensity,
  showAvatars,
  setShowAvatars,
  snippetLines,
  setSnippetLines,
  dateFormat,
  setDateFormat,
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
  const { language, setLanguage } = useTranslation();
  const handleLayoutMode = onLayoutModeChange || setLayoutMode;
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);

  // 1. Genel: Uygulama Davranışı
  const [launchOnStartup, setLaunchOnStartup] = useState(() => localStorage.getItem('postaci_startup') === 'true');
  const [startMinimized, setStartMinimized] = useState(() => localStorage.getItem('postaci_minimized') === 'true');
  const [hideTaskbarOnMinimize, setHideTaskbarOnMinimize] = useState(() => localStorage.getItem('postaci_hide_taskbar') !== 'false');
  const [closeToQuit, setCloseToQuit] = useState(() => localStorage.getItem('postaci_close_to_quit') === 'true');
  const [useGmailShortcuts, setUseGmailShortcuts] = useState(() => localStorage.getItem('postaci_gmail_shortcuts') !== 'false');

  // Electron IPC üzerinden appSettings yükle
  useEffect(() => {
    if (window.postaci?.appSettings?.get) {
      window.postaci.appSettings.get().then((s) => {
        if (s) {
          if (typeof s.launchOnStartup === 'boolean') setLaunchOnStartup(s.launchOnStartup);
          if (typeof s.startMinimized === 'boolean') setStartMinimized(s.startMinimized);
          if (typeof s.hideTaskbarOnMinimize === 'boolean') setHideTaskbarOnMinimize(s.hideTaskbarOnMinimize);
          if (typeof s.closeToQuit === 'boolean') setCloseToQuit(s.closeToQuit);
          if (typeof s.useGmailShortcuts === 'boolean') setUseGmailShortcuts(s.useGmailShortcuts);
        }
      }).catch(() => {});
    }
  }, []);

  const updateAppBehavior = (updates: Partial<{
    launchOnStartup: boolean;
    startMinimized: boolean;
    hideTaskbarOnMinimize: boolean;
    closeToQuit: boolean;
    useGmailShortcuts: boolean;
  }>) => {
    if (window.postaci?.appSettings?.save) {
      window.postaci.appSettings.save(updates).catch(() => {});
    }
  };

  // Bildirimler
  const [showUnreadBadge, setShowUnreadBadge] = useState(true);
  const [showTaskbarAlert, setShowTaskbarAlert] = useState(true);
  const [showTrackingAlert, setShowTrackingAlert] = useState(true);
  const [soundChoice, setSoundChoice] = useState(() => localStorage.getItem('postaci_sound_choice') || 'chirp');
  const [syncInterval, setSyncInterval] = useState(0.5);
  const [testNotice, setTestNotice] = useState<string | null>(null);

  // 2. Görünüm: Okuma bölmesi & Klasörler
  const [showReadingPane, setShowReadingPane] = useState(true);
  const [showFoldersSeparately, setShowFoldersSeparately] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(() => localStorage.getItem('postaci_wallpaper') || null);
  const [customWallpaperDataUrl, setCustomWallpaperDataUrl] = useState<string | null>(() => localStorage.getItem('postaci_custom_wallpaper') || null);
  // Hesap silme onay modal'ı state'i
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState<Account | null>(null);
  const [deletingAcc, setDeletingAcc] = useState(false);
  const [deleteAccError, setDeleteAccError] = useState<string | null>(null);

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

  // OLED Saf Siyah Modu
  const [localOled, setLocalOled] = useState(() => (oledMode !== undefined ? oledMode : localStorage.getItem('postaci_oled_mode') === 'true'));
  const handleOledToggle = (val: boolean) => {
    setLocalOled(val);
    setOledMode?.(val);
    localStorage.setItem('postaci_oled_mode', String(val));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
    document.documentElement.classList.toggle('oled-black', isDark && val);
  };

  // Liste Yoğunluğu & Görünüm Tercihleri
  const [localDensity, setLocalDensity] = useState<ListDensity>(() => listDensity || (localStorage.getItem('postaci_list_density') as ListDensity) || 'normal');
  const handleDensityChange = (d: ListDensity) => {
    setLocalDensity(d);
    setListDensity?.(d);
    localStorage.setItem('postaci_list_density', d);
  };

  const [localShowAvatars, setLocalShowAvatars] = useState<boolean>(() => showAvatars !== undefined ? showAvatars : localStorage.getItem('postaci_show_avatars') !== 'false');
  const handleShowAvatarsChange = (val: boolean) => {
    setLocalShowAvatars(val);
    setShowAvatars?.(val);
    localStorage.setItem('postaci_show_avatars', String(val));
  };

  const [localSnippetLines, setLocalSnippetLines] = useState<SnippetLines>(() => snippetLines !== undefined ? snippetLines : (Number(localStorage.getItem('postaci_snippet_lines') ?? 1) as SnippetLines));
  const handleSnippetLinesChange = (n: SnippetLines) => {
    setLocalSnippetLines(n);
    setSnippetLines?.(n);
    localStorage.setItem('postaci_snippet_lines', String(n));
  };

  const [localDateFormat, setLocalDateFormat] = useState<DateFormatPreference>(() => dateFormat || (localStorage.getItem('postaci_date_format') as DateFormatPreference) || 'smart');
  const handleDateFormatChange = (f: DateFormatPreference) => {
    setLocalDateFormat(f);
    setDateFormat?.(f);
    localStorage.setItem('postaci_date_format', f);
  };

  // Göndermeyi Geri Alma Penceresi (Undo Send)
  const [localUndoDelay, setLocalUndoDelay] = useState<number>(() => Number(localStorage.getItem('postaci_undo_send_delay') ?? 5));
  const handleUndoDelayChange = (s: number) => {
    setLocalUndoDelay(s);
    localStorage.setItem('postaci_undo_send_delay', String(s));
  };

  // Okundu Olarak İşaretleme Zamanlaması
  const [localMarkReadTiming, setLocalMarkReadTiming] = useState<MarkReadTiming>(() => (localStorage.getItem('postaci_mark_read_timing') as MarkReadTiming) || 'instant');
  const handleMarkReadTimingChange = (t: MarkReadTiming) => {
    setLocalMarkReadTiming(t);
    localStorage.setItem('postaci_mark_read_timing', t);
  };

  // Harici Görsel Kalkanı
  const [localBlockRemote, setLocalBlockRemote] = useState<boolean>(() => localStorage.getItem('postaci_block_remote_images') !== 'false');
  const handleBlockRemoteChange = (val: boolean) => {
    setLocalBlockRemote(val);
    localStorage.setItem('postaci_block_remote_images', String(val));
  };

  // Sessiz Saatler (Quiet Hours)
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');

  useEffect(() => {
    if (window.postaci?.notifications?.getSettings) {
      window.postaci.notifications.getSettings().then((s: any) => {
        if (s) {
          if (typeof s.quietHoursEnabled === 'boolean') setQuietHoursEnabled(s.quietHoursEnabled);
          if (s.quietHoursStart) setQuietHoursStart(s.quietHoursStart);
          if (s.quietHoursEnd) setQuietHoursEnd(s.quietHoursEnd);
          if (typeof s.syncIntervalMinutes === 'number') setSyncInterval(s.syncIntervalMinutes);
          if (s.soundChoice) {
            setSoundChoice(s.soundChoice);
            localStorage.setItem('postaci_sound_choice', s.soundChoice);
          }
        }
      }).catch(() => {});
    }
  }, []);

  const handleSoundChange = (val: string) => {
    setSoundChoice(val);
    localStorage.setItem('postaci_sound_choice', val);
    playNotificationSound(val);
    if (window.postaci?.notifications?.saveSettings) {
      window.postaci.notifications.saveSettings({
        soundEnabled: val !== 'none',
        soundChoice: val,
      }).catch(() => {});
    }
  };

  const handleSyncIntervalChange = (val: number) => {
    setSyncInterval(val);
    if (window.postaci?.notifications?.saveSettings) {
      window.postaci.notifications.saveSettings({
        syncIntervalMinutes: val,
      }).catch(() => {});
    }
  };

  const saveQuietHours = (enabled: boolean, start: string, end: string) => {
    if (window.postaci?.notifications?.saveSettings) {
      window.postaci.notifications.saveSettings({
        quietHoursEnabled: enabled,
        quietHoursStart: start,
        quietHoursEnd: end,
      }).catch(() => {});
    }
  };

  const handleQuietHoursToggle = (val: boolean) => {
    setQuietHoursEnabled(val);
    saveQuietHours(val, quietHoursStart, quietHoursEnd);
  };

  const handleQuietHoursTimeChange = (type: 'start' | 'end', val: string) => {
    if (type === 'start') {
      setQuietHoursStart(val);
      saveQuietHours(quietHoursEnabled, val, quietHoursEnd);
    } else {
      setQuietHoursEnd(val);
      saveQuietHours(quietHoursEnabled, quietHoursStart, val);
    }
  };

  // Hızlı Yanıt Şablonları (Quick Snippets) Yönetimi
  const [quickSnippets, setQuickSnippets] = useState<QuickSnippet[]>(() => {
    try {
      const saved = localStorage.getItem('postaci_quick_snippets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: '1', title: 'Teşekkür ve Onay', body: 'E-postanız için teşekkür ederim, iletilen detayları inceledim ve onaylıyorum.' },
      { id: '2', title: 'Toplantı Talebi', body: 'Merhaba,\n\nKonuyu detaylandırmak adına uygun bir zamanınızda kısa bir toplantı gerçekleştirebilir miyiz?\n\nİyi çalışmalar.' },
      { id: '3', title: 'Bilgi ve İnceleme', body: 'İlettiğiniz dökümanları ve detayları inceleyip en kısa sürede geri dönüş sağlayacağım.' },
    ];
  });
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetBody, setSnippetBody] = useState('');
  const [snippetNotice, setSnippetNotice] = useState<string | null>(null);

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snippetTitle.trim() || !snippetBody.trim()) return;
    const newSnip: QuickSnippet = {
      id: Date.now().toString(),
      title: snippetTitle.trim(),
      body: snippetBody.trim(),
    };
    const updated = [...quickSnippets, newSnip];
    setQuickSnippets(updated);
    localStorage.setItem('postaci_quick_snippets', JSON.stringify(updated));
    setSnippetTitle('');
    setSnippetBody('');
    setSnippetNotice('✓ Şablon kaydedildi!');
    setTimeout(() => setSnippetNotice(null), 2500);
  };

  const handleDeleteSnippet = (id: string) => {
    const updated = quickSnippets.filter((s) => s.id !== id);
    setQuickSnippets(updated);
    localStorage.setItem('postaci_quick_snippets', JSON.stringify(updated));
  };

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
  // Bağlantı Testi State'i
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    imap: { ok: boolean; error?: string } | null;
    smtp: { ok: boolean; error?: string; note?: string } | null;
  } | null>(null);

  // 5. İmzalar (Oluşturma)
  const [selectedEmail, setSelectedEmail] = useState(activeAccount || accounts[0]?.email || '');
  const [sigEnabled, setSigEnabled] = useState(() => getAccountSignature(selectedEmail).enabled);
  const [sigText, setSigText] = useState(() => getAccountSignature(selectedEmail).text);
  const [savedNotice, setSavedNotice] = useState(false);

  // 6. İstatistikler (Gelişmiş)
  const [dbStats, setDbStats] = useState<{ accounts: number; folders: number; messages: number } | null>(null);
  const [systemInfo, setSystemInfo] = useState<{
    ram: { heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number };
    db: { sizeBytes: number; sizeMB: number; path: string | null };
    versions: { electron: string; node: string; chrome: string; v8: string };
  } | null>(null);
  const [vacuumStatus, setVacuumStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const loadSystemInfo = () => {
    if (window.postaci?.db?.stats) {
      window.postaci.db.stats().then(setDbStats).catch(() => {});
    }
    if (window.postaci?.db?.systemInfo) {
      window.postaci.db.systemInfo().then(setSystemInfo).catch(() => {});
    }
  };

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const handleVacuum = async () => {
    if (!window.postaci?.db?.vacuum) return;
    setVacuumStatus('running');
    try {
      await window.postaci.db.vacuum();
      setVacuumStatus('done');
      // Boyutu yenile
      loadSystemInfo();
      setTimeout(() => setVacuumStatus('idle'), 3000);
    } catch {
      setVacuumStatus('error');
      setTimeout(() => setVacuumStatus('idle'), 3000);
    }
  };

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
    playNotificationSound(soundChoice);
    try {
      await window.postaci.notifications.test();
      setTestNotice('✓ Test bildirimi gönderildi!');
      setTimeout(() => setTestNotice(null), 3000);
    } catch {
      setTestNotice('✕ Bildirim gönderilemedi.');
      setTimeout(() => setTestNotice(null), 3000);
    }
  };

  const currentVersion = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '') || window.postaci?.version || '1.0.22';
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [latestReleaseInfo, setLatestReleaseInfo] = useState<{
    version?: string;
    hasUpdate?: boolean;
    url?: string;
  } | null>(null);

  const openUrl = (url: string) => {
    if (window.postaci?.openExternal) {
      window.postaci.openExternal(url).catch(() => window.open(url, '_blank'));
    } else {
      window.open(url, '_blank');
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateCheckStatus('checking');
    try {
      const res = await fetch('https://api.github.com/repos/eekilinc/Postaci/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const tag = (data.tag_name || '').replace(/^v/, '');
        const hasUpdate = Boolean(tag && tag !== currentVersion);
        setLatestReleaseInfo({
          version: tag,
          hasUpdate,
          url: data.html_url || 'https://github.com/eekilinc/Postaci/releases/latest',
        });
        setUpdateCheckStatus(hasUpdate ? 'available' : 'latest');
      } else {
        setTimeout(() => setUpdateCheckStatus('latest'), 600);
      }
    } catch {
      setTimeout(() => setUpdateCheckStatus('latest'), 600);
    }
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
    setConnectionTestResult(null);
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

  // Bağlantı Testi
  const handleTestConnection = async () => {
    if (!editingAccountId || !window.postaci?.accounts?.testConnection) return;
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await window.postaci.accounts.testConnection(editingAccountId);
      setConnectionTestResult(result);
    } catch (err) {
      setConnectionTestResult({
        imap: { ok: false, error: err instanceof Error ? err.message : String(err) },
        smtp: null,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Hesap Kaldır — inline onay modal
  const handleDeleteAccount = (acc: Account) => {
    setConfirmDeleteAcc(acc);
    setDeleteAccError(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteAcc || !window.postaci?.accounts?.delete) return;
    setDeletingAcc(true);
    setDeleteAccError(null);
    try {
      await window.postaci.accounts.delete(confirmDeleteAcc.id);
      onRefreshAccounts?.();
      if (editingAccountId === confirmDeleteAcc.id) setEditingAccountId(null);
      setConfirmDeleteAcc(null);
    } catch (err) {
      setDeleteAccError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingAcc(false);
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
    { id: 'general', label: language === 'en' ? 'General' : 'Genel' },
    { id: 'appearance', label: language === 'en' ? 'Appearance' : 'Görünüm' },
    { id: 'scaling', label: language === 'en' ? 'Scaling & Zoom' : 'Ölçeklendirme' },
    { id: 'accounts', label: language === 'en' ? 'Accounts' : 'Hesaplar' },
    { id: 'composing', label: language === 'en' ? 'Composing' : 'Oluşturma' },
    { id: 'advanced', label: language === 'en' ? 'Advanced' : 'Gelişmiş' },
    { id: 'about', label: language === 'en' ? 'About Postacı' : 'Postacı Hakkında' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-fadeIn select-none p-4"
      onClick={onClose}
    >
      {/* Hesap Silme Onay Modal'ı */}
      {confirmDeleteAcc && (
        <div
          className="absolute z-60 inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <span className="text-red-600 dark:text-red-400 text-lg">⚠</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Hesabı Kaldır</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{confirmDeleteAcc.email}</span> hesabı Postacı'dan kaldırılacak. Yerel iletiler silinir, sunucudaki e-postalarınız etkilenmez.
                </p>
                {deleteAccError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">{deleteAccError}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setConfirmDeleteAcc(null); setDeleteAccError(null); }}
                disabled={deletingAcc}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingAcc}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {deletingAcc ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /><span>Kaldırılıyor...</span></>
                ) : 'Hesabı Kaldır'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mailbird 3.0 İki Bölmeli Geniş Ayarlar Penceresi */}
      <div
        className="flex h-[620px] min-h-[480px] max-h-[92vh] w-[780px] max-w-[95vw] rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Sol Sütun: Mailbird Kraliyet Mavisi / Dikey Menü Rayı */}
        <div className="w-48 sm:w-52 shrink-0 bg-[#2b56bf] py-4 flex flex-col justify-between select-none shadow-inner">
          <nav className="flex-1 min-h-0 space-y-1 px-2.5 overflow-y-auto pr-1 no-scrollbar">
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
          <div className="px-5 pt-3 border-t border-white/10 flex items-center gap-2 shrink-0">
            <PostaciLogo size="xs" variant="squircle" showBadge={false} />
            <span className="text-[11px] font-semibold text-white/90">Postacı v{currentVersion}</span>
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
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
            {/* ==================== 1. GENEL TAB ==================== */}
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-xl">
                {/* Uygulama Davranışı */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    {language === 'en' ? 'Application behavior' : 'Uygulama davranışı'}
                  </h3>
                  <div className="space-y-3 text-xs sm:text-[13px]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={launchOnStartup}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setLaunchOnStartup(val);
                          localStorage.setItem('postaci_startup', String(val));
                          updateAppBehavior({ launchOnStartup: val });
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Launch at Windows startup' : 'Windows başlangıcında açılsın'}</span>
                    </label>

                    <label className="flex items-start gap-2.5 ml-6 cursor-pointer opacity-90">
                      <input
                        type="checkbox"
                        checked={startMinimized}
                        disabled={!launchOnStartup}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setStartMinimized(val);
                          localStorage.setItem('postaci_minimized', String(val));
                          updateAppBehavior({ startMinimized: val });
                        }}
                        className="h-4 w-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer disabled:opacity-40"
                      />
                      <div className="flex flex-col">
                        <span className={!launchOnStartup ? 'text-zinc-400' : ''}>
                          {language === 'en' ? 'Start minimized in background silently' : 'Başlangıçta simge durumunda açılsın (arka planda sessizce başlar)'}
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {language === 'en' ? 'When enabled, main window will not pop up on Windows startup, waits in system tray.' : 'Açık olduğunda Windows açılırken ana pencere ekrana gelmez, sistem tepsisinde (saat yanında) hazır bekler.'}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideTaskbarOnMinimize}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setHideTaskbarOnMinimize(val);
                          localStorage.setItem('postaci_hide_taskbar', String(val));
                          updateAppBehavior({ hideTaskbarOnMinimize: val });
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Hide from taskbar when minimized (system tray only)' : 'Simge durumunda iken görev çubuğu simgesi gizlensin (yalnızca sistem tepsisinde kalsın)'}</span>
                    </label>

                    <div>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={closeToQuit}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setCloseToQuit(val);
                            localStorage.setItem('postaci_close_to_quit', String(val));
                            updateAppBehavior({ closeToQuit: val });
                          }}
                          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>{language === 'en' ? 'Exit application completely when clicking close (✕)' : 'Çıkma tuşuna (✕) basıldığında uygulamadan tamamen çıkılsın'}</span>
                      </label>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-6.5 mt-0.5 leading-relaxed">
                        {language === 'en' ? 'If unchecked (recommended), clicking close keeps Postacı running in background/tray.' : 'İşaretli değilse (önerilen), çıkma tuşuna basıldığında Postacı arka planda ve sistem tepsisinde çalışmaya devam eder.'}
                      </p>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useGmailShortcuts}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setUseGmailShortcuts(val);
                          localStorage.setItem('postaci_gmail_shortcuts', String(val));
                          updateAppBehavior({ useGmailShortcuts: val });
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Enable Gmail keyboard shortcuts (C, R, A, E, # etc.)' : 'Gmail klavye kısayollarını kullan (C, R, A, E, # vb.)'}</span>
                    </label>
                  </div>
                </div>

                {/* Bildirimler */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    {language === 'en' ? 'Notifications' : 'Bildirimler'}
                  </h3>
                  <div className="space-y-2.5 text-xs sm:text-[13px]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUnreadBadge}
                        onChange={(e) => setShowUnreadBadge(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Show unread count badge in taskbar and tray' : 'Okunmamış ileti sayısı görev çubuğu & bildirim alanında gösterilsin'}</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTaskbarAlert}
                        onChange={(e) => setShowTaskbarAlert(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Flash taskbar when new email arrives' : 'İleti geldiğinde görev çubuğunda uyarı gösterilsin'}</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTrackingAlert}
                        onChange={(e) => setShowTrackingAlert(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span>{language === 'en' ? 'Show notification when tracked email is opened' : 'E-posta İzlemesi olan bir ileti açıldığında bildirim alanında göster'}</span>
                    </label>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{language === 'en' ? 'New email sound:' : 'Yeni ileti sesi:'}</span>
                      <select
                        value={soundChoice}
                        onChange={(e) => handleSoundChange(e.target.value)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value="chirp">{language === 'en' ? 'Default (Chirp)' : 'Varsayılan (Chirp)'}</option>
                        <option value="ding">{language === 'en' ? 'Ding (Classic)' : 'Ding (Klasik)'}</option>
                        <option value="bell">{language === 'en' ? 'Bell' : 'Çan'}</option>
                        <option value="none">{language === 'en' ? 'Mute' : 'Sessiz'}</option>
                      </select>
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{language === 'en' ? 'Sync check frequency:' : 'E-posta denetleme sıklığı:'}</span>
                      <select
                        value={syncInterval}
                        onChange={(e) => handleSyncIntervalChange(Number(e.target.value))}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value={0.5}>{language === 'en' ? 'Every 30 seconds (Ultra fast - Recommended)' : 'Her 30 saniyede bir (Yıldırım Hızı - Önerilen)'}</option>
                        <option value={1}>{language === 'en' ? 'Every 1 minute (Fast)' : 'Her 1 dakikada bir (Hızlı)'}</option>
                        <option value={2}>{language === 'en' ? 'Every 2 minutes' : 'Her 2 dakikada bir'}</option>
                        <option value={3}>{language === 'en' ? 'Every 3 minutes' : 'Her 3 dakikada bir'}</option>
                        <option value={5}>{language === 'en' ? 'Every 5 minutes' : 'Her 5 dakikada bir'}</option>
                        <option value={10}>{language === 'en' ? 'Every 10 minutes' : 'Her 10 dakikada bir'}</option>
                      </select>
                    </div>

                    <div className="pt-2 pb-1">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleTestNotification}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                        >
                          {language === 'en' ? 'Send Test Notification' : 'Test Bildirimi Gönder'}
                        </button>
                        {testNotice && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {testNotice}
                          </span>
                        )}
                      </div>

                      {/* Windows Bildirim İpucu & Doğrudan Ayar Butonu */}
                      <div className="mt-2.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                        <p>
                          <span className="font-semibold">💡 Windows Bildirim İpucu:</span> Windows 10/11'de saat 23:00 - 07:00 arasında veya tam ekran modundayken <span className="font-semibold">Odaklanma Yardımı (Rahatsız Etmeyin)</span> otomatik açılabilir. Bu modda Windows, bildirim pencerelerini masaüstüne çıkarmak yerine sağ alttaki Windows Bildirim Merkezi'ne (<kbd className="rounded bg-blue-100 dark:bg-blue-900 px-1 py-0.5 font-mono text-[10px]">Win + N</kbd>) sessizce depolar.
                        </p>
                        {window.postaci?.openExternal && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => window.postaci?.openExternal?.('ms-settings:notifications')}
                              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                            >
                              ⚙ Windows Sistem Bildirim Ayarlarını Aç ↗
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sessiz Saatler / Rahatsız Etmeyin */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quietHoursEnabled}
                          onChange={(e) => handleQuietHoursToggle(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Sessiz Saatler / Rahatsız Etmeyin (Quiet Hours)
                        </span>
                      </label>
                      <p className="text-[11px] text-zinc-500 pl-6.5">
                        Belirtilen zaman aralığında gelen yeni e-postalarda Windows masaüstü bildirimi ve sesleri otomatik susturulur.
                      </p>
                      {quietHoursEnabled && (
                        <div className="flex items-center gap-4 pl-6.5 pt-1 animate-fadeIn">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">Başlangıç:</span>
                            <input
                              type="time"
                              value={quietHoursStart}
                              onChange={(e) => handleQuietHoursTimeChange('start', e.target.value)}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">Bitiş:</span>
                            <input
                              type="time"
                              value={quietHoursEnd}
                              onChange={(e) => handleQuietHoursTimeChange('end', e.target.value)}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dil */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
                    {language === 'en' ? 'Language' : 'Dil'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2.5">
                    {language === 'en' ? 'Choose application interface language' : 'Uygulama arayüz dilini seçin'}
                  </p>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'tr' | 'en')}
                    className="w-52 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="tr">Türkçe (Turkish)</option>
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
                      onClick={async () => {
                        if (!window.postaci?.openFileDialog) return;
                        const dataUrl = await window.postaci.openFileDialog({
                          title: 'Özel Arkaplan Resmi Seç',
                          filters: [{ name: 'Resim', extensions: ['jpg','jpeg','png','webp','gif','bmp'] }],
                        });
                        if (dataUrl) {
                          setCustomWallpaperDataUrl(dataUrl);
                          localStorage.setItem('postaci_custom_wallpaper', dataUrl);
                          setSelectedWallpaper('custom');
                          localStorage.setItem('postaci_wallpaper', 'custom');
                          window.dispatchEvent(new CustomEvent('postaci:wallpaper', { detail: { id: 'custom', dataUrl } }));
                        }
                      }}
                      className="h-16 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 flex items-center justify-center text-zinc-400 hover:text-blue-500 transition relative group"
                      title="Özel arkaplan ekle"
                    >
                      <span className="text-2xl leading-none">+</span>
                      {customWallpaperDataUrl && (
                        <span className="absolute inset-0 rounded-xl overflow-hidden opacity-60">
                          <img src={customWallpaperDataUrl} className="w-full h-full object-cover" alt="" />
                        </span>
                      )}
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

                {/* OLED Saf Siyah (True Black) Modu */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localOled}
                      onChange={(e) => handleOledToggle(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      OLED Saf Siyah (True Black) Modu
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-500 pl-6.5 mt-0.5">
                    Koyu temada arka planı tam #000000 yaparak OLED/AMOLED ekranlarda maksimum kontrast ve enerji tasarrufu sağlar.
                  </p>
                </div>

                {/* İleti Listesi Yoğunluğu ve Detayları */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                      İleti Listesi Yoğunluğu
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'compact', label: 'Kompakt', desc: 'Dar satırlar, çok ileti' },
                        { id: 'normal', label: 'Normal', desc: 'Dengeli satır aralığı' },
                        { id: 'relaxed', label: 'Rahat', desc: 'Geniş ve ferah görünüm' },
                      ].map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleDensityChange(d.id as ListDensity)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            localDensity === d.id
                              ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500'
                              : 'border-zinc-200 dark:border-zinc-750 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{d.label}</div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">{d.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Snippet Satır Sayısı */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Özet (Snippet) Satır Sayısı
                      </label>
                      <select
                        value={localSnippetLines}
                        onChange={(e) => handleSnippetLinesChange(Number(e.target.value) as SnippetLines)}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value={0}>Yalnızca Konu (0 satır)</option>
                        <option value={1}>Tek Satır Akıcı (1 satır)</option>
                        <option value={2}>Detaylı Özet (2 satır)</option>
                      </select>
                    </div>

                    {/* Tarih Formatı */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Tarih Gösterim Formatı
                      </label>
                      <select
                        value={localDateFormat}
                        onChange={(e) => handleDateFormatChange(e.target.value as DateFormatPreference)}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value="smart">Akıllı (Bugün saat, eski gün/ay)</option>
                        <option value="relative">Göreceli (2 saat önce, Dün)</option>
                        <option value="absolute">Tam Tarih (11.09.2026 14:30)</option>
                      </select>
                    </div>
                  </div>

                  {/* Avatarları Göster */}
                  <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={localShowAvatars}
                      onChange={(e) => handleShowAvatarsChange(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      İleti listesinde kişi avatarlarını göster (Gizlendiğinde liste daha hızlı kaydırılır)
                    </span>
                  </label>
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

                    {/* Bağlantı Testi */}
                    <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={testingConnection || savingAccount}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95 disabled:opacity-50"
                        >
                          {testingConnection ? (
                            <>
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                              <span>Test ediliyor...</span>
                            </>
                          ) : (
                            <>
                              <span>🔌</span>
                              <span>Bağlantıyı Test Et</span>
                            </>
                          )}
                        </button>

                        {connectionTestResult && (
                          <div className="flex items-center gap-2 text-[11px] flex-wrap">
                            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold border ${
                              connectionTestResult.imap?.ok
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60'
                            }`}>
                              {connectionTestResult.imap?.ok ? '✓ IMAP' : '✕ IMAP'}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold border ${
                              connectionTestResult.smtp?.ok
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                : connectionTestResult.smtp === null
                                ? 'bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60'
                            }`}>
                              {connectionTestResult.smtp?.ok ? '✓ SMTP' : connectionTestResult.smtp === null ? '– SMTP' : '✕ SMTP'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Hata Detayları */}
                      {connectionTestResult && (
                        <div className="mt-2 space-y-1">
                          {connectionTestResult.imap && !connectionTestResult.imap.ok && connectionTestResult.imap.error && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                              <span className="font-semibold">IMAP:</span> {connectionTestResult.imap.error}
                            </p>
                          )}
                          {connectionTestResult.smtp && !connectionTestResult.smtp.ok && connectionTestResult.smtp.error && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                              <span className="font-semibold">SMTP:</span> {connectionTestResult.smtp.error}
                            </p>
                          )}
                          {connectionTestResult.smtp?.ok && connectionTestResult.smtp.note && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{connectionTestResult.smtp.note}</p>
                          )}
                        </div>
                      )}
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
                        className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 cursor-pointer"
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

                {/* Göndermeyi Geri Alma Süresi (Undo Send) */}
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Göndermeyi Geri Alma Penceresi (Undo Send)
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    E-posta gönderdikten sonra gönderimi iptal etmek için verilen bekleme süresidir.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <select
                      value={localUndoDelay}
                      onChange={(e) => handleUndoDelayChange(Number(e.target.value))}
                      className="w-48 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <option value={0}>Devre Dışı (Anında Gönder)</option>
                      <option value={5}>5 Saniye (Standart)</option>
                      <option value={10}>10 Saniye</option>
                      <option value={20}>20 Saniye</option>
                      <option value={30}>30 Saniye (Maksimum)</option>
                    </select>
                    <span className="text-xs text-zinc-400">
                      {localUndoDelay === 0 ? 'İletiler beklemeden derhal iletilir' : `${localUndoDelay} saniye boyunca geri al düğmesi aktif kalır`}
                    </span>
                  </div>
                </div>

                {/* Hızlı Yanıt Şablonları (Quick Snippets) */}
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <SnippetIcon size={14} className="text-blue-600 dark:text-blue-400" />
                        <span>Hızlı Yanıt Şablonları (Hazır Metinler)</span>
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        E-posta yazarken araç çubuğundaki şablonlar simgesinden tek tıkla eklenecek hazır yanıtlar.
                      </p>
                    </div>
                  </div>

                  {/* Yeni Şablon Ekleme Formu */}
                  <form onSubmit={handleAddSnippet} className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-3 space-y-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">Yeni Şablon Ekle</span>
                      {snippetNotice && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {snippetNotice}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Şablon Başlığı (Örn: Fatura Talebi, Onay)"
                      value={snippetTitle}
                      onChange={(e) => setSnippetTitle(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <textarea
                      rows={3}
                      placeholder="Şablon metni içeriği..."
                      value={snippetBody}
                      onChange={(e) => setSnippetBody(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!snippetTitle.trim() || !snippetBody.trim()}
                        className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
                      >
                        + Şablonu Kaydet
                      </button>
                    </div>
                  </form>

                  {/* Kayıtlı Şablonlar Listesi */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {quickSnippets.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic py-2">Henüz kayıtlı bir şablon bulunmuyor.</p>
                    ) : (
                      quickSnippets.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-start justify-between rounded-xl border border-zinc-200/80 bg-white p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/80 hover:border-zinc-300 transition"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 block truncate">
                              {s.title}
                            </span>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 whitespace-pre-wrap">
                              {s.body}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSnippet(s.id)}
                            className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 cursor-pointer"
                            title="Şablonu Sil"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 6. GELİŞMİŞ TAB ==================== */}
            {activeTab === 'advanced' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    Gelişmiş Ayarlar ve Gizlilik
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Okuma zamanlaması, harici görsel gizlilik kalkanı ve yerel veritabanı yönetimi.
                  </p>
                </div>

                {/* Okundu Olarak İşaretleme Zamanlaması */}
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Okundu Olarak İşaretleme Zamanlaması
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Bir ileti seçildiğinde ne zaman okundu olarak işaretleneceğini belirleyin.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {[
                      { id: 'instant', label: 'Anında', desc: 'İleti tıklandığı anda' },
                      { id: 'delay_3s', label: '3 Saniye Sonra', desc: 'İletide 3 sn kalındığında' },
                      { id: 'delay_5s', label: '5 Saniye Sonra', desc: 'İletide 5 sn kalındığında' },
                      { id: 'manual', label: 'Manuel', desc: 'Sadece düğmeye basıldığında' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleMarkReadTimingChange(m.id as MarkReadTiming)}
                        className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                          localMarkReadTiming === m.id
                            ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500'
                            : 'border-zinc-200 dark:border-zinc-750 hover:bg-white dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{m.label}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Harici Görsel Gizlilik Kalkanı */}
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localBlockRemote}
                      onChange={(e) => handleBlockRemoteChange(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Harici Görselleri ve İzleme Piksellerini Otomatik Engelle
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-500 pl-6.5 leading-relaxed">
                    E-postalardaki harici web bağlantılı görselleri varsayılan olarak engeller. Bu sayede gönderenlerin IP adresinizi, konumunuzu veya e-postayı açtığınız saati izlemesini önler. İstediğinizde ileti bölmesinden görsellere izin verebilirsiniz.
                  </p>
                </div>

                {/* SQLite Durumu + RAM + Boyut */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">Yerel SQLite Durumu:</p>
                    <button
                      type="button"
                      onClick={loadSystemInfo}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Yenile
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
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

                  {/* DB Boyutu */}
                  {systemInfo && (
                    <div className="flex items-center justify-between rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 px-3 py-2">
                      <span className="text-zinc-500">DB Dosya Boyutu</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {systemInfo.db.sizeMB < 1
                          ? `${Math.round(systemInfo.db.sizeBytes / 1024)} KB`
                          : `${systemInfo.db.sizeMB} MB`}
                      </span>
                    </div>
                  )}
                </div>

                {/* RAM Kullanımı */}
                {systemInfo && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">Bellek Kullanımı (Ana Süreç):</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
                        <span className="text-zinc-500">RSS (Toplam)</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">{systemInfo.ram.rssMB} MB</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
                        <span className="text-zinc-500">Heap Kullanılan</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{systemInfo.ram.heapUsedMB} MB</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
                        <span className="text-zinc-500">Heap Toplam</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{systemInfo.ram.heapTotalMB} MB</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 p-2 flex justify-between items-center">
                        <span className="text-zinc-500">Harici</span>
                        <span className="font-bold text-zinc-600 dark:text-zinc-400">{systemInfo.ram.externalMB} MB</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-1 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleVacuum}
                    disabled={vacuumStatus === 'running'}
                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {vacuumStatus === 'running' ? (
                      <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" /><span>Optimize ediliyor...</span></>
                    ) : vacuumStatus === 'done' ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ Optimize edildi!</span>
                    ) : vacuumStatus === 'error' ? (
                      <span className="text-red-600">✕ Hata oluştu</span>
                    ) : (
                      <span>Veritabanını Optimize Et (VACUUM)</span>
                    )}
                  </button>
                  {onOpenShortcutsHelp && (
                    <button
                      type="button"
                      onClick={onOpenShortcutsHelp}
                      className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      Klavye Kısayolları Haritası
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ==================== 7. POSTACI HAKKINDA TAB ==================== */}
            {activeTab === 'about' && (
              <div className="space-y-3.5 max-w-xl text-left">
                {/* Premium Başlık ve Logo Kartı */}
                <div className="relative overflow-hidden flex items-center gap-4 p-3.5 rounded-2xl bg-gradient-to-br from-blue-600/10 via-indigo-500/5 to-purple-600/10 border border-blue-500/20 shadow-xs dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-purple-950/30 dark:border-blue-800/40">
                  <div className="relative shrink-0 flex items-center justify-center">
                    {!logoLoadError ? (
                      <img
                        src={appIcon}
                        alt="Postacı Logo"
                        className="h-16 w-16 rounded-2xl shadow-md border border-white/60 dark:border-zinc-700/60 object-contain p-1 bg-white dark:bg-zinc-800"
                        onError={() => setLogoLoadError(true)}
                      />
                    ) : (
                      <PostaciLogo size="xl" variant="squircle" showBadge={false} />
                    )}
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs" title="Stabil ve Güvenli Sürüm">
                      ✓
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
                        Postacı
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-mono font-bold text-white shadow-2xs">
                        v{currentVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
                      Yıldırım hızında, güvenli, modern ve şık masaüstü e-posta istemcisi.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Windows x64
                      </span>
                      <span>•</span>
                      <span>Yerel SQLite</span>
                      <span>•</span>
                      <span>Donanım Korumalı DPAPI</span>
                    </div>
                  </div>
                </div>

                {/* Güncelleme Durum ve Denetleyici Kartı */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-850/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <span>Yazılım Güncellemeleri</span>
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {updateCheckStatus === 'available' && latestReleaseInfo?.version
                          ? `Yeni sürüm mevcut: v${latestReleaseInfo.version}`
                          : updateCheckStatus === 'latest'
                          ? `Tebrikler, en güncel sürümü kullanıyorsunuz (v${currentVersion}).`
                          : 'Resmi GitHub sürümlerini kontrol edin.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCheckUpdate}
                        disabled={updateCheckStatus === 'checking'}
                        className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {updateCheckStatus === 'checking' ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Denetleniyor...</span>
                          </>
                        ) : (
                          <span>Güncellemeleri Denetle</span>
                        )}
                      </button>
                      {updateCheckStatus === 'available' && latestReleaseInfo?.url && (
                        <button
                          type="button"
                          onClick={() => openUrl(latestReleaseInfo.url!)}
                          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 inline-flex items-center gap-1"
                        >
                          <span>v{latestReleaseInfo.version} İndir</span>
                          <span>↗</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* GitHub Proje Kartı */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-850/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs">
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <span>eekilinc / Postaci</span>
                          <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">Açık Kaynak</span>
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Resmi GitHub deposu, kaynak kodlar ve katkı yönergeleri.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* GitHub Hızlı Butonlar */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => openUrl('https://github.com/eekilinc/Postaci')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 transition dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 active:scale-95"
                    >
                      <span>GitHub'da Görüntüle</span>
                      <span className="text-xs">↗</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openUrl('https://github.com/eekilinc/Postaci/releases')}
                      className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95"
                    >
                      <span>Sürümler (Releases)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openUrl('https://github.com/eekilinc/Postaci/issues')}
                      className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition active:scale-95"
                    >
                      <span>Hata / İstek Bildir</span>
                    </button>
                  </div>
                </div>

                {/* Mimari ve Güvenlik Avantajları */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>⚡</span> <span>Çevrimdışı & Yerel SQLite</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      İnternet bağlantınız kopsa bile gelen kutunuzda sıfır gecikmeyle anında arama yapabilirsiniz.
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-850/40">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>🔒</span> <span>Donanım Şifreleme</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Hesap şifreleriniz ve OAuth tokenlarınız Windows DPAPI ile yerel olarak şifrelenir.
                    </p>
                  </div>
                </div>

                {/* Sistem Versiyonları */}
                {systemInfo && (
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-850/40 space-y-2">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">Çalışma Ortamı Versiyonları:</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Electron', value: systemInfo.versions.electron },
                        { label: 'Node.js', value: systemInfo.versions.node },
                        { label: 'Chromium', value: systemInfo.versions.chrome },
                        { label: 'V8', value: systemInfo.versions.v8 },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700 px-2.5 py-1.5">
                          <span className="text-zinc-500">{label}</span>
                          <span className="font-mono font-semibold text-[11px] text-zinc-700 dark:text-zinc-300">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Geliştirici & Lisans */}
                <div className="rounded-xl bg-zinc-50/60 dark:bg-zinc-850/30 p-3 text-xs border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">Geliştirici: </span>
                    <span className="text-zinc-600 dark:text-zinc-400">Ekrem Eşref Kılınç</span>
                    <span className="mx-1 text-zinc-400">•</span>
                    <span className="text-zinc-500">MIT Lisansı</span>
                  </div>
                  <a
                    href="mailto:ekilinc@mehmetakif.edu.tr"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    İletişim
                  </a>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
