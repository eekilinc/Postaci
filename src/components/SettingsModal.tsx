import { useState, useEffect, useMemo } from 'react';
import type { AccentKey, Account, DateFormatPreference, ListDensity, MarkReadTiming, QuickSnippet, SnippetLines, ThemeKey } from '../types';
import type { LayoutMode } from './LayoutSwitcher';
import { getAccountSignature, saveAccountSignature } from '../utils/signatures';
import { playNotificationSound } from '../utils/sound';
import { useTranslation } from '../i18n';
import { useUpdaterStatus } from '../hooks/useUpdaterStatus';
import { CloseIcon } from './icons';
import { PostaciLogo } from './PostaciLogo';
import { buildNavTabs, type SettingsTab } from './settingsTabs';
import { AboutTab } from './settings/AboutTab';
import { ScalingTab } from './settings/ScalingTab';
import { AdvancedTab } from './settings/AdvancedTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { GeneralTab } from './settings/GeneralTab';
import { AccountsTab } from './settings/AccountsTab';
import { ComposingTab } from './settings/ComposingTab';

/** Sürüm okunamadığında kullanılan değer — karşılaştırmalarda geçerli sürüm sayılır. */
const UNKNOWN_VERSION = '—';

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

export type { SettingsTab } from './settingsTabs';

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
  const { language } = useTranslation();
  // setLayoutMode props'ta opsiyonel olabilir; çağıran her yerde tanımlı.
  const handleLayoutMode = onLayoutModeChange || setLayoutMode || (() => {});
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);
  const updaterStatus = useUpdaterStatus();
  const handleUpdaterRestart = () => {
    window.postaci?.updater?.quitInstall().catch(() => {});
  };

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
  const [showInAppAlerts, setShowInAppAlerts] = useState<boolean>(
    () => localStorage.getItem('postaci_show_in_app_alerts') !== 'false',
  );
  const [soundChoice, setSoundChoice] = useState(() => localStorage.getItem('postaci_sound_choice') || 'chirp');
  const [syncInterval, setSyncInterval] = useState(2);
  const [testNotice, setTestNotice] = useState<string | null>(null);

  const handleToggleInAppAlerts = (checked: boolean) => {
    setShowInAppAlerts(checked);
    localStorage.setItem('postaci_show_in_app_alerts', String(checked));
  };

  // 2. Görünüm: Okuma bölmesi & Klasörler
  const [showReadingPane, setShowReadingPane] = useState(true);
  const [showFoldersSeparately, setShowFoldersSeparately] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(() => localStorage.getItem('postaci_wallpaper') || null);
  const [customWallpaperDataUrl, setCustomWallpaperDataUrl] = useState<string | null>(() => localStorage.getItem('postaci_custom_wallpaper') || null);
  // Hesap silme onay modal'ı state'i
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState<Account | null>(null);
  const [deletingAcc, setDeletingAcc] = useState(false);
  const [deleteAccError, setDeleteAccError] = useState<string | null>(null);
  // Hesap tanısı (salt-okunur mail:diagnose) state'i — hesap ekleme akışına dokunmaz
  const [diagnosingEmail, setDiagnosingEmail] = useState<string | null>(null);
  const [diagnoseResults, setDiagnoseResults] = useState<Record<string, { ok: boolean; steps: { key: string; ok: boolean; detail: string }[]; hint: string }>>({});

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
  const [sigIsHtml, setSigIsHtml] = useState(() => getAccountSignature(selectedEmail).isHtml ?? false);
  const [sigText, setSigText] = useState(() => getAccountSignature(selectedEmail).text);
  const [sigHtml, setSigHtml] = useState(() => getAccountSignature(selectedEmail).html ?? '');
  const [savedNotice, setSavedNotice] = useState(false);

  // Dahili İmla / Yazım Denetimi (Spellchecker)
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(() => {
    return localStorage.getItem('postaci_spellcheck') !== 'false';
  });

  const handleToggleSpellcheck = (val: boolean) => {
    setSpellcheckEnabled(val);
    localStorage.setItem('postaci_spellcheck', String(val));
    if (window.postaci?.appSettings?.setSpellcheck) {
      window.postaci.appSettings.setSpellcheck(val);
    }
  };

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
    setSigIsHtml(s.isHtml ?? false);
    setSigText(s.text);
    setSigHtml(s.html ?? '');
    // Editör ComposingTab içinde; sigHtml değişince oradaki useEffect içeriği senkronlar.
    setSavedNotice(false);
  };

  const handleSaveSignature = () => {
    if (!selectedEmail) return;
    // Editör artık ComposingTab içinde; HTML'i oradan onInput ile senkron gelir.
    const currentHtml = sigHtml;
    saveAccountSignature(selectedEmail, {
      enabled: sigEnabled,
      text: sigText,
      isHtml: sigIsHtml,
      html: currentHtml,
    });
    setSigHtml(currentHtml);
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

  // Vite build'de __APP_VERSION__ inject edilir; preload yedekliği ikinci sırada.
  // Son çare 'bilinmiyor' — sahte bir sürüm numarası güncelleme kontrolünü yanıltır.
  const currentVersion =
    (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '') || window.postaci?.version || UNKNOWN_VERSION;
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
    // Önce gerçek otomatik güncelleyici (latest.yml); yoksa GitHub API yedeği
    try {
      const updater = window.postaci?.updater;
      if (updater?.check) {
        const r = await updater.check();
        if (r?.ok) {
          const tag = (r.version || '').replace(/^v/, '');
          const cur = (currentVersion || '').replace(/^v/, '');
          const hasUpdate = Boolean(tag && cur !== UNKNOWN_VERSION && tag !== cur);
          setLatestReleaseInfo({
            version: tag || undefined,
            hasUpdate,
            url: 'https://github.com/eekilinc/Postaci/releases/latest',
          });
          setUpdateCheckStatus(hasUpdate ? 'available' : 'latest');
          return;
        }
      }
    } catch {}
    try {
      const res = await fetch('https://api.github.com/repos/eekilinc/Postaci/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const tag = (data.tag_name || '').replace(/^v/, '');
        // Sürüm bilinmiyorsa karşılaştırma anlamsız; "güncelleme var" demek yanlış olur.
        const hasUpdate = Boolean(tag && currentVersion !== UNKNOWN_VERSION && tag !== currentVersion);
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

  // Seçili düzenlenen hesap
  const editingAccount = useMemo(
    () => accounts.find((a) => a.id === editingAccountId),
    [accounts, editingAccountId]
  );
  const isEditingOAuth = editingAccount
    ? editingAccount.auth_type === 'oauth' ||
      editingAccount.provider === 'google' ||
      editingAccount.provider === 'microsoft' ||
      editingAccount.provider === 'yahoo'
    : false;

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
      const payload = isEditingOAuth
        ? { displayName: editDisplayName.trim() || undefined }
        : {
            displayName: editDisplayName.trim() || undefined,
            imapHost: editImapHost.trim() || undefined,
            imapPort: editImapPort || undefined,
            smtpHost: editSmtpHost.trim() || undefined,
            smtpPort: editSmtpPort || undefined,
            smtpSecure: editSmtpSecure,
            password: editPassword.trim() || undefined,
          };
      await window.postaci.accounts.update(editingAccountId, payload);
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
      const overrides = isEditingOAuth
        ? undefined
        : {
            displayName: editDisplayName.trim() || undefined,
            imapHost: editImapHost.trim() || undefined,
            imapPort: editImapPort || undefined,
            smtpHost: editSmtpHost.trim() || undefined,
            smtpPort: editSmtpPort || undefined,
            smtpSecure: editSmtpSecure,
            password: editPassword.trim() || undefined,
          };
      const result = await window.postaci.accounts.testConnection(editingAccountId, overrides);
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

  // Hesap Tanısı — salt-okunur, DB'ye yazmaz
  const handleDiagnose = async (acc: Account) => {
    if (!window.postaci?.mail?.diagnose || diagnosingEmail) return;
    setDiagnosingEmail(acc.email);
    try {
      const res = await window.postaci.mail.diagnose(acc.email);
      setDiagnoseResults((prev) => ({ ...prev, [acc.email]: { ok: res.ok, steps: res.steps, hint: res.hint } }));
    } catch (err) {
      setDiagnoseResults((prev) => ({
        ...prev,
        [acc.email]: { ok: false, steps: [{ key: 'fatal', ok: false, detail: err instanceof Error ? err.message : String(err) }], hint: '' },
      }));
    } finally {
      setDiagnosingEmail(null);
    }
  };

  // Mailbird Duvar Kağıtları Önizlemeleri

  // Sadece gerçek, dolu ve çalışan sekmeler (İçeriği olmayan boş sekmeler kaldırıldı!)
  const navTabs: { id: SettingsTab; label: string }[] = buildNavTabs(language);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={language === 'en' ? 'Settings' : 'Ayarlar'}
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
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'en' ? 'Remove Account' : 'Hesabı Kaldır'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{confirmDeleteAcc.email}</span>{' '}
                  {language === 'en'
                    ? 'will be removed from Postacı. Local cached messages will be cleared; emails on your server are not affected.'
                    : "hesabı Postacı'dan kaldırılacak. Yerel iletiler silinir, sunucudaki e-postalarınız etkilenmez."}
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
                {language === 'en' ? 'Cancel' : 'İptal'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingAcc}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {deletingAcc ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /><span>{language === 'en' ? 'Removing...' : 'Kaldırılıyor...'}</span></>
                ) : (language === 'en' ? 'Remove Account' : 'Hesabı Kaldır')}
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
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-4 custom-scrollbar">
            {/* ==================== 1. GENEL TAB ==================== */}
{activeTab === 'general' && (
              <GeneralTab
                launchOnStartup={launchOnStartup}
                startMinimized={startMinimized}
                hideTaskbarOnMinimize={hideTaskbarOnMinimize}
                closeToQuit={closeToQuit}
                useGmailShortcuts={useGmailShortcuts}
                onAppBehaviorChange={updateAppBehavior}
                spellcheckEnabled={spellcheckEnabled}
                onToggleSpellcheck={handleToggleSpellcheck}
                markReadTiming={localMarkReadTiming}
                onMarkReadTimingChange={handleMarkReadTimingChange}
                showUnreadBadge={showUnreadBadge}
                onShowUnreadBadgeChange={setShowUnreadBadge}
                showTaskbarAlert={showTaskbarAlert}
                onShowTaskbarAlertChange={setShowTaskbarAlert}
                showTrackingAlert={showTrackingAlert}
                onShowTrackingAlertChange={setShowTrackingAlert}
                showInAppAlerts={showInAppAlerts}
                onToggleInAppAlerts={handleToggleInAppAlerts}
                soundChoice={soundChoice}
                onSoundChange={handleSoundChange}
                syncInterval={syncInterval}
                onSyncIntervalChange={handleSyncIntervalChange}
                onTestNotification={handleTestNotification}
                testNotice={testNotice}
                quietHoursEnabled={quietHoursEnabled}
                onQuietHoursToggle={handleQuietHoursToggle}
                quietHoursStart={quietHoursStart}
                quietHoursEnd={quietHoursEnd}
                onQuietHoursTimeChange={handleQuietHoursTimeChange}
              />
            )}

            {/* ==================== 2. GÖRÜNÜM TAB ==================== */}
{activeTab === 'appearance' && (
              <AppearanceTab
                layoutMode={layoutMode}
                onLayoutModeChange={handleLayoutMode}
                showReadingPane={showReadingPane}
                onShowReadingPaneChange={setShowReadingPane}
                showFoldersSeparately={showFoldersSeparately}
                onShowFoldersSeparatelyChange={setShowFoldersSeparately}
                theme={theme}
                onThemeChange={setTheme}
                accent={accent}
                onAccentChange={setAccent}
                selectedWallpaper={selectedWallpaper}
                customWallpaperDataUrl={customWallpaperDataUrl}
                onSelectWallpaper={(id) => {
                  setSelectedWallpaper(id);
                  localStorage.setItem('postaci_wallpaper', id);
                }}
                onCustomWallpaperPicked={(dataUrl) => {
                  setCustomWallpaperDataUrl(dataUrl);
                  localStorage.setItem('postaci_custom_wallpaper', dataUrl);
                  setSelectedWallpaper('custom');
                  localStorage.setItem('postaci_wallpaper', 'custom');
                  window.dispatchEvent(new CustomEvent('postaci:wallpaper', { detail: { id: 'custom', dataUrl } }));
                }}
                oledMode={localOled}
                onOledToggle={handleOledToggle}
                listDensity={localDensity}
                onDensityChange={handleDensityChange}
                snippetLines={localSnippetLines}
                onSnippetLinesChange={handleSnippetLinesChange}
                dateFormat={localDateFormat}
                onDateFormatChange={handleDateFormatChange}
                showAvatars={localShowAvatars}
                onShowAvatarsChange={handleShowAvatarsChange}
              />
            )}

            {/* ==================== 3. ÖLÇEKLENDİRME TAB ==================== */}
{activeTab === 'scaling' && (
              <ScalingTab
                appScale={appScale}
                mailScale={mailScale}
                textRenderingMode={textRenderingMode}
                onAppScaleChange={handleAppScaleChange}
                onMailScaleChange={handleMailScaleChange}
                onTextRenderingModeChange={setTextRenderingMode}
              />
            )}

            {/* ==================== 4. HESAPLAR TAB (DÜZENLEME & SİLME DESTEKLİ) ==================== */}
{activeTab === 'accounts' && (
              <AccountsTab
                accounts={accounts}
                onOpenAddAccount={onOpenAddAccount}
                editingAccountId={editingAccountId}
                onStartEdit={handleStartEdit}
                onCancelEdit={() => setEditingAccountId(null)}
                editDisplayName={editDisplayName}
                onEditDisplayNameChange={setEditDisplayName}
                editImapHost={editImapHost}
                onEditImapHostChange={setEditImapHost}
                editImapPort={editImapPort}
                onEditImapPortChange={setEditImapPort}
                editSmtpHost={editSmtpHost}
                onEditSmtpHostChange={setEditSmtpHost}
                editSmtpPort={editSmtpPort}
                onEditSmtpPortChange={setEditSmtpPort}
                editSmtpSecure={editSmtpSecure}
                onEditSmtpSecureChange={setEditSmtpSecure}
                editPassword={editPassword}
                onEditPasswordChange={setEditPassword}
                showEditPassword={showEditPassword}
                onToggleShowEditPassword={() => setShowEditPassword(!showEditPassword)}
                editingIsOAuth={isEditingOAuth}
                testingConnection={testingConnection}
                connectionTestResult={connectionTestResult}
                onTestConnection={handleTestConnection}
                savingAccount={savingAccount}
                accountSaveNotice={accountSaveNotice}
                onSaveAccount={handleSaveAccount}
                diagnosingEmail={diagnosingEmail}
                diagnoseResults={diagnoseResults}
                onDiagnose={handleDiagnose}
                onRequestDelete={handleDeleteAccount}
              />
            )}

            {/* ==================== 5. OLUŞTURMA / İMZALAR TAB ==================== */}
{activeTab === 'composing' && (
              <ComposingTab
                accounts={accounts}
                selectedEmail={selectedEmail}
                onSelectAccount={handleSelectAccount}
                sigEnabled={sigEnabled}
                onSigEnabledChange={setSigEnabled}
                sigIsHtml={sigIsHtml}
                onSigIsHtmlChange={setSigIsHtml}
                sigText={sigText}
                onSigTextChange={setSigText}
                sigHtml={sigHtml}
                onSigHtmlChange={setSigHtml}
                onSaveSignature={handleSaveSignature}
                savedNotice={savedNotice}
                undoDelay={localUndoDelay}
                onUndoDelayChange={handleUndoDelayChange}
                quickSnippets={quickSnippets}
                snippetTitle={snippetTitle}
                onSnippetTitleChange={setSnippetTitle}
                snippetBody={snippetBody}
                onSnippetBodyChange={setSnippetBody}
                snippetNotice={snippetNotice}
                onAddSnippet={handleAddSnippet}
                onDeleteSnippet={handleDeleteSnippet}
              />
            )}

            {/* ==================== 6. GELİŞMİŞ TAB ==================== */}
{activeTab === 'advanced' && (
              <AdvancedTab
                markReadTiming={localMarkReadTiming}
                onMarkReadTimingChange={handleMarkReadTimingChange}
                blockRemoteImages={localBlockRemote}
                onBlockRemoteImagesChange={handleBlockRemoteChange}
                dbStats={dbStats}
                accountCountFallback={accounts.length}
                systemInfo={systemInfo}
                onRefreshSystemInfo={loadSystemInfo}
                vacuumStatus={vacuumStatus}
                onVacuum={handleVacuum}
                onOpenShortcutsHelp={onOpenShortcutsHelp}
                onOpenLogFolder={() => window.postaci?.logs?.openFolder().catch(() => {})}
              />
            )}

            {/* ==================== 7. POSTACI HAKKINDA TAB ==================== */}
{activeTab === 'about' && (
              <AboutTab
                currentVersion={currentVersion}
                updateCheckStatus={updateCheckStatus}
                updaterStatus={updaterStatus}
                latestReleaseInfo={latestReleaseInfo}
                onCheckUpdate={handleCheckUpdate}
                onRestartToUpdate={handleUpdaterRestart}
                openUrl={openUrl}
                systemInfo={systemInfo}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
