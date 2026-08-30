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
  ArrowLeft
} from 'lucide-react';
import { useMail } from '../context/MailContext';
import { useTheme, Theme, AccentColor, Density } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Account, ViewLayout } from '../types';
import { PostaciLogo } from './PostaciLogo';

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

  const [selectedProviderKey, setSelectedProviderKey] = useState<string>('google');
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

  useEffect(() => {
    if (isSettingsOpen) {
      if (accounts.length === 0) {
        setIsFormOpen(true);
      } else if (!editingAccountId) {
        setIsFormOpen(false);
      }
    }
  }, [isSettingsOpen, accounts.length]);

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
        success('En güncel sürümü (v1.1.9) kullanıyorsunuz.');
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
    if ((window as any).desktop?.openExternal) {
      (window as any).desktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // OAuth credentials state
  const [googleAuthMode, setGoogleAuthMode] = useState<'oauth' | 'app_password'>('oauth');
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

  // Active polling listener when Google OAuth popup is active in browser
  useEffect(() => {
    if (!isWaitingOAuth) return;

    const initialAccountIds = new Set(accounts.map((a: Account) => a.id));
    const interval = setInterval(async () => {
      try {
        const currentAccounts = await api.getAccounts();
        const newAcc = currentAccounts.find((a: Account) => !initialAccountIds.has(a.id));
        if (newAcc) {
          setIsWaitingOAuth(false);
          await refreshAccounts();
          setActiveAccountId(newAcc.id);
          success(`${newAcc.email} hesabı başarıyla bağlandı! 🎉`, 'Giriş Başarılı');
          refreshEmails();
          refreshStats();
          triggerSync();
          setIsFormOpen(false);
          setIsSettingsOpen(false);
        }
      } catch {}
    }, 1200);

    return () => clearInterval(interval);
  }, [isWaitingOAuth, accounts, refreshAccounts, setActiveAccountId, refreshEmails, refreshStats, triggerSync, setIsSettingsOpen, success]);

  const handleStartGoogleOAuth = async () => {
    setIsSavingOAuth(true);
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
          setAccSmtpSecurity(disc.smtpSecure ? 'STARTTLS' : 'SSL');
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
    setAccSmtpSecurity(acc.smtpSecure ? 'STARTTLS' : 'SSL');
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
    const cleanImapUser = accImapUser.trim();
    const cleanSmtpUser = (useSameCredentials ? accImapUser : accSmtpUser).trim();
    const cleanEmail = accEmail.trim();

    if (!cleanEmail || !cleanImapHost || !cleanImapUser || !accImapPass) {
      error('Lütfen zorunlu alanları doldurun.');
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
        success('Yeni hesap eklendi. İlk senkronizasyon arka planda başlatıldı...');
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
    <div style={{
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
                onClick={() => { setActiveTab(tab.id as any); setIsFormOpen(false); }}
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
            Postacı Desktop v1.1.9
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
              onClick={() => setIsSettingsOpen(false)}
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
              <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
                {/* 1. HEADER WITH BACK BUTTON */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => { setIsFormOpen(false); setEditingAccountId(null); setIsWaitingOAuth(false); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <span>← Hesaplara Dön</span>
                    </button>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {editingAccountId ? 'Hesap Ayarlarını Düzenle' : 'Yeni E-Posta Hesabı Ekle'}
                      </h4>
                    </div>
                  </div>
                </div>

                {/* 2. PRIMARY EMAIL INPUT (SMART REAL-TIME DETECT) */}
                <div style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📧 E-Posta Adresiniz *</span>
                    </label>
                    <div style={{ fontSize: '11px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isAutoDiscovering ? (
                        <>
                          <Sparkles size={12} className="animate-pulse" />
                          <span>Sunucu ayarları algılanıyor...</span>
                        </>
                      ) : (
                        <span>✨ Sağlayıcı otomatik algılanır</span>
                      )}
                    </div>
                  </div>

                  <input
                    type="email"
                    required
                    placeholder="Örn: adiniz@gmail.com, adiniz@outlook.com veya adiniz@sirket.com"
                    value={accEmail}
                    onChange={e => setAccEmail(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-medium)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                    }}
                  />

                  {/* Provider Pills Row */}
                  {!editingAccountId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Seçili Sağlayıcı:</span>
                      {Object.entries(PROVIDER_PRESETS).map(([key, p]) => {
                        const isSelected = selectedProviderKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleSelectProviderPreset(key)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '20px',
                              backgroundColor: isSelected ? p.color : 'var(--bg-secondary)',
                              border: isSelected ? `1px solid ${p.color}` : '1px solid var(--border-subtle)',
                              color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                              fontSize: '11px',
                              fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? `0 2px 8px ${p.color}44` : 'none'
                            }}
                          >
                            <span>{p.icon}</span>
                            <span>{p.name.split(' ')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. DYNAMIC AUTHENTICATION FLOW */}
                {!editingAccountId && selectedProviderKey === 'google' && googleAuthMode === 'oauth' ? (
                  /* GOOGLE 1-CLICK OAUTH HERO CARD */
                  isWaitingOAuth ? (
                    <div style={{
                      padding: '24px',
                      borderRadius: 'var(--radius-md)',
                      background: 'linear-gradient(135deg, rgba(234, 67, 53, 0.15) 0%, rgba(66, 133, 244, 0.15) 100%)',
                      border: '2px solid rgba(234, 67, 53, 0.5)',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: '#ea4335',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 20px rgba(234, 67, 53, 0.6)',
                        fontSize: '22px'
                      }}>
                        🔴
                      </div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Tarayıcınızda Google Girişi Bekleniyor...
                      </h4>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.5 }}>
                        Lütfen açılan Google sekmesinde <strong>{accEmail || 'hesabınızı'}</strong> seçip izin verin. Onay verdiğiniz anda bu pencere <strong>otomatik olarak kapanacak</strong> ve gelen kutunuz açılacaktır.
                      </p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <button
                          type="button"
                          onClick={handleStartGoogleOAuth}
                          style={{
                            padding: '7px 16px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          🔗 Sekmeyi Tekrar Aç
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsWaitingOAuth(false)}
                          style={{
                            padding: '7px 16px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          ✕ İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px',
                      borderRadius: 'var(--radius-md)',
                      background: 'linear-gradient(135deg, rgba(234, 67, 53, 0.12) 0%, rgba(66, 133, 244, 0.12) 100%)',
                      border: '1px solid rgba(234, 67, 53, 0.4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🔴</span>
                            <span>Google (Gmail) ile Hızlı Giriş Yap</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            OAuth 2.0 güvenli bağlantı: Şifre yazmanıza gerek yoktur, tarayıcınızdan tek tıkla yetkilendirin.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleStartGoogleOAuth}
                          disabled={isSavingOAuth}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 22px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: '#ea4335',
                            color: 'white',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: isSavingOAuth ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 4px 16px rgba(234, 67, 53, 0.45)'
                          }}
                        >
                          <ExternalLink size={16} />
                          <span>{isSavingOAuth ? 'Açılıyor...' : '🚀 Google ile Bağlan'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Tarayıcı yerine klasik 16 haneli Uygulama Şifresi mi kullanmak istiyorsunuz?
                        </span>
                        <button
                          type="button"
                          onClick={() => setGoogleAuthMode('app_password')}
                          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          🔑 Uygulama Şifresi ile Giriş
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* PASSWORD & CUSTOM CREDENTIALS FLOW */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Guidance / Help Banner for specific providers */}
                    {selectedProviderKey !== 'custom' && PROVIDER_PRESETS[selectedProviderKey]?.helpUrl && (
                      <div style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: `1px solid ${PROVIDER_PRESETS[selectedProviderKey]?.color || 'var(--border-subtle)'}44`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{PROVIDER_PRESETS[selectedProviderKey]?.icon}</span>
                            <span>{PROVIDER_PRESETS[selectedProviderKey]?.name} Parola Bilgisi</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {PROVIDER_PRESETS[selectedProviderKey]?.helpText}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenExternal(PROVIDER_PRESETS[selectedProviderKey].helpUrl!)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: PROVIDER_PRESETS[selectedProviderKey].color,
                            color: 'white',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>{PROVIDER_PRESETS[selectedProviderKey].helpTitle}</span>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    )}

                    {selectedProviderKey === 'google' && googleAuthMode === 'app_password' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setGoogleAuthMode('oauth')}
                          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          ← Tek Tıkla Google OAuth Moduna Geri Dön
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Parola {selectedProviderKey !== 'custom' ? '(veya Uygulama Şifresi)' : ''} *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••••••"
                          value={accImapPass}
                          onChange={e => {
                            setAccImapPass(e.target.value);
                            if (useSameCredentials) setAccSmtpPass(e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hesap Görünen Adı</label>
                        <input
                          type="text"
                          placeholder="Kişisel / İş / Okul"
                          value={accName}
                          onChange={e => setAccName(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hesap Rengi:</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="color"
                          value={accColor}
                          onChange={e => setAccColor(e.target.value)}
                          style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{accColor}</span>
                      </div>
                    </div>

                    {/* ADVANCED SERVER CONFIG ACCORDION */}
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 0',
                        }}
                      >
                        <span>{showAdvancedSettings ? '▲ Sunucu Ayarlarını Gizle' : '⚙️ Gelişmiş Sunucu Ayarları (IMAP / SMTP Host & Portları)'}</span>
                      </button>

                      {showAdvancedSettings && (
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* IMAP */}
                          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <h5 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Gelen Posta (IMAP)</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>IMAP Sunucu</label>
                                <input
                                  type="text"
                                  value={accImapHost}
                                  onChange={e => setAccImapHost(e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Port</label>
                                <input
                                  type="number"
                                  value={accImapPort || ''}
                                  onChange={e => setAccImapPort(e.target.value ? Number(e.target.value) : ('' as any))}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Güvenlik</label>
                                <select
                                  value={accImapSecurity}
                                  onChange={e => setAccImapSecurity(e.target.value as any)}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                >
                                  <option value="SSL">SSL / TLS</option>
                                  <option value="STARTTLS">STARTTLS</option>
                                  <option value="NONE">Yok</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>IMAP Kullanıcı Adı (Boşsa e-posta kullanılır)</label>
                              <input
                                type="text"
                                placeholder={accEmail || 'kullanıcı@alanadi.com'}
                                value={accImapUser}
                                onChange={e => setAccImapUser(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                              />
                            </div>
                          </div>

                          {/* SMTP */}
                          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <h5 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Giden Posta (SMTP)</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>SMTP Sunucu</label>
                                <input
                                  type="text"
                                  value={accSmtpHost}
                                  onChange={e => setAccSmtpHost(e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Port</label>
                                <input
                                  type="number"
                                  value={accSmtpPort || ''}
                                  onChange={e => setAccSmtpPort(e.target.value ? Number(e.target.value) : ('' as any))}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Güvenlik</label>
                                <select
                                  value={accSmtpSecurity}
                                  onChange={e => setAccSmtpSecurity(e.target.value as any)}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                                >
                                  <option value="STARTTLS">STARTTLS</option>
                                  <option value="SSL">SSL / TLS</option>
                                  <option value="NONE">Yok</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Test Result Message */}
                    {testResult && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${testResult.success ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
                        fontSize: '12px',
                        color: testResult.success ? 'var(--accent-success)' : 'var(--accent-danger)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{testResult.message}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-medium)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isTesting ? 'Test Ediliyor...' : '⚡ Bağlantıyı Sına'}
                      </button>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={handleResetForm}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          İptal
                        </button>
                        <button
                          type="submit"
                          disabled={isSaving}
                          style={{
                            padding: '10px 20px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-primary)',
                            border: 'none',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)'
                          }}
                        >
                          <Save size={15} />
                          <span>{isSaving ? 'Kaydediliyor...' : editingAccountId ? 'Değişiklikleri Kaydet' : '🚀 Hesabı Kaydet'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </form>
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
                      if (window.confirm('Veritabanı sıfırlanacaktır. Devam etmek istiyor musunuz?')) {
                        try {
                          await api.resetDatabase();
                          success('Veritabanı başarıyla sıfırlandı!');
                          refreshAccounts();
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
                    Veritabanını Sıfırla
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
                        Mevcut Kurulu Sürüm: <strong style={{ color: 'var(--accent-primary)' }}>v1.1.9</strong>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 0', gap: '14px' }}>
                <PostaciLogo size={64} />

                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Postacı E-Posta İstemcisi Pro
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Sürüm 1.1.9 (x64 Windows & Linux Desktop)
                  </p>
                </div>

                <p style={{ maxWidth: '480px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Postacı; yüksek hızlı IMAP/SMTP senkronizasyonu, akıllı kimlik avı kalkanı, Superhuman klavye kısayolları ve modern masaüstü e-posta deneyimi sunar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
