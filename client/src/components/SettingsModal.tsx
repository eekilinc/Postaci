import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Palette,
  Keyboard,
  Info,
  ShieldCheck,
  Zap,
  Lock,
  Server,
  Edit2,
  Sliders,
  Bell,
  FileSignature,
  Download,
  RotateCcw,
  Check,
  Volume2,
  Laptop,
  RefreshCw,
  Sparkles,
  UploadCloud,
  ExternalLink,
  Layers,
  Copy,
  Save,
  ArrowLeft,
  Code2,
  Scale,
  Heart,
  Shield,
  Cpu,
  Globe,
  Award
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { useTheme, Theme, AccentColor, Density } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Account, ViewLayout } from '../types';
import { PostaciLogo } from './PostaciLogo';
import { APP_VERSION } from '../version';

const GithubIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export const PROVIDER_PRESETS: Record<string, {
  name: string;
  icon: string;
  badge: string;
  color: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'custom';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  helpUrl?: string;
  helpTitle?: string;
  helpText: string;
}> = {
  google: {
    name: 'Google / Gmail',
    icon: '🔴',
    badge: '1-Tıkla Şifre',
    color: '#ea4335',
    provider: 'gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    helpUrl: 'https://myaccount.google.com/apppasswords',
    helpTitle: '🔑 Google Uygulama Şifresi Al',
    helpText: 'Google hesabınızda 2 Adımlı Doğrulama açıkken butona tıklayıp 16 haneli şifrenizi alarak anında bağlanın.'
  },
  microsoft: {
    name: 'Microsoft 365 / Outlook',
    icon: '🔵',
    badge: 'Outlook & 365',
    color: '#0078d4',
    provider: 'outlook',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    helpUrl: 'https://account.live.com/proofs/manage/additional',
    helpTitle: '🔑 Microsoft Güvenlik Sayfası',
    helpText: 'Outlook.com, Hotmail veya kurumsal Office 365 e-posta ve şifrenizi giriniz.'
  },
  yandex: {
    name: 'Yandex Mail',
    icon: '🟡',
    badge: 'Yandex & Kurumsal',
    color: '#fc3f1d',
    provider: 'custom',
    imapHost: 'imap.yandex.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.com',
    smtpPort: 465,
    smtpSecure: true,
    helpUrl: 'https://passport.yandex.com/profile',
    helpTitle: '🔑 Yandex Şifre Sayfası',
    helpText: 'Yandex Profil → Güvenlik → "Uygulama şifreleri" → "Posta (Mail)" seçeneğinden bir şifre üretiniz.'
  },
  icloud: {
    name: 'Apple iCloud',
    icon: '🍎',
    badge: 'iCloud & me.com',
    color: '#8b5cf6',
    provider: 'icloud',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    helpUrl: 'https://appleid.apple.com/account/manage',
    helpTitle: '🔑 Apple Kimliği Sayfası',
    helpText: 'Apple ID sayfanızda Giriş Yapma ve Güvenlik → "Uygulamaya Özgü Parolalar" bölümünden şifre alınız.'
  },
  yahoo: {
    name: 'Yahoo Mail',
    icon: '🟣',
    badge: 'Yahoo Mail Pro',
    color: '#6001d2',
    provider: 'yahoo',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    helpUrl: 'https://login.yahoo.com/account/security',
    helpTitle: '🔑 Yahoo Güvenlik Sayfası',
    helpText: 'Yahoo Güvenlik ayarlarından "Uygulama Şifresi Oluştur" seçip şifrenizi giriniz.'
  },
  custom: {
    name: 'Özel / Kurumsal Sunucu',
    icon: '🌐',
    badge: 'Üniversite & cPanel',
    color: '#38bdf8',
    provider: 'custom',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    helpText: 'Üniversite, şirket, cPanel veya özel posta sunucunuzun IMAP/SMTP bilgilerini giriniz.'
  }
};

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    accounts,
    refreshAccounts,
    setActiveAccountId,
    refreshEmails,
    refreshStats,
    viewLayout,
    setViewLayout,
    triggerSync,
  } = useMail();

  const { theme, setTheme, accentColor, setAccentColor, density, setDensity } = useTheme();
  const { success, error, info } = useToast();

  const [activeTab, setActiveTab] = useState<
    'accounts' | 'system' | 'appearance' | 'general' | 'signatures' | 'security' | 'notifications' | 'backup' | 'updates' | 'shortcuts' | 'about'
  >('accounts');

  // Account Form State (Adding & Editing)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const [accName, setAccName] = useState('');
  const [accEmail, setAccEmail] = useState('');
  const [accProvider, setAccProvider] = useState<'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'custom' | 'demo'>('custom');

  // IMAP
  const [accImapHost, setAccImapHost] = useState('');
  const [accImapPort, setAccImapPort] = useState(993);
  const [accImapSecurity, setAccImapSecurity] = useState<'SSL' | 'STARTTLS' | 'NONE'>('SSL');
  const [accImapUser, setAccImapUser] = useState('');
  const [accImapPass, setAccImapPass] = useState('');

  // SMTP
  const [accSmtpHost, setAccSmtpHost] = useState('');
  const [accSmtpPort, setAccSmtpPort] = useState(587);
  const [accSmtpSecurity, setAccSmtpSecurity] = useState<'SSL' | 'STARTTLS' | 'NONE'>('STARTTLS');
  const [accSmtpUser, setAccSmtpUser] = useState('');
  const [accSmtpPass, setAccSmtpPass] = useState('');

  const [accColor, setAccColor] = useState('#3b82f6');
  const [accSignature, setAccSignature] = useState('');
  const [accSyncInterval, setAccSyncInterval] = useState(60);

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-discovery state
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);
  const [discoveredInfo, setDiscoveredInfo] = useState<{
    providerName: string;
    source: string;
    notes?: string;
  } | null>(null);

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [useSameCredentials, setUseSameCredentials] = useState(true);

  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const [isWaitingOAuth, setIsWaitingOAuth] = useState(false);

  const handleSelectProviderPreset = (key: string) => {
    setSelectedProviderKey(key);
    const preset = PROVIDER_PRESETS[key];
    if (preset) {
      setAccProvider(preset.provider);
      setAccColor(preset.color);
      if (preset.imapHost) setAccImapHost(preset.imapHost);
      if (preset.imapPort) setAccImapPort(preset.imapPort);
      setAccImapSecurity(preset.imapSecure ? 'SSL' : 'STARTTLS');
      if (preset.smtpHost) setAccSmtpHost(preset.smtpHost);
      if (preset.smtpPort) setAccSmtpPort(preset.smtpPort);
      setAccSmtpSecurity(preset.smtpSecure ? 'SSL' : 'STARTTLS');
    }
  };

  // General & Security Preferences (Persisted in localStorage)
  const [undoSendDelay, setUndoSendDelay] = useState(() => Number(localStorage.getItem('postaci_undo_send') || '5'));
  const [autoSyncInterval, setAutoSyncInterval] = useState(() => Number(localStorage.getItem('postaci_auto_sync') || '15'));
  const [blockTrackingPixels, setBlockTrackingPixels] = useState(() => localStorage.getItem('postaci_block_tracking') !== 'false');
  const [blockExternalImages, setBlockExternalImages] = useState(() => localStorage.getItem('postaci_block_images') === 'true');
  const [desktopNotifications, setDesktopNotifications] = useState(() => localStorage.getItem('postaci_desktop_notifs') !== 'false');
  const [notificationSound, setNotificationSound] = useState(() => localStorage.getItem('postaci_notif_sound') || 'subtle');

  // Desktop & System Tray Preferences
  const [desktopSettings, setDesktopSettings] = useState({
    minimizeToTrayOnClose: true,
    minimizeToTrayOnMinimize: true,
    autoStartOnBoot: false,
    startMinimized: false,
  });

  // Updates state
  const [updateRepo, setUpdateRepo] = useState('eekilinc/Postaci');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);

  // Backup file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if ((window as any).electronAPI?.getDesktopSettings) {
      (window as any).electronAPI.getDesktopSettings().then((s: any) => {
        if (s) setDesktopSettings(s);
      }).catch(() => {});
    }
  }, []);

  const handleCloseModal = () => {
    handleResetForm();
    setIsSettingsOpen(false);
  };

  useEffect(() => {
    if (isSettingsOpen) {
      if (accounts.length === 0) {
        handleResetForm();
        setIsFormOpen(true);
      } else if (!editingAccountId) {
        handleResetForm();
        setIsFormOpen(false);
      }
    } else {
      handleResetForm();
    }
  }, [isSettingsOpen]);

  const handleUpdateDesktopSettings = async (partial: Partial<typeof desktopSettings>) => {
    const updated = { ...desktopSettings, ...partial };
    setDesktopSettings(updated);
    if ((window as any).electronAPI?.setDesktopSettings) {
      try {
        await (window as any).electronAPI.setDesktopSettings(updated);
        success('Masaüstü ayarları güncellendi.');
      } catch (err: any) {
        error('Ayar kaydedilemedi: ' + err.message);
      }
    } else {
      localStorage.setItem('postaci_desktop_settings', JSON.stringify(updated));
      success('Ayarlar kaydedildi.');
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await api.checkUpdate(updateRepo);
      setUpdateResult(res);
      if (res.updateAvailable) {
        info(`Yeni sürüm mevcut: v${res.latestVersion}`, 'Güncelleme Bildirimi');
      } else {
        success(`En güncel sürümü (v${APP_VERSION}) kullanıyorsunuz.`);
      }
    } catch (err: any) {
      error(err.message || 'Güncelleme denetlenirken bir sorun oluştu.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        const parsed = JSON.parse(evt.target?.result as string);
        const res = await api.importBackup(parsed, 'merge');
        success(res.message || 'Yedek başarıyla geri yüklendi.');
        refreshAccounts();
      } catch (err: any) {
        error(err.message || 'Yedek dosyası okunamadı veya biçimi geçersiz.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleOpenExternal = (url: string) => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else if ((window as any).desktop?.openExternal) {
      (window as any).desktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // OAuth credentials state
  const [googleAuthMode, setGoogleAuthMode] = useState<'app_password' | 'oauth'>('app_password');
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('postaci_google_client_id') || '');
  const [googleClientSecret, setGoogleClientSecret] = useState(() => localStorage.getItem('postaci_google_client_secret') || '');
  const [isSavingOAuth, setIsSavingOAuth] = useState(false);

  useEffect(() => {
    api.getOAuthConfig().then((cfg) => {
      if (cfg.googleClientId) {
        setGoogleClientId(cfg.googleClientId);
        localStorage.setItem('postaci_google_client_id', cfg.googleClientId);
      }
      if (cfg.googleClientSecret) {
        setGoogleClientSecret(cfg.googleClientSecret);
        localStorage.setItem('postaci_google_client_secret', cfg.googleClientSecret);
      }
    }).catch(() => {});
  }, []);

  const initialAccountIdsRef = useRef<Set<string>>(new Set());

  // Active polling listener when Google OAuth popup is active in browser
  useEffect(() => {
    if (!isWaitingOAuth) return;

    let isDone = false;
    const checkOAuthAccounts = async () => {
      if (isDone) return;
      try {
        const currentAccounts = await api.getAccounts();
        const newAcc = currentAccounts.find((a: Account) => !initialAccountIdsRef.current.has(a.id)) ||
                       (currentAccounts.length > initialAccountIdsRef.current.size ? currentAccounts[currentAccounts.length - 1] : null);

        if (newAcc || currentAccounts.length > initialAccountIdsRef.current.size) {
          isDone = true;
          setIsWaitingOAuth(false);
          await refreshAccounts();
          if (newAcc?.id) {
            setActiveAccountId(newAcc.id);
          }
          success(`${newAcc?.email || 'Google'} hesabı başarıyla bağlandı! 🎉`, 'Giriş Başarılı');
          refreshEmails();
          refreshStats();
          triggerSync();
          handleResetForm();
          setIsFormOpen(false);
          setEditingAccountId(null);
          setSelectedProviderKey(null);
          setActiveTab('accounts');
        }
      } catch {}
    };

    const interval = setInterval(checkOAuthAccounts, 1000);
    return () => {
      isDone = true;
      clearInterval(interval);
    };
  }, [isWaitingOAuth, refreshAccounts, setActiveAccountId, refreshEmails, refreshStats, triggerSync, success]);

  const handleStartGoogleOAuth = async () => {
    setIsSavingOAuth(true);
    initialAccountIdsRef.current = new Set(accounts.map((a: Account) => a.id));
    try {
      if (googleClientId.trim()) {
        localStorage.setItem('postaci_google_client_id', googleClientId.trim());
        localStorage.setItem('postaci_google_client_secret', googleClientSecret.trim());
        await api.saveOAuthConfig({
          googleClientId: googleClientId.trim(),
          googleClientSecret: googleClientSecret.trim()
        });
      }
      const res = await api.getGoogleAuthUrl(googleClientId.trim() || undefined);
      if (res.url) {
        handleOpenExternal(res.url);
        setIsWaitingOAuth(true);
        info('Tarayıcınızda Google yetkilendirme sayfası açıldı. Giriş yaptığınızda Postacı otomatik olarak bağlanacaktır.');
      }
    } catch (err: any) {
      error(err.message || 'Google yetkilendirmesi başlatılamadı.');
      setIsWaitingOAuth(false);
    } finally {
      setIsSavingOAuth(false);
    }
  };

  const handleSaveOAuthCredentials = async () => {
    setIsSavingOAuth(true);
    try {
      localStorage.setItem('postaci_google_client_id', googleClientId.trim());
      localStorage.setItem('postaci_google_client_secret', googleClientSecret.trim());
      await api.saveOAuthConfig({
        googleClientId: googleClientId.trim(),
        googleClientSecret: googleClientSecret.trim()
      });
      success('Google OAuth İstemci Kimliği ve Gizli Anahtarı kaydedildi!');
    } catch (err: any) {
      error(err.message || 'OAuth ayarları kaydedilemedi.');
    } finally {
      setIsSavingOAuth(false);
    }
  };

  // Instant Provider Detection & Smart Autodiscovery when email changes
  useEffect(() => {
    if (editingAccountId || !accEmail.trim()) {
      return;
    }

    const email = accEmail.trim().toLowerCase();
    const domain = email.includes('@') ? email.split('@')[1] : '';

    // Fast instant local provider detection
    if (domain === 'gmail.com' || domain === 'googlemail.com' || email.includes('@gmail') || email.includes('@google')) {
      if (selectedProviderKey !== 'google') handleSelectProviderPreset('google');
    } else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com' || domain === 'office365.com' || email.includes('@outlook') || email.includes('@hotmail') || email.includes('@live') || email.includes('@msn')) {
      if (selectedProviderKey !== 'microsoft') handleSelectProviderPreset('microsoft');
    } else if (domain === 'yandex.com' || domain === 'yandex.com.tr' || domain === 'yandex.ru' || domain === 'ya.ru' || email.includes('@yandex') || email.includes('@ya.ru')) {
      if (selectedProviderKey !== 'yandex') handleSelectProviderPreset('yandex');
    } else if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com' || email.includes('@icloud') || email.includes('@me.com')) {
      if (selectedProviderKey !== 'icloud') handleSelectProviderPreset('icloud');
    } else if (domain === 'yahoo.com' || domain === 'yahoo.com.tr' || domain === 'ymail.com' || email.includes('@yahoo')) {
      if (selectedProviderKey !== 'yahoo') handleSelectProviderPreset('yahoo');
    }

    if (!accImapUser) {
      setAccImapUser(email);
    }
    if (!accName && email.includes('@')) {
      const prefix = email.split('@')[0];
      setAccName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
    }

    if (domain.length < 3 || !domain.includes('.')) {
      setDiscoveredInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAutoDiscovering(true);
      try {
        const disc = await api.autodiscoverAccount(email);
        if (disc.success) {
          setDiscoveredInfo({
            providerName: disc.providerName,
            source: disc.source,
            notes: disc.notes,
          });
          setAccImapHost(disc.imapHost);
          setAccImapPort(disc.imapPort);
          setAccImapSecurity(disc.imapSecure ? 'SSL' : 'STARTTLS');

          setAccSmtpHost(disc.smtpHost);
          setAccSmtpPort(disc.smtpPort);
          setAccSmtpSecurity(disc.smtpSecure ? 'SSL' : 'STARTTLS');
        }
      } catch {
        // Fallback silently
      } finally {
        setIsAutoDiscovering(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [accEmail, editingAccountId]);

  const handleEditAccount = (acc: Account) => {
    setEditingAccountId(acc.id);
    setSelectedProviderKey(acc.provider || 'custom');
    setAccName(acc.name || '');
    setAccEmail(acc.email || '');
    setAccProvider(acc.provider as any || 'custom');
    setAccImapHost(acc.imapHost || '');
    setAccImapPort(acc.imapPort || 993);
    setAccImapSecurity(acc.imapSecure ? 'SSL' : 'STARTTLS');
    setAccImapUser(acc.imapUser || '');
    setAccImapPass(acc.imapPassword || '');

    setAccSmtpHost(acc.smtpHost || '');
    setAccSmtpPort(acc.smtpPort || 587);
    setAccSmtpSecurity(acc.smtpSecure ? 'SSL' : 'STARTTLS');
    setAccSmtpUser(acc.smtpUser || '');
    setAccSmtpPass(acc.smtpPassword || '');

    setAccColor(acc.color || '#3b82f6');
    setAccSignature(acc.signature || '');
    setAccSyncInterval(acc.syncInterval || 60);

    setIsFormOpen(true);
    setTestResult(null);
  };

  const handleResetForm = () => {
    setEditingAccountId(null);
    setSelectedProviderKey(null);
    setIsWaitingOAuth(false);
    setShowAdvancedSettings(false);
    setGoogleAuthMode('app_password');
    setUseSameCredentials(true);
    setAccName('');
    setAccEmail('');
    setAccProvider('custom');
    setAccImapHost('');
    setAccImapPort(993);
    setAccImapSecurity('SSL');
    setAccImapUser('');
    setAccImapPass('');
    setAccSmtpHost('');
    setAccSmtpPort(587);
    setAccSmtpSecurity('STARTTLS');
    setAccSmtpUser('');
    setAccSmtpPass('');
    setAccColor('#3b82f6');
    setAccSignature('');
    setAccSyncInterval(60);
    setIsFormOpen(false);
    setTestResult(null);
    setDiscoveredInfo(null);
  };

  const handleTestConnection = async () => {
    const cleanImapHost = accImapHost.trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanSmtpHost = (accSmtpHost || accImapHost).trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanImapUser = accImapUser.trim();
    const cleanSmtpUser = (useSameCredentials ? accImapUser : accSmtpUser).trim();
    const cleanEmail = accEmail.trim();

    if (!cleanImapHost || !cleanImapUser || !accImapPass) {
      error('Lütfen IMAP sunucu, kullanıcı adı ve parola alanlarını doldurun.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const payload = {
        email: cleanEmail,
        imapHost: cleanImapHost,
        imapPort: Number(accImapPort) || 993,
        imapUser: cleanImapUser,
        imapPassword: accImapPass,
        imapSecure: accImapSecurity === 'SSL',
        smtpHost: cleanSmtpHost,
        smtpPort: Number(accSmtpPort) || 587,
        smtpUser: cleanSmtpUser,
        smtpPassword: useSameCredentials ? accImapPass : accSmtpPass,
        smtpSecure: accSmtpSecurity === 'SSL',
      };

      const result: any = await api.testAccountConnection(payload);
      setTestResult(result);

      // Auto-apply suggested verified parameters if returned from server
      if (result.suggestedImapHost && result.suggestedImapHost !== accImapHost) {
        setAccImapHost(result.suggestedImapHost);
      }
      if (result.suggestedImapPort) {
        setAccImapPort(result.suggestedImapPort);
      }
      if (result.suggestedImapSecure !== undefined) {
        setAccImapSecurity(result.suggestedImapSecure ? 'SSL' : 'STARTTLS');
      }
      if (result.suggestedSmtpHost && result.suggestedSmtpHost !== accSmtpHost) {
        setAccSmtpHost(result.suggestedSmtpHost);
      }
      if (result.suggestedSmtpPort) {
        setAccSmtpPort(result.suggestedSmtpPort);
      }
      if (result.suggestedSmtpSecure !== undefined) {
        setAccSmtpSecurity(result.suggestedSmtpSecure ? 'SSL' : 'STARTTLS');
      }
      if (result.suggestedImapUser && result.suggestedImapUser !== accImapUser) {
        setAccImapUser(result.suggestedImapUser);
      }

      if (result.success) {
        success(result.message || 'Bağlantı testi başarılı!');
      } else {
        error(result.message || 'Bağlantı kurulamadı.');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Bağlantı hatası.',
      });
      error(err.message || 'Bağlantı testi başarısız.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanImapHost = accImapHost.trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanSmtpHost = (accSmtpHost || accImapHost).trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanImapUser = accImapUser.trim() || accEmail.trim();
    const cleanSmtpUser = (useSameCredentials ? accImapUser : accSmtpUser).trim() || accEmail.trim();
    const cleanEmail = accEmail.trim();

    if (!cleanEmail || !cleanImapHost || !accImapPass) {
      error('Lütfen e-posta adresi, IMAP sunucu ve parola alanlarını doldurun.');
      return;
    }

    setIsSaving(true);
    try {
      // Auto-test connection before saving a NEW account (skipped on edit)
      if (!editingAccountId && !testResult?.success) {
        try {
          const testPayload = {
            email: cleanEmail,
            imapHost: cleanImapHost,
            imapPort: Number(accImapPort) || 993,
            imapUser: cleanImapUser,
            imapPassword: accImapPass,
            imapSecure: accImapSecurity === 'SSL',
            smtpHost: cleanSmtpHost,
            smtpPort: Number(accSmtpPort) || 587,
            smtpUser: cleanSmtpUser,
            smtpPassword: useSameCredentials ? accImapPass : accSmtpPass,
            smtpSecure: accSmtpSecurity === 'SSL',
          };
          const autoTestResult: any = await api.testAccountConnection(testPayload);
          setTestResult(autoTestResult);

          // Apply any server-suggested corrections
          if (autoTestResult.suggestedImapHost) setAccImapHost(autoTestResult.suggestedImapHost);
          if (autoTestResult.suggestedImapPort) setAccImapPort(autoTestResult.suggestedImapPort);
          if (autoTestResult.suggestedImapSecure !== undefined) setAccImapSecurity(autoTestResult.suggestedImapSecure ? 'SSL' : 'STARTTLS');
          if (autoTestResult.suggestedSmtpHost) setAccSmtpHost(autoTestResult.suggestedSmtpHost);
          if (autoTestResult.suggestedSmtpPort) setAccSmtpPort(autoTestResult.suggestedSmtpPort);
          if (autoTestResult.suggestedSmtpSecure !== undefined) setAccSmtpSecurity(autoTestResult.suggestedSmtpSecure ? 'SSL' : 'STARTTLS');
          if (autoTestResult.suggestedImapUser) setAccImapUser(autoTestResult.suggestedImapUser);

          if (!autoTestResult.success) {
            error(`Bağlantı testi başarısız: ${autoTestResult.message}. Ayarlarınızı kontrol edip tekrar deneyin.`);
            setIsSaving(false);
            return;
          }
        } catch (testErr: any) {
          // Test failed hard — stop saving
          setTestResult({ success: false, message: testErr.message || 'Bağlantı testi hatası.' });
          error(`Sunucuya bağlanılamadı: ${testErr.message || 'Bağlantı hatası.'} Ayarlarınızı kontrol edin.`);
          setIsSaving(false);
          return;
        }
      }

      const accountData: Partial<Account> = {
        name: (accName || cleanEmail.split('@')[0]).trim(),
        email: cleanEmail,
        provider: accProvider,
        imapHost: cleanImapHost,
        imapPort: Number(accImapPort) || 993,
        imapUser: cleanImapUser,
        imapPassword: accImapPass,
        imapSecure: accImapSecurity === 'SSL',
        smtpHost: cleanSmtpHost,
        smtpPort: Number(accSmtpPort) || 587,
        smtpUser: cleanSmtpUser,
        smtpPassword: useSameCredentials ? accImapPass : accSmtpPass,
        smtpSecure: accSmtpSecurity === 'SSL',
        color: accColor,
        signature: accSignature,
        syncInterval: accSyncInterval,
      };

      if (editingAccountId) {
        await api.updateAccount(editingAccountId, accountData);
        success('Hesap ayarları güncellendi.');
      } else {
        const created = await api.createAccount(accountData);
        success('✅ Hesap eklendi! E-postalar arka planda senkronize ediliyor...');
        if (created && created.id) {
          setActiveAccountId(created.id);
        }
      }

      await refreshAccounts();
      handleResetForm();
      setIsFormOpen(false);
      setEditingAccountId(null);
      setActiveTab('accounts');
      refreshEmails();
      refreshStats();
    } catch (err: any) {
      error(err.message || 'Hesap kaydedilirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleForceSaveAccount = async () => {
    const cleanImapHost = accImapHost.trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanSmtpHost = (accSmtpHost || accImapHost).trim().replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '').replace(/\/.*$/, '');
    const cleanImapUser = accImapUser.trim() || accEmail.trim();
    const cleanSmtpUser = (useSameCredentials ? accImapUser : accSmtpUser).trim() || accEmail.trim();
    const cleanEmail = accEmail.trim();

    if (!cleanEmail || !cleanImapHost || !accImapPass) {
      error('Lütfen e-posta adresi, IMAP sunucu ve parola alanlarını doldurun.');
      return;
    }

    setIsSaving(true);
    try {
      const accountData: Partial<Account> = {
        name: (accName || cleanEmail.split('@')[0]).trim(),
        email: cleanEmail,
        provider: accProvider,
        imapHost: cleanImapHost,
        imapPort: Number(accImapPort) || 993,
        imapUser: cleanImapUser,
        imapPassword: accImapPass,
        imapSecure: accImapSecurity === 'SSL',
        smtpHost: cleanSmtpHost,
        smtpPort: Number(accSmtpPort) || 587,
        smtpUser: cleanSmtpUser,
        smtpPassword: useSameCredentials ? accImapPass : accSmtpPass,
        smtpSecure: accSmtpSecurity === 'SSL',
        color: accColor,
        signature: accSignature,
        syncInterval: accSyncInterval,
      };

      if (editingAccountId) {
        await api.updateAccount(editingAccountId, accountData);
        success('Hesap ayarları güncellendi.');
      } else {
        const created = await api.createAccount(accountData);
        success('✅ Hesap eklendi! E-postalar arka planda senkronize ediliyor...');
        if (created && created.id) {
          setActiveAccountId(created.id);
        }
      }

      await refreshAccounts();
      handleResetForm();
      setIsFormOpen(false);
      setEditingAccountId(null);
      setActiveTab('accounts');
      refreshEmails();
      refreshStats();
    } catch (err: any) {
      error(err.message || 'Hesap kaydedilirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };


  const handleDeleteAccount = async (id: string, name: string) => {
    const isLast = accounts.length <= 1;
    const confirmMsg = isLast
      ? `"${name}" mevcut tek hesabınızdır. Bu hesabı silerseniz e-postalarınız kaldırılacak ve yeni hesap ekleme ekranı açılacaktır. Devam etmek istiyor musunuz?`
      : `"${name}" hesabını ve tüm ilişkili e-postalarını kaldırmak istediğinize emin misiniz?`;

    if (window.confirm(confirmMsg)) {
      try {
        await api.deleteAccount(id);
        success('Hesap ve tüm e-postaları kaldırıldı.');
        await refreshAccounts();
        const remaining = await api.getAccounts();
        if (remaining.length > 0) {
          setActiveAccountId(remaining[0].id);
        } else {
          setActiveAccountId('');
          handleResetForm();
          setIsFormOpen(true);
        }
        await refreshEmails();
        await refreshStats();
      } catch (err: any) {
        error(err.message || 'Hesap silinemedi.');
      }
    }
  };

  const handleSavePreferences = () => {
    localStorage.setItem('postaci_undo_send', String(undoSendDelay));
    localStorage.setItem('postaci_auto_sync', String(autoSyncInterval));
    localStorage.setItem('postaci_block_tracking', String(blockTrackingPixels));
    localStorage.setItem('postaci_block_images', String(blockExternalImages));
    localStorage.setItem('postaci_desktop_notifs', String(desktopNotifications));
    localStorage.setItem('postaci_notif_sound', notificationSound);
    success('Tercihler kaydedildi.');
  };

  if (!isSettingsOpen) return null;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }} style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '980px',
          height: '680px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid var(--border-medium)',
        }}
      >
        {/* Settings Left Navigation Sidebar */}
        <div style={{
          width: '240px',
          backgroundColor: 'var(--bg-primary)',
          borderRight: '1px solid var(--border-subtle)',
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ padding: '0 8px 12px 8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Ayarlar & Tercihler
            </div>

            {[
              { id: 'accounts', label: 'E-Posta Hesapları', icon: <Mail size={16} /> },
              { id: 'system', label: 'Sistem & Başlangıç', icon: <Laptop size={16} color="var(--accent-primary)" /> },
              { id: 'appearance', label: 'Görünüm & Tema', icon: <Palette size={16} /> },
              { id: 'general', label: 'Genel Tercihler', icon: <Sliders size={16} /> },
              { id: 'signatures', label: 'İmzalar & Şablonlar', icon: <FileSignature size={16} /> },
              { id: 'security', label: 'Güvenlik & Gizlilik', icon: <ShieldCheck size={16} /> },
              { id: 'notifications', label: 'Bildirimler & Ses', icon: <Bell size={16} /> },
              { id: 'backup', label: 'Yedekleme & Veri', icon: <Download size={16} /> },
              { id: 'updates', label: 'Güncellemeler (GitHub)', icon: <RefreshCw size={16} color="var(--accent-success)" /> },
              { id: 'shortcuts', label: 'Klavye Kısayolları', icon: <Keyboard size={16} /> },
              { id: 'about', label: 'Hakkında & Durum', icon: <Info size={16} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); handleResetForm(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: activeTab === tab.id ? 'var(--bg-active)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Postacı Desktop v{APP_VERSION}
          </div>
        </div>

        {/* Settings Right Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header Bar */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {activeTab === 'accounts' && (isFormOpen ? (editingAccountId ? 'E-Posta Hesabını Düzenle' : 'Yeni IMAP / SMTP Hesabı Ekle') : 'E-Posta Hesapları')}
              {activeTab === 'system' && 'Sistem Tepsisi & Windows Başlangıç'}
              {activeTab === 'appearance' && 'Görünüm, Tema ve Vurgu Renkleri'}
              {activeTab === 'general' && 'Genel Kullanım Tercihleri'}
              {activeTab === 'signatures' && 'E-Posta İmzası Yönetimi'}
              {activeTab === 'security' && 'Güvenlik, Gizlilik & İzleyici Kalkanı'}
              {activeTab === 'notifications' && 'Masaüstü Bildirimleri ve Sesler'}
              {activeTab === 'backup' && 'Yedekleme, Geri Yükleme & Veri'}
              {activeTab === 'updates' && 'GitHub Releases Otomatik Güncelleme'}
              {activeTab === 'shortcuts' && 'Hızlı Klavye Kısayolları'}
              {activeTab === 'about' && 'Postacı E-Posta İstemcisi Hakkında'}
            </h3>

            <button
              onClick={handleCloseModal}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Tab Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            
            {/* TAB: ACCOUNTS */}
            {activeTab === 'accounts' && !isFormOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Bağlı e-posta hesaplarınızı yönetin veya yeni bir kurumsal/kişisel e-posta adresi ekleyin.
                  </p>
                  <button
                    onClick={() => { handleResetForm(); setIsFormOpen(true); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={16} />
                    <span>Yeni Hesap Ekle</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {accounts.map((acc: Account) => (
                    <div
                      key={acc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: acc.color || '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '14px',
                          }}
                        >
                          {acc.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{acc.name}</span>
                            {acc.isDefault && (
                              <span style={{ fontSize: '10px', backgroundColor: 'var(--bg-active)', color: 'var(--accent-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                Varsayılan
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{acc.email} • {acc.imapHost}:{acc.imapPort}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleEditAccount(acc)}
                          style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          title="Düzenle"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id, acc.name)}
                          style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }}
                          title="Hesabı Sil"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

                        {/* TAB: ACCOUNTS FORM */}
            {activeTab === 'accounts' && isFormOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '620px', margin: '0 auto', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedProviderKey && !editingAccountId) {
                        setSelectedProviderKey(null);
                        setIsWaitingOAuth(false);
                        setTestResult(null);
                      } else {
                        handleResetForm();
                      }
                    }}
                    style={{
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
                      borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {editingAccountId ? 'Hesap Ayarları' : (!selectedProviderKey ? 'Sağlayıcı Seçin' : `${(selectedProviderKey && PROVIDER_PRESETS[selectedProviderKey]?.name) || 'Hesap Kurulumu'}`)}
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                      {editingAccountId ? 'Bağlantı ve kimlik doğrulama ayarlarını güncelleyin.' : (!selectedProviderKey ? 'Lütfen e-posta hizmet sağlayıcınızı seçin.' : 'E-posta ve şifrenizi girerek anında bağlanın.')}
                    </p>
                  </div>
                </div>

                {!selectedProviderKey && !editingAccountId ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '10px' }}>
                    {Object.entries(PROVIDER_PRESETS).filter(([k]) => k !== 'custom').map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectProviderPreset(key)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
                          padding: '24px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-medium)', cursor: 'pointer', transition: 'all 0.2s',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = preset.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.02)'; }}
                      >
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: preset.color, border: '1px solid var(--border-subtle)' }}>
                          <Mail size={24} />
                        </div>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{preset.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{preset.badge}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSelectProviderPreset('custom')}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        padding: '24px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-medium)', cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.02)'; }}
                    >
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                        <Server size={24} />
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Diğer (Özel IMAP / SMTP)</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kurumsal / cPanel / Plesk</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* PROVIDER GUIDANCE BANNER */}
                    {selectedProviderKey && selectedProviderKey !== 'custom' && PROVIDER_PRESETS[selectedProviderKey] && (
                      <div style={{
                        padding: '16px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(59, 130, 246, 0.05)', border: '1px solid var(--border-medium)',
                        display: 'flex', flexDirection: 'column', gap: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>{PROVIDER_PRESETS[selectedProviderKey].icon}</span>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {PROVIDER_PRESETS[selectedProviderKey].helpTitle || `${PROVIDER_PRESETS[selectedProviderKey].name} Kurulumu`}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
                                {PROVIDER_PRESETS[selectedProviderKey].helpText}
                              </div>
                            </div>
                          </div>
                          {PROVIDER_PRESETS[selectedProviderKey].helpUrl && (
                            <button
                              type="button"
                              onClick={() => handleOpenExternal(PROVIDER_PRESETS[selectedProviderKey].helpUrl!)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                                color: 'var(--accent-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                              }}
                            >
                              <ExternalLink size={14} />
                              <span>Şifre Al</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '16px',
                      padding: '24px', borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-medium)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                    }}>
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Adınız Soyadınız</label>
                        <input
                          type="text"
                          placeholder="Örn: Ahmet Yılmaz"
                          value={accName}
                          onChange={e => setAccName(e.target.value)}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '14px' }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>E-Posta Adresi *</label>
                        <input
                          type="email"
                          required
                          placeholder="ornek@alanadi.com"
                          value={accEmail}
                          onChange={e => setAccEmail(e.target.value)}
                          autoFocus={!editingAccountId}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}
                        />
                      </div>

                      {!editingAccountId && selectedProviderKey === 'google' ? (
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => setGoogleAuthMode('oauth')}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                background: googleAuthMode === 'oauth' ? 'var(--accent-primary)' : 'transparent',
                                color: googleAuthMode === 'oauth' ? '#fff' : 'var(--text-secondary)',
                                fontWeight: googleAuthMode === 'oauth' ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              ⚡ Google ile Giriş (OAuth)
                            </button>
                            <button
                              type="button"
                              onClick={() => setGoogleAuthMode('app_password')}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                background: googleAuthMode === 'app_password' ? 'var(--accent-primary)' : 'transparent',
                                color: googleAuthMode === 'app_password' ? '#fff' : 'var(--text-secondary)',
                                fontWeight: googleAuthMode === 'app_password' ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              🔑 Uygulama Şifresi (16 Haneli)
                            </button>
                          </div>

                          {googleAuthMode === 'oauth' ? (
                            <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(66, 133, 244, 0.08)', border: '1px solid rgba(66, 133, 244, 0.2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: '#4285F4' }}><ShieldCheck size={28} /></div>
                                <div>
                                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Google OAuth ile Yetkilendirme</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Parolanızı girmeden tarayıcınız üzerinden tek tıkla güvenli giriş yapın.</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                  16 Haneli Google Uygulama Şifresi *
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleOpenExternal('https://myaccount.google.com/apppasswords')}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  Şifre Oluştur <ExternalLink size={12} />
                                </button>
                              </div>
                              <input
                                type="password"
                                required={!isWaitingOAuth}
                                placeholder="xxxx xxxx xxxx xxxx"
                                value={accImapPass}
                                onChange={e => {
                                  setAccImapPass(e.target.value);
                                  if (useSameCredentials) setAccSmtpPass(e.target.value);
                                  if (testResult) setTestResult(null);
                                }}
                                style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: accImapPass ? '0.2em' : 'normal', fontWeight: 600 }}
                              />
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                💡 Google Hesabınızda 2 Adımlı Doğrulama açık ise <strong style={{ color: 'var(--text-secondary)' }}>myaccount.google.com/apppasswords</strong> adresinden aldığınız 16 haneli şifreyi giriniz.
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {selectedProviderKey !== 'custom' ? 'Uygulama Şifresi (App Password) *' : 'Parola *'}
                            </label>
                          </div>
                          <input
                            type="password"
                            required
                            placeholder={selectedProviderKey !== 'custom' ? '16 haneli uygulama şifreniz' : 'Hesap parolanız'}
                            value={accImapPass}
                            onChange={e => {
                              setAccImapPass(e.target.value);
                              if (useSameCredentials) setAccSmtpPass(e.target.value);
                              if (testResult) setTestResult(null);
                            }}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: accImapPass ? '0.2em' : 'normal', fontWeight: 600 }}
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {isAutoDiscovering ? (
                            <RefreshCw size={20} className="animate-spin" color="var(--accent-primary)" />
                          ) : (
                            <CheckCircle2 size={20} color={selectedProviderKey !== 'custom' ? 'var(--accent-success)' : 'var(--text-muted)'} />
                          )}
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {isAutoDiscovering ? 'Sunucu ayarları aranıyor...' : (selectedProviderKey !== 'custom' ? `${(selectedProviderKey ? PROVIDER_PRESETS[selectedProviderKey]?.name : undefined) || discoveredInfo?.providerName} Bağlantısı` : 'Manuel Yapılandırma')}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              IMAP: {accImapHost || 'Bilinmiyor'}:{accImapPort || 993} ({accImapSecurity}) • SMTP: {accSmtpHost || 'Bilinmiyor'}:{accSmtpPort || 587} ({accSmtpSecurity})
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                          style={{ background: 'none', border: '1px solid var(--border-medium)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 500 }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          {showAdvancedSettings ? 'Gizle' : 'Gelişmiş Ayarlar'}
                        </button>
                      </div>

                      {showAdvancedSettings && (
                        <div style={{ padding: '20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-medium)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <h5 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>IMAP (Gelen Posta) Sunucusu</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Sunucu *</label>
                                <input type="text" required value={accImapHost} onChange={e => setAccImapHost(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Port *</label>
                                <input type="number" required value={accImapPort} onChange={e => setAccImapPort(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Güvenlik</label>
                                <select value={accImapSecurity} onChange={e => setAccImapSecurity(e.target.value as any)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}>
                                  <option value="SSL">SSL/TLS</option>
                                  <option value="STARTTLS">STARTTLS</option>
                                  <option value="NONE">Yok</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>IMAP Kullanıcı Adı (Boş bırakılırsa e-posta kullanılır)</label>
                              <input
                                type="text"
                                placeholder={accEmail || "ornek@alanadi.com"}
                                value={accImapUser}
                                onChange={e => setAccImapUser(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                              />
                            </div>
                          </div>

                          <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                          <div>
                            <h5 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>SMTP (Giden Posta) Sunucusu</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Sunucu *</label>
                                <input type="text" required value={accSmtpHost} onChange={e => setAccSmtpHost(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Port *</label>
                                <input type="number" required value={accSmtpPort} onChange={e => setAccSmtpPort(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Güvenlik</label>
                                <select value={accSmtpSecurity} onChange={e => setAccSmtpSecurity(e.target.value as any)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}>
                                  <option value="SSL">SSL/TLS</option>
                                  <option value="STARTTLS">STARTTLS</option>
                                  <option value="NONE">Yok</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ marginTop: '12px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                <input type="checkbox" checked={useSameCredentials} onChange={e => { setUseSameCredentials(e.target.checked); if (e.target.checked) setAccSmtpPass(accImapPass); }} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Gelen sunucuyla aynı kullanıcı adı ve parolayı kullan</span>
                              </label>
                            </div>
                            {!useSameCredentials && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SMTP Kullanıcı Adı</label>
                                  <input type="text" placeholder={accEmail || "kullanici"} value={accSmtpUser} onChange={e => setAccSmtpUser(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SMTP Parolası</label>
                                  <input type="password" value={accSmtpPass} onChange={e => setAccSmtpPass(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px', letterSpacing: accSmtpPass ? '0.2em' : 'normal' }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {testResult && (
                      <div style={{
                        padding: '14px 16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '10px',
                        backgroundColor: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        color: testResult.success ? 'var(--accent-success)' : 'var(--accent-danger)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          {testResult.success ? <CheckCircle2 size={18} style={{ marginTop: '2px', flexShrink: 0 }} /> : <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />}
                          <div style={{ fontSize: '13px', lineHeight: '1.5', fontWeight: 500 }}>{testResult.message}</div>
                        </div>
                        {!testResult.success && (
                          <div style={{ display: 'flex', gap: '10px', marginTop: '4px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={handleTestConnection}
                              disabled={isTesting}
                              style={{
                                padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)',
                                border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '12px',
                                fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              {isTesting ? 'Test Ediliyor...' : 'Tekrar Test Et'}
                            </button>
                            <button
                              type="button"
                              onClick={handleForceSaveAccount}
                              disabled={isSaving}
                              style={{
                                padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-primary)',
                                border: 'none', color: 'white', fontSize: '12px',
                                fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Yine de Kaydet (Testi Atla)
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                      <button type="button" onClick={handleResetForm} style={{ padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        İptal
                      </button>

                      {(!selectedProviderKey || selectedProviderKey !== 'google' || googleAuthMode !== 'oauth') && (
                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={isTesting || isSaving || !accEmail}
                          style={{
                            padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '14px',
                            fontWeight: 600, cursor: (isTesting || isSaving || !accEmail) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px'
                          }}
                        >
                          {isTesting ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                          <span>{isTesting ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}</span>
                        </button>
                      )}
                      
                      {!editingAccountId && selectedProviderKey === 'google' && googleAuthMode === 'oauth' ? (
                        <button type="button" onClick={handleStartGoogleOAuth} disabled={isWaitingOAuth || !accEmail} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 28px', borderRadius: 'var(--radius-md)', background: '#4285F4', color: 'white', border: 'none', fontSize: '14px', fontWeight: 600, cursor: (isWaitingOAuth || !accEmail) ? 'not-allowed' : 'pointer', opacity: (isWaitingOAuth || !accEmail) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(66, 133, 244, 0.3)' }}>
                          {isWaitingOAuth ? <RefreshCw size={18} className="animate-spin" /> : <Mail size={18} />}
                          {isWaitingOAuth ? 'Yetkilendirme Bekleniyor...' : 'Google ile Bağlan'}
                        </button>
                      ) : (
                        <button type="submit" disabled={isSaving || isTesting || isAutoDiscovering || !accEmail} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 28px', borderRadius: 'var(--radius-md)', background: 'var(--accent-primary)', color: 'white', border: 'none', fontSize: '14px', fontWeight: 600, cursor: (isSaving || isTesting || isAutoDiscovering || !accEmail) ? 'not-allowed' : 'pointer', opacity: (isSaving || isTesting || isAutoDiscovering || !accEmail) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)' }}>
                          {(isSaving || isTesting) ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                          {isTesting ? 'Test Ediliyor...' : (isSaving ? 'Kaydediliyor...' : (editingAccountId ? 'Değişiklikleri Kaydet' : 'Bağlan ve Hesabı Ekle'))}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            )}
{/* TAB: SYSTEM & STARTUP */}
            {activeTab === 'system' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                <div style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      📬 Kapatıldığında Sistem Tepsisine Küçült (Tray)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Pencereyi kapattığınızda uygulama arka planda çalışmaya devam eder ve anlık postaları tarar.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopSettings.minimizeToTrayOnClose}
                    onChange={e => handleUpdateDesktopSettings({ minimizeToTrayOnClose: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      🗕 Simge Durumuna Küçültüldüğünde Tepsiye Gizle
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Görev çubuğunda yer kaplamaz, saat yanındaki sistem tepsisine geçer.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopSettings.minimizeToTrayOnMinimize}
                    onChange={e => handleUpdateDesktopSettings({ minimizeToTrayOnMinimize: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      🚀 Windows ile Otomatik Başlat
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Bilgisayarınızı açtığınızda Postacı otomatik olarak arka planda çalışmaya başlar.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopSettings.autoStartOnBoot}
                    onChange={e => handleUpdateDesktopSettings({ autoStartOnBoot: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      👁️ Başlangıçta Simge Durumunda Aç
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Windows açıldığında ana pencereyi ekrana getirmeden sessizce saat yanına yerleşir.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopSettings.startMinimized}
                    onChange={e => handleUpdateDesktopSettings({ startMinimized: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}

            {/* TAB: APPEARANCE */}
            {activeTab === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
                {/* 8 Themes */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    🎨 Renk Teması (8 Özel Palet)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {[
                      { id: 'dark', label: '🌙 Titanyum', desc: 'Sleek Dark', bg: '#090d16', border: '#3b82f6' },
                      { id: 'oled', label: '🖤 Saf OLED', desc: 'Pitch Black', bg: '#000000', border: '#ffffff' },
                      { id: 'midnight', label: '🌌 Gece Mavisi', desc: 'Deep Violet', bg: '#0b0f19', border: '#8b5cf6' },
                      { id: 'cyberpunk', label: '🌲 Zümrüt', desc: 'Forest Green', bg: '#091a13', border: '#10b981' },
                      { id: 'nord', label: '❄️ Arktik', desc: 'Nord Frost', bg: '#1e2430', border: '#38bdf8' },
                      { id: 'light', label: '☀️ Kar Beyazı', desc: 'Clean Light', bg: '#ffffff', border: '#3b82f6' },
                      { id: 'warm-paper', label: '📜 Sepia', desc: 'Warm Paper', bg: '#f4ede0', border: '#d97706' },
                      { id: 'rose-gold', label: '🌸 Gül Kurusu', desc: 'Rose Cream', bg: '#fde8ed', border: '#f43f5e' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id as Theme)}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${theme === t.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px' }}>{t.label}</span>
                          <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: t.bg, border: '1px solid var(--border-medium)' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Colors */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    ✨ Vurgu Rengi
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {[
                      { id: 'blue', label: 'Mavi', hex: '#3b82f6' },
                      { id: 'emerald', label: 'Zümrüt', hex: '#10b981' },
                      { id: 'purple', label: 'Mor', hex: '#8b5cf6' },
                      { id: 'crimson', label: 'Yakut', hex: '#f43f5e' },
                      { id: 'amber', label: 'Kehribar', hex: '#f59e0b' },
                      { id: 'cyan', label: 'Turkuaz', hex: '#06b6d4' },
                      { id: 'indigo', label: 'İndigo', hex: '#6366f1' },
                    ].map(a => (
                      <button
                        key={a.id}
                        onClick={() => setAccentColor(a.id as AccentColor)}
                        title={a.label}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: a.hex,
                          border: accentColor === a.id ? '3px solid #ffffff' : '2px solid transparent',
                          boxShadow: accentColor === a.id ? '0 0 10px ' + a.hex : 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {accentColor === a.id && <Check size={14} color="#ffffff" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density Controls */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    📏 Liste Yoğunluğu & Satır Aralığı
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      { id: 'compact', label: 'Kompakt', desc: 'Daha çok e-posta listele' },
                      { id: 'comfortable', label: 'Rahat (Önerilen)', desc: 'Dengeli satır aralığı' },
                      { id: 'spacious', label: 'Geniş', desc: 'Ferah & geniş önizleme' },
                    ].map(d => (
                      <button
                        key={d.id}
                        onClick={() => setDensity(d.id as Density)}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${density === d.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{d.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layout Mode */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    🪟 E-Posta Düzen Modu
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      { id: 'split-3-column', label: '3 Sütunlu Bölünmüş', desc: 'Sol Klasör + Orta Liste + Sağ Okuma' },
                      { id: 'split-2-column', label: '2 Sütunlu Kompakt', desc: 'Klasörler + Tam Ekran Okuma' },
                      { id: 'split-horizontal', label: 'Yatay Bölünmüş', desc: 'Üst Liste + Alt Okuma' },
                    ].map(l => (
                      <button
                        key={l.id}
                        onClick={() => setViewLayout(l.id as ViewLayout)}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${viewLayout === l.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{l.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{l.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    ⏱️ Göndermeyi Geri Alma Süresi (Undo Send)
                  </label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Bir e-postayı gönderdikten sonra iptal edebileceğiniz saniye süresi.
                  </p>
                  <select
                    value={undoSendDelay}
                    onChange={e => setUndoSendDelay(Number(e.target.value))}
                    style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value={5}>5 Saniye</option>
                    <option value={10}>10 Saniye</option>
                    <option value={20}>20 Saniye</option>
                    <option value={30}>30 Saniye</option>
                  </select>
                </div>

                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    ⚡ Arka Plan Otomatik Senkronizasyon Sıklığı
                  </label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Yeni gelen postaların otomatik taranma periyodu.
                  </p>
                  <select
                    value={autoSyncInterval}
                    onChange={e => setAutoSyncInterval(Number(e.target.value))}
                    style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value={15}>Her 15 Saniyede Bir (Süper Hızlı)</option>
                    <option value={30}>Her 30 Saniyede Bir</option>
                    <option value={60}>Her 1 Dakikada Bir</option>
                    <option value={300}>Her 5 Dakikada Bir</option>
                  </select>
                </div>

                <button
                  onClick={handleSavePreferences}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tercihleri Kaydet
                </button>
              </div>
            )}

            {/* TAB: SIGNATURES */}
            {activeTab === 'signatures' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Yeni oluşturduğunuz ve yanıtladığınız e-postalara otomatik olarak eklenecek imzanızı düzenleyin.
                </p>

                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    İmza Metni (HTML Destekli)
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Saygılarımla,&#10;Ahmet Yılmaz | Yazılım Mimarı&#10;Tel: +90 555 123 4567"
                    value={accSignature}
                    onChange={e => setAccSignature(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <button
                  onClick={handleSavePreferences}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  İmzayı Kaydet
                </button>
              </div>
            )}

            {/* TAB: SECURITY */}
            {activeTab === 'security' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      🛡️ İzleyici Piksellerini Engelle (Tracker Blocker)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      E-postayı ne zaman açtığınızı takip eden 1x1 şeffaf casus görselleri engeller.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={blockTrackingPixels}
                    onChange={e => setBlockTrackingPixels(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      🖼️ Harici Görselleri Varsayılan Olarak Engelle
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      IP adresinizin ve konumunuzun uzaktaki sunucular tarafından kaydedilmesini önler.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={blockExternalImages}
                    onChange={e => setBlockExternalImages(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
                {/* GOOGLE CLOUD OAUTH 2.0 CREDENTIALS CONFIG */}
                <div style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(234, 67, 53, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔴</span>
                      <span>Google Cloud OAuth 2.0 İstemci Kimliği (Client ID)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenExternal('https://console.cloud.google.com/apis/credentials')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: '#ea4335',
                        color: 'white',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <span>Google Cloud Console</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                    Google OAuth 2.0 tarayıcı girişlerini etkinleştirmek için Google Cloud Console'dan aldığınız İstemci Kimliğini (Client ID) buraya kaydedin:
                  </p>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      Google İstemci Kimliği (Client ID)
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: 1234567890-abcdef.apps.googleusercontent.com"
                      value={googleClientId}
                      onChange={e => setGoogleClientId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      Google İstemci Gizli Anahtarı (Client Secret)
                    </label>
                    <input
                      type="password"
                      placeholder="Örn: GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={googleClientSecret}
                      onChange={e => setGoogleClientSecret(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    lineHeight: '1.5'
                  }}>
                    <div>Google Cloud Console'da Yetkili Yönlendirme URI (Authorized redirect URI) alanına şunu ekleyin:</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <code style={{ background: '#090d16', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontSize: '11px' }}>
                        http://127.0.0.1:3001/api/auth/google/callback
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('http://127.0.0.1:3001/api/auth/google/callback');
                          success('Yönlendirme URI kopyalandı!');
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px' }}
                      >
                        📋 Kopyala
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveOAuthCredentials}
                    disabled={isSavingOAuth}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: '#ea4335',
                      color: 'white',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isSavingOAuth ? 'not-allowed' : 'pointer',
                      marginTop: '4px'
                    }}
                  >
                    {isSavingOAuth ? 'Kaydediliyor...' : 'OAuth Bilgilerini Kaydet'}
                  </button>
                </div>

                <button
                  onClick={handleSavePreferences}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Güvenlik Ayarlarını Uygula
                </button>
              </div>
            )}

            {/* TAB: NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      🔔 Masaüstü Bildirimleri
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Yeni gelen e-postalarda işletim sistemi masaüstü bildirim afişi göster.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={desktopNotifications}
                    onChange={e => setDesktopNotifications(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Bildirim Sesi
                  </label>
                  <select
                    value={notificationSound}
                    onChange={e => setNotificationSound(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value="subtle">Zarif Zil (Subtle Chime)</option>
                    <option value="bell">Modern Bildirim (Modern Bell)</option>
                    <option value="none">Sessiz (Yalnızca Görsel)</option>
                  </select>
                </div>

                <button
                  onClick={handleSavePreferences}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Bildirim Ayarlarını Kaydet
                </button>
              </div>
            )}

            {/* TAB: BACKUP & DATA */}
            {activeTab === 'backup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    📦 Hesapları ve Ayarları Dışa Aktar (JSON Yedek)
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Tüm e-posta hesaplarınızı, imzalarınızı ve ayarlarınızı güvenli bir JSON yedeği olarak indirin.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const backup = await api.exportBackup();
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
                        const downloadAnchor = document.createElement('a');
                        downloadAnchor.setAttribute("href", dataStr);
                        downloadAnchor.setAttribute("download", `postaci_backup_${new Date().toISOString().split('T')[0]}.json`);
                        document.body.appendChild(downloadAnchor);
                        downloadAnchor.click();
                        downloadAnchor.remove();
                        success('Tam yedek dosyası indirildi!');
                      } catch (err: any) {
                        error(err.message || 'Yedek oluşturulamadı.');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={14} />
                    <span>Yedeği İndir (.json)</span>
                  </button>
                </div>

                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    📥 Yedekten Geri Yükle (Import JSON)
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Daha önce aldığınız bir `.json` yedek dosyasını yükleyerek hesaplarınızı tek tıkla geri getirin.
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleFileImport}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-primary)',
                      border: 'none',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <UploadCloud size={14} />
                    <span>{isImporting ? 'Geri Yükleniyor...' : 'Yedek Dosyası Seç & Yükle'}</span>
                  </button>
                </div>

                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--accent-danger)', marginBottom: '4px' }}>
                    ⚠️ Veritabanını Sıfırla & Fabrika Ayarları
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Yerel veritabanındaki tüm önbellek ve kayıtları silerek uygulamayı ilk kurulum haline getirir.
                  </p>
                  <button
                    onClick={async () => {
                      if (window.confirm('Tüm hesaplar, e-postalar ve yerel veritabanı tamamen silinecektir. Fabrika ayarlarına sıfırlamak istiyor musunuz?')) {
                        try {
                          await api.resetDatabase();
                          success('Veritabanı ve tüm hesaplar başarıyla sıfırlandı!');
                          refreshAccounts();
                          setTimeout(() => window.location.reload(), 500);
                        } catch (err: any) {
                          error(err.message || 'Sıfırlama hatası');
                        }
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-danger)',
                      border: 'none',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Veritabanını Sıfırla (Temiz Kurulum)
                  </button>
                </div>
              </div>
            )}

            {/* TAB: UPDATES (GITHUB RELEASES) */}
            {activeTab === 'updates' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                        Postacı Güncelleme Denetleyicisi
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Mevcut Kurulu Sürüm: <strong style={{ color: 'var(--accent-primary)' }}>v{APP_VERSION}</strong>
                      </div>
                    </div>

                    <button
                      onClick={handleCheckUpdate}
                      disabled={isCheckingUpdate}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
                      <span>{isCheckingUpdate ? 'Denetleniyor...' : 'Güncellemeleri Denetle'}</span>
                    </button>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>GitHub Deposu:</span>
                    <input
                      type="text"
                      value={updateRepo}
                      onChange={e => setUpdateRepo(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>

                {updateResult && (
                  <div style={{
                    backgroundColor: updateResult.updateAvailable ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${updateResult.updateAvailable ? 'var(--accent-success)' : 'var(--border-subtle)'}`,
                  }}>
                    {updateResult.updateAvailable ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-success)', fontWeight: 700, fontSize: '14px' }}>
                          <CheckCircle2 size={18} />
                          <span>Yeni Sürüm Mevcut: {updateResult.releaseName || `v${updateResult.latestVersion}`}</span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {updateResult.releaseNotes}
                        </p>
                        {updateResult.downloadUrl && (
                          <a
                            href={updateResult.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              alignSelf: 'flex-start',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              backgroundColor: 'var(--accent-success)',
                              color: 'white',
                              borderRadius: 'var(--radius-sm)',
                              textDecoration: 'none',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            <Download size={14} />
                            <span>Yeni Sürümü İndir (.exe)</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '13px' }}>
                        <CheckCircle2 size={16} color="var(--accent-success)" />
                        <span>{updateResult.releaseNotes || 'En güncel Postacı sürümünü kullanmaktasınız.'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB: SHORTCUTS */}
            {activeTab === 'shortcuts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { key: 'j / k veya ↓ / ↑', label: 'E-postalar arasında gezin' },
                    { key: 'c', label: 'Yeni E-Posta Oluştur (Compose)' },
                    { key: 'r', label: 'Seçili e-postayı yanıtla' },
                    { key: 'a / Shift+R', label: 'Herkese yanıtla (Reply All)' },
                    { key: 'f', label: 'E-postayı ilet (Forward)' },
                    { key: 'e / y', label: 'E-postayı arşivle' },
                    { key: '# / Delete', label: 'Çöp Kutusuna Taşı / Kalıcı Sil' },
                    { key: 's', label: 'Yıldızla / Yıldızı Kaldır' },
                    { key: 'u', label: 'Okundu / Okunmadı olarak değiştir' },
                    { key: 'Ctrl + K', label: 'Evrensel Komut Paleti' },
                    { key: '?', label: 'Klavye Kısayolları Kılavuzu' },
                  ].map(s => (
                    <div
                      key={s.key}
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.label}</span>
                      <kbd className="kbd-badge">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: ABOUT */}
            {activeTab === 'about' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '10px 0 30px 0' }}>
                {/* Hero Header Card */}
                <div style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(139, 92, 246, 0.12) 50%, rgba(16, 185, 129, 0.08) 100%)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '32px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '-50px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '240px',
                    height: '240px',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, rgba(0, 0, 0, 0) 70%)',
                    pointerEvents: 'none',
                    zIndex: 0
                  }} />

                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      padding: '12px',
                      borderRadius: '24px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25), inset 0 0 0 1px rgba(255, 255, 255, 0.15)',
                    }}>
                      <PostaciLogo size={68} />
                    </div>

                    <div>
                      <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                        Postacı — Yeni Nesil E-Posta İstemcisi
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--accent-primary)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}>
                          v{APP_VERSION} Stabil
                        </span>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: '1px solid var(--border-subtle)',
                        }}>
                          MIT Açık Kaynak
                        </span>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: '1px solid var(--border-subtle)',
                        }}>
                          x64 Windows &amp; Linux Desktop
                        </span>
                      </div>
                    </div>

                    <p style={{ maxWidth: '580px', fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '4px 0 0 0' }}>
                      Postacı; ultra-hızlı IMAP/SMTP senkronizasyon motoru, yerleşik kimlik avı güvenlik kalkanı,
                      Superhuman klavye hakimiyeti ve yapay zekâ asistanı ile donatılmış bağımsız, modern bir e-posta istemcisidir.
                    </p>

                    {/* Author & Org Credit */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-subtle)',
                      marginTop: '4px',
                    }}>
                      <span>Geliştirici: <strong style={{ color: 'var(--text-primary)' }}>EEKILINC</strong> (<a href="mailto:ekilinc@mehmetakif.edu.tr" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>ekilinc@mehmetakif.edu.tr</a>)</span>
                      <span>•</span>
                      <span>Burdur Mehmet Akif Ersoy Üniversitesi</span>
                    </div>

                    {/* Action Links & GitHub Buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleOpenExternal('https://github.com/eekilinc/Postaci')}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-medium)',
                          color: 'var(--text-primary)',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-medium)'}
                      >
                        <GithubIcon size={16} />
                        GitHub Deposu
                        <ExternalLink size={13} color="var(--text-muted)" />
                      </button>

                      <button
                        onClick={() => handleOpenExternal('https://github.com/eekilinc/Postaci/releases')}
                        style={{
                          background: 'var(--accent-primary)',
                          border: 'none',
                          color: '#ffffff',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)',
                        }}
                      >
                        <Download size={15} />
                        Sürüm Notları &amp; İndir
                      </button>

                      <button
                        onClick={() => handleOpenExternal('https://github.com/eekilinc/Postaci/issues')}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-medium)',
                          color: 'var(--text-primary)',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <AlertCircle size={15} color="var(--accent-warning)" />
                        Geri Bildirim / Sorun Bildir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Core Architecture Highlights (4 Features Grid) */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    Temel Yetenekler &amp; Mimari Özellikler
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} color="var(--accent-warning)" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Ultra-Hızlı Senkronizasyon
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Asenkron çok kanallı IMAP bağlantı havuzu, SQLite yerel indeksleme ve anlık SSE bildirimleri ile gecikmesiz e-posta deneyimi.
                      </p>
                    </div>

                    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={16} color="var(--accent-success)" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Akıllı Güvenlik &amp; Gizlilik Kalkanı
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Yerleşik kimlik avı (phishing) algoritmaları, görünmez 1x1 izleme piksellerinin engellenmesi ve güvenli HTML sanitizasyonu.
                      </p>
                    </div>

                    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} color="var(--accent-purple)" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Postacı AI Asistanı
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Uzun iletileri saniyeler içinde özetler, toplantı ve görev maddelerini ayıklar ve bağlama uygun akıllı yanıt önerileri üretir.
                      </p>
                    </div>

                    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Keyboard size={16} color="var(--accent-primary)" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Superhuman Klavye Hakimiyeti
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Hızlı komut paleti (Ctrl+K), Gmail ve Superhuman tarzı 2 tuşlu akıllı kısayollar ile fareye ihtiyaç duymadan tam kontrol.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Open Source License (MIT) Card */}
                <div style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Scale size={18} color="var(--accent-primary)" />
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Yazılım Lisansı &amp; Kullanım Hakları (MIT License)
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--accent-success)',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      Açık Kaynak &amp; Özgür Yazılım
                    </span>
                  </div>

                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Postacı, <strong>MIT Lisansı</strong> altında yayınlanan açık kaynaklı ve bağımsız bir projedir. Bu yazılımı herhangi bir kısıtlama olmaksızın kullanma, değiştirme, kopyalama, birleştirme, yayınlama ve dağıtma hakkı ücretsiz olarak sunulmaktadır.
                  </p>

                  <div style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}>
                    Copyright (c) 2026 EEKILINC &amp; Postacı Contributors.<br />
                    THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
                  </div>
                </div>

                {/* Open Source Dependencies & Credits Table */}
                <div style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Code2 size={18} color="var(--accent-purple)" />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Kullanılan Açık Kaynak Kütüphaneler &amp; Teşekkürler
                    </span>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Postacı&apos;nın geliştirilmesinde emeği geçen ve açık kaynak ekosistemine katkı sağlayan projelere teşekkür ederiz:
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { name: 'Electron', role: 'Masaüstü Uygulama Platformu', license: 'MIT' },
                      { name: 'React 18 & TypeScript', role: 'Ön Yüz & Bileşen Mimarisi', license: 'MIT' },
                      { name: 'Vite', role: 'Yeni Nesil Hızlı Derleyici', license: 'MIT' },
                      { name: 'ImapFlow', role: 'Modern IMAP Protokol Motoru', license: 'MIT' },
                      { name: 'Nodemailer', role: 'SMTP ve OAuth2 Gönderim Motoru', license: 'MIT' },
                      { name: 'better-sqlite3 & sql.js', role: 'Yerel Veritabanı ve Önbellek', license: 'MIT' },
                      { name: 'DOMPurify', role: 'HTML Güvenliği & XSS Koruması', license: 'Apache-2.0' },
                      { name: 'Lucide Icons', role: 'Vektörel Modern İkon Seti', license: 'ISC' },
                    ].map((lib, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{lib.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lib.role}</div>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                          {lib.license}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System & Diagnostic Footer */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={14} />
                    <span>Ortam: <strong>Electron Desktop (Chromium + Node.js)</strong></span>
                    <span>•</span>
                    <span>Veri Tabanı: <strong>SQLite (Aktif)</strong></span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--accent-success)' }} />
                      Sistem Senkronize
                    </span>
                    <span>•</span>
                    <span>© 2026 Postacı</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
