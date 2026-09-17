const { app, BrowserWindow, ipcMain, safeStorage, dialog, Notification, nativeImage, Tray, Menu, MenuItem, shell } = require('electron');

// 1. Uygulama Adı ve Kimliği (Windows Bildirimlerinde ve Başlığında 'electron' yazmasını engeller)
app.name = 'Postacı';
try {
  app.setName('Postacı');
} catch {}

// 2. Tekil Örnek Kilidi (Single Instance Lock)
// Bildirime tıklandığında veya ikinci kez tıklandığında boş bir Electron penceresi açılmasını kesin olarak engeller
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 3. Beklenmedik Hata ve Promise Korumaları (Production Crash Prevention)
process.on('uncaughtException', (err) => {
  console.error('[process] Yakalanmamış İstisna (Uncaught Exception):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] İşlenmemiş Promise Reddi (Unhandled Rejection):', reason);
});

// 4. Windows Görev Çubuğu ve Bildirim Eşleşmesi (AUMID)
try {
  app.setAppUserModelId('com.postaci.app');
} catch {}

const path = require('path');
const fs = require('fs');
const { initDb, getDb, getStats, getDbPath, vacuumDb, listAccounts, getAccountById, getAccountByEmail, updateAccount, deleteAccount, updateTokens, addAccount, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, saveMessageBody, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, searchContacts, listContacts, upsertContact, deleteContact, saveSentMessage, saveDraftMessage, listAttachments, saveAttachments, getSetting, setSetting, getAllUnreadCounts } = require('./electron/db.cjs');
const { startOAuthFlow } = require('./electron/auth.cjs');
const { refreshAccessToken, emailFromIdToken, fetchProfileEmail, syncInbox, syncFolder, fetchBody, fetchAttachment, markSeen, markUnseen, createTransporter, buildRaw, sendRaw, appendToSent, verifyImap, listFolders, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, moveToFolder, batchMoveToFolder, withClient } = require('./electron/mail.cjs');
const { detectSettings } = require('./electron/providers.cjs');
const { splitAddresses, buildReply, buildReplyAll, buildForward } = require('./electron/compose.cjs');

function enc(text) {
  if (!text) return null;
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(text, 'utf8').toString('base64');
  return safeStorage.encryptString(text).toString('base64');
}

function dec(b64) {
  if (!b64) return null;
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(b64, 'base64').toString('utf8');
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
}

const _tokenRefreshPromises = new Map(); // email -> Promise<accessToken>

async function freshAccessToken(account, forceRefresh = false) {
  const key = (account.email || '').toLowerCase().trim();

  // Halihazırda bu hesap için bir yenileme isteği devam ediyorsa onu bekle
  if (_tokenRefreshPromises.has(key)) {
    return _tokenRefreshPromises.get(key);
  }

  const existing = dec(account.access_token_enc);
  if (!forceRefresh && existing && account.token_expiry) {
    const expiresAt = new Date(account.token_expiry).getTime();
    if (Date.now() < expiresAt - 2 * 60 * 1000) {
      return existing;
    }
  }

  // Token süresi dolmuş veya zorunlu yenileme — tekil promise ile yenile
  const refreshTask = (async () => {
    const latestAcc = getAccountByEmail(account.email) || account;
    const refreshToken = dec(latestAcc.refresh_token_enc);
    if (!refreshToken) throw new Error('Refresh token yok, hesabı yeniden bağlayın.');

    try {
      const tokens = await refreshAccessToken(account.provider, refreshToken);
      const expiry = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;
      updateTokens(account.email, {
        refreshTokenEnc: enc(tokens.refresh_token || refreshToken),
        accessTokenEnc: enc(tokens.access_token),
        tokenExpiry: expiry,
      });
      return tokens.access_token;
    } catch (e) {
      const isStillValid = existing && account.token_expiry && (Date.now() < new Date(account.token_expiry).getTime());
      if (isStillValid) {
        console.warn(`[token] Yenileme başarısız (${e?.message}), mevcut geçerli token deneniyor.`);
        return existing;
      }
      throw new Error(`Token yenilenemedi: ${e?.message || e}. İnternet bağlantınızı kontrol edin veya hesabı yeniden bağlayın.`);
    } finally {
      _tokenRefreshPromises.delete(key);
    }
  })();

  _tokenRefreshPromises.set(key, refreshTask);
  return refreshTask;
}

// Hesap türüne göre bağlantı bilgileri: { accessToken } ya da { password, imapHost, imapPort }
async function freshCredentials(account, forceRefresh = false) {
  if (account.auth_type === 'password') {
    let passwordEnc = account.password_enc;
    if (!passwordEnc) {
      const fullAcc = (account.id ? getAccountById(account.id) : null) || getAccountByEmail(account.email);
      if (fullAcc?.password_enc) passwordEnc = fullAcc.password_enc;
    }
    const password = dec(passwordEnc);
    if (!password) throw new Error('Kayıtlı şifre yok, hesabı yeniden ekleyin.');
    return { password, imapHost: account.imap_host, imapPort: account.imap_port };
  }
  return { accessToken: await freshAccessToken(account, forceRefresh) };
}

// Yakın zamanda silinen mesajlar — sync'in bunları tekrar eklemesini önler
// format: 'email:folderPath:uid' → expiry timestamp
const deletedUidCache = new Map();
function markDeleted(email, folderPath, uid) {
  const key = `${email}:${folderPath}:${uid}`;
  deletedUidCache.set(key, Date.now() + 5 * 60 * 1000); // 5 dakika TTL
}
function isDeleted(email, folderPath, uid) {
  const key = `${email}:${folderPath}:${uid}`;
  const exp = deletedUidCache.get(key);
  if (!exp) return false;
  if (Date.now() > exp) { deletedUidCache.delete(key); return false; }
  return true;
}

// Son kullanıcı senkronizasyon zamanı — arka plan sync'in aktif kullanıcıyla yarışmasını önler
const _lastSyncTime = new Map(); // email -> timestamp

// ── Per-account IMAP seri kuyruğu ──────────────────────────────────────────
// Gmail/Outlook hesap başına eşzamanlı bağlantı limitlerine sahiptir.
// Bu yapı aynı hesaba ait işlemleri sıralayıp 'User is authenticated but not connected'
// kilitlerini önler (concurrency = 1 per account).
const _imapQueues = new Map(); // email → Promise (kuyruk sonu)
function imapLock(email, fn) {
  const key = (email || '').toLowerCase().trim();
  const prev = _imapQueues.get(key) ?? Promise.resolve();
  const task = prev.then(async () => {
    await new Promise((r) => setTimeout(r, 200)); // Exchange proxy oturum kilidi için güvenlik payı
    return fn();
  }, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return fn();
  });
  _imapQueues.set(key, task.then(() => {}, () => {})); // kuyruk sonunu güncelle, hata yutma
  return task; // çağırıcıya gerçek sonuç / hata döner
}

function resolveAppIcon(preferIco = true) {
  const filenames = preferIco ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  const dirs = [
    // 1. Packaged extraResources (Fiziksel disk yolu - Win32 Shell ve görev çubuğu için asar dışı doğrudan erişim)
    process.resourcesPath || null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'public') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'build') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'public') : null,
    // 2. Geliştirme modu yolları
    path.join(__dirname, 'build'),
    path.join(__dirname, 'public'),
    path.join(__dirname, 'dist'),
    __dirname,
  ].filter(Boolean);

  for (const f of filenames) {
    for (const d of dirs) {
      const full = path.join(d, f);
      try {
        if (fs.existsSync(full)) return full;
      } catch {}
    }
  }
  return null;
}

function ensureWindowsShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (!fs.existsSync(startMenuDir)) fs.mkdirSync(startMenuDir, { recursive: true });

    // 1. Electron.lnk kalıntısını temizle
    const electronLnk = path.join(startMenuDir, 'Electron.lnk');
    if (fs.existsSync(electronLnk)) {
      try { fs.unlinkSync(electronLnk); } catch {}
    }

    // 2. Hem ASCII (Postaci.lnk) hem de Türkçe (Postacı.lnk) kısayollarını AppUserModelId ile garantiye al
    // Windows 10/11 WinRT ToastNotificationManager AUMID eşleşmesini bu kısayollar üzerinden doğrular
    const icoPath = resolveAppIcon(true) || resolveAppIcon(false) || process.execPath;
    const target = process.execPath;
    const args = !app.isPackaged ? `"${path.resolve(__dirname)}"` : '';

    const lnkNames = ['Postaci.lnk', 'Postacı.lnk'];
    for (const lnkName of lnkNames) {
      try {
        const lnkPath = path.join(startMenuDir, lnkName);
        if (fs.existsSync(lnkPath)) {
          try {
            const existing = shell.readShortcutLink(lnkPath);
            if (existing.target !== target || !fs.existsSync(existing.target)) {
              fs.unlinkSync(lnkPath);
            }
          } catch {}
        }
        shell.writeShortcutLink(lnkPath, fs.existsSync(lnkPath) ? 'replace' : 'create', {
          target,
          args,
          appUserModelId: 'com.postaci.app',
          icon: icoPath,
          iconIndex: 0,
          description: 'Postacı — Masaüstü E-posta İstemcisi',
        });
      } catch (errInner) {
        console.warn(`[shortcut] ${lnkName} oluşturulamadı:`, errInner?.message);
      }
    }

    // 3. Windows Bildirim İzinlerini ve AUMID Kimliğini Registry'ye yaz (ShowBanner = 1, Enabled = 1)
    try {
      const { exec } = require('child_process');
      const regCmds = [
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v Enabled /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v ShowBanner /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v ShowInActionCenter /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.postaci.app" /v DisplayName /t REG_SZ /d "Postacı" /f`,
        `reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.postaci.app" /v ShowInSettings /t REG_DWORD /d 1 /f`,
      ];
      exec(regCmds.join(' & '), () => {});
    } catch {}

    ensureProtocolRegistration();
  } catch (err) {
    console.warn('[shortcut] Kısayol yönetimi uyarısı:', err?.message);
  }
}

function ensureProtocolRegistration() {
  try {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('postaci', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('postaci');
    }

    if (process.platform === 'win32') {
      const target = process.execPath;
      const args = !app.isPackaged ? `"${path.resolve(__dirname)}" "%1"` : `"%1"`;
      const openCmd = `\\"${target}\\" ${args}`;
      const { exec } = require('child_process');
      const cmds = [
        `reg add "HKCU\\Software\\Classes\\postaci" /ve /t REG_SZ /d "URL:Postacı Protocol" /f`,
        `reg add "HKCU\\Software\\Classes\\postaci" /v "URL Protocol" /t REG_SZ /d "" /f`,
        `reg add "HKCU\\Software\\Classes\\postaci\\shell\\open\\command" /ve /t REG_SZ /d "${openCmd}" /f`,
      ];
      exec(cmds.join(' & '), () => {});
    }
  } catch (err) {
    console.warn('[protocol] Protokol kaydı uyarısı:', err?.message);
  }
}

function syncStartupSettings(launchOnStartup, startMinimized) {
  if (process.platform !== 'win32') return;
  try {
    const isPackaged = app.isPackaged;
    const target = process.execPath;
    const argList = isPackaged
      ? (startMinimized ? ['--minimized'] : [])
      : [path.resolve(__dirname), ...(startMinimized ? ['--minimized'] : [])];
    const argsStr = argList.length > 0 ? ' ' + argList.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ') : '';

    // 1. Electron yerleşik LoginItemSettings API'si
    try {
      app.setLoginItemSettings({
        openAtLogin: !!launchOnStartup,
        path: target,
        args: isPackaged ? (startMinimized ? ['--minimized'] : []) : [],
      });
    } catch (errLogin) {
      console.warn('[startup] app.setLoginItemSettings uyarısı:', errLogin?.message);
    }

    const { exec } = require('child_process');

    // 2. Windows Registry HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    if (launchOnStartup) {
      const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Postaci" /t REG_SZ /d "\\"${target}\\"${argsStr}" /f`;
      const regCmdAumid = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.postaci.app" /t REG_SZ /d "\\"${target}\\"${argsStr}" /f`;

      // 3. Windows Explorer StartupApproved\\Run (020000000000000000000000 = Etkin)
      const approvedCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "Postaci" /t REG_BINARY /d "020000000000000000000000" /f`;
      const approvedCmdAumid = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "com.postaci.app" /t REG_BINARY /d "020000000000000000000000" /f`;

      exec([regCmd, regCmdAumid, approvedCmd, approvedCmdAumid].join(' & '), () => {});
    } else {
      const delCmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Postaci" /f`;
      const delCmdAumid = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.postaci.app" /f`;
      const delApproved = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "Postaci" /f`;
      const delApprovedAumid = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "com.postaci.app" /f`;

      exec([delCmd, delCmdAumid, delApproved, delApprovedAumid].join(' & '), () => {});
    }

    // 4. Windows Başlangıç Klasörü (%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Postaci.lnk)
    const startupDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    if (!fs.existsSync(startupDir)) fs.mkdirSync(startupDir, { recursive: true });

    const startupLnkNames = ['Postaci.lnk', 'Postacı.lnk'];
    if (launchOnStartup) {
      const icoPath = resolveAppIcon(true) || resolveAppIcon(false) || target;
      const lnkPath = path.join(startupDir, 'Postaci.lnk');
      try {
        shell.writeShortcutLink(lnkPath, fs.existsSync(lnkPath) ? 'replace' : 'create', {
          target,
          args: argsStr.trim(),
          appUserModelId: 'com.postaci.app',
          icon: icoPath,
          iconIndex: 0,
          description: 'Postacı — Masaüstü E-posta İstemcisi',
        });
        const approvedFolderCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder" /v "Postaci.lnk" /t REG_BINARY /d "020000000000000000000000" /f`;
        exec(approvedFolderCmd, () => {});
      } catch (errLnk) {
        console.warn('[startup] Startup kısayolu oluşturulamadı:', errLnk?.message);
      }
    } else {
      for (const name of startupLnkNames) {
        const lnkPath = path.join(startupDir, name);
        if (fs.existsSync(lnkPath)) {
          try { fs.unlinkSync(lnkPath); } catch {}
        }
      }
      const delFolderApproved = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder" /v "Postaci.lnk" /f`;
      exec(delFolderApproved, () => {});
    }
  } catch (err) {
    console.warn('[startup] syncStartupSettings hatası:', err?.message);
  }
}

function isInQuietHours() {
  try {
    const settings = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 0.5,
      soundEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
    if (!settings.quietHoursEnabled) return false;

    const now = new Date();
    const curMins = now.getHours() * 60 + now.getMinutes();

    const [sH, sM] = (settings.quietHoursStart || '22:00').split(':').map(Number);
    const [eH, eM] = (settings.quietHoursEnd || '08:00').split(':').map(Number);
    const startMins = (sH || 0) * 60 + (sM || 0);
    const endMins = (eH || 0) * 60 + (eM || 0);

    if (startMins <= endMins) {
      return curMins >= startMins && curMins < endMins;
    } else {
      // Gece boyu sessiz saatler (Örn: 22:00 -> 08:00)
      return curMins >= startMins || curMins < endMins;
    }
  } catch {
    return false;
  }
}

function showDesktopNotification({ title, body, email, folderPath, uid, silent: _silent = false }) {
  try {
    if (isInQuietHours()) {
      console.log('[notification] Sessiz saatler devrede — bildirim susturuldu.');
      return;
    }

    // 1. Windows platformunda doğrudan garantili WinRT Toast API (PowerShell / WinRT köprüsü)
    // Bu yöntem Windows 10/11'de hem odak durumunda hem arka planda ekranda afiş (Toast Banner) çıkarır ve Win+N İşlem Merkezi'ne yazar
    if (process.platform === 'win32') {
      try {
        const cleanTitle = String(title || 'Postacı')
          .replace(/[\r\n\t]/g, ' ')
          .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
        const cleanBody = String(body || 'Yeni e-posta alındı.')
          .replace(/[\r\n\t]/g, ' ')
          .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
        const notifIcon = resolveAppIcon(false) || resolveAppIcon(true);
        const iconXml = notifIcon && fs.existsSync(notifIcon) && notifIcon.toLowerCase().endsWith('.png')
          ? `<image placement="appLogoOverride" hint-crop="circle" src="${notifIcon.replace(/\\/g, '/')}" />`
          : '';

        const encEmail = encodeURIComponent(email || '');
        const encFolder = encodeURIComponent(folderPath || 'INBOX');
        const encUid = encodeURIComponent(String(uid || ''));
        const launchUrl = `postaci://open-message?email=${encEmail}&amp;folderPath=${encFolder}&amp;uid=${encUid}`;

        const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast scenario="reminder" activationType="protocol" launch="${launchUrl}"><visual><binding template="ToastGeneric"><text>${cleanTitle}</text><text>${cleanBody}</text>${iconXml}</binding></visual><actions><action content="E-postayı Aç" arguments="${launchUrl}" activationType="protocol" /></actions></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Priority = [Windows.UI.Notifications.ToastNotificationPriority]::High
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('com.postaci.app').Show($toast)
`;
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        const { exec } = require('child_process');
        exec(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, (err) => {
          if (err) console.warn('[win-toast] WinRT Toast uyarısı:', err?.message);
        });
      } catch (e) {
        console.warn('[win-toast] PowerShell WinRT hatası:', e);
      }
    }

    // 2. Electron Notification Fallback (İşletim sistemi tıklama dinleyicisi için)
    if (Notification.isSupported()) {
      const notifIcon = resolveAppIcon(false);
      const notif = new Notification({
        title: title || 'Postacı',
        body: body || 'Yeni e-posta alındı.',
        icon: (notifIcon && notifIcon.toLowerCase().endsWith('.png')) ? notifIcon : undefined,
        silent: true,
        urgency: 'critical',
      });

      _activeNotifications.add(notif);
      const cleanup = () => {
        _activeNotifications.delete(notif);
      };
      notif.on('close', cleanup);
      notif.on('failed', cleanup);

      notif.on('click', () => {
        cleanup();
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        } else {
          mainWindow.setSkipTaskbar(false);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.setAlwaysOnTop(true);
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(false);
          if (email && mainWindow.webContents) {
            mainWindow.webContents.send('notify:open-message', {
              email,
              folderPath: folderPath || 'INBOX',
              uid: String(uid || ''),
            });
          }
        }
      });

      try {
        notif.show();
      } catch {}
    }
  } catch (err) {
    console.error('[notification] Hata:', err);
  }
}

function handleProtocolUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return;
  try {
    const clean = rawUrl.replace(/^["']|["']$/g, '').trim();
    const match = clean.match(/postaci:\/\/[^\s"']+/);
    if (!match) return;

    const parsed = new URL(match[0]);
    if (parsed.hostname === 'open-message' || parsed.pathname.includes('open-message')) {
      const email = parsed.searchParams.get('email');
      const folderPath = parsed.searchParams.get('folderPath') || 'INBOX';
      const uid = parsed.searchParams.get('uid') || '';

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(false);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
        mainWindow.setAlwaysOnTop(false);

        if (email && mainWindow.webContents) {
          mainWindow.webContents.send('notify:open-message', {
            email,
            folderPath,
            uid,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[protocol] URL ayrıştırma hatası:', err?.message);
  }
}

function notifyNewMessages(accountEmail, newMessages) {
  if (!newMessages || newMessages.length === 0) return;

  const settings = getSetting('notification_settings', {
    notificationsEnabled: true,
    syncIntervalMinutes: 0.5,
    soundEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  if (!settings.notificationsEnabled) return;

  // 1. Görev Çubuğunu Turuncu Yanıp Söndür (Taskbar Flash)
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
    try {
      mainWindow.flashFrame(true);
    } catch {}
  }

  // 2. Windows Masaüstü Toast Bildirimi
  if (newMessages.length === 1) {
    const m = newMessages[0];
    showDesktopNotification({
      title: `📧 ${m.from || accountEmail}`,
      body: m.subject || '(konusuz)',
      email: accountEmail,
      folderPath: 'INBOX',
      uid: m.uid,
      silent: !settings.soundEnabled,
    });
  } else {
    const last = newMessages[newMessages.length - 1];
    showDesktopNotification({
      title: `📧 ${accountEmail} (${newMessages.length} yeni e-posta)`,
      body: `${last.from ? last.from + ': ' : ''}${last.subject || '(konusuz)'}`,
      email: accountEmail,
      folderPath: 'INBOX',
      uid: last.uid,
      silent: !settings.soundEnabled,
    });
  }

  // 3. Renderer arayüzüne canlı bildirim ve ses tetikleyici gönder
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notify:new-mail', {
      email: accountEmail,
      folderPath: 'INBOX',
      count: newMessages.length,
      messages: newMessages,
    });
  }
}

let bgSyncTimer = null;
let bgSyncRunning = false;

async function runBackgroundSync() {
  if (bgSyncRunning) return;
  bgSyncRunning = true;
  try {
    const settings = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 0.5,
      soundEnabled: true,
    });

    if (!settings.syncIntervalMinutes || settings.syncIntervalMinutes <= 0) return;

    const accounts = listAccounts();
    if (!accounts || accounts.length === 0) return;

    for (const acc of accounts) {
      try {
        const fullAcc = getAccountByEmail(acc.email);
        if (!fullAcc) continue;
        const normEmail = (fullAcc.email || '').toLowerCase().trim();
        const lastSync = _lastSyncTime.get(normEmail) || 0;
        // Son 10 saniyede kullanıcı/arayüz zaten bu hesabı senkronize ettiyse arka planda tekrar çekme
        if (Date.now() - lastSync < 10000) {
          continue;
        }
        const creds = await freshCredentials(fullAcc);
        const res = await imapLock(fullAcc.email, () => syncFolder({
          provider: fullAcc.provider,
          email: fullAcc.email,
          folderPath: 'INBOX',
          db: getDb(),
          limit: 30,
          ...creds,
          skipUid: (uid) => isDeleted(fullAcc.email, 'INBOX', String(uid)),
        }));
        _lastSyncTime.set(normEmail, Date.now());

        if (res && res.newMessages && res.newMessages.length > 0) {
          notifyNewMessages(acc.email, res.newMessages);

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notify:background-synced', {
              email: acc.email,
              folderPath: 'INBOX',
              count: res.newMessages.length,
            });
          }
        }
      } catch (err) {
        console.warn(`[bg-sync] ${acc.email} senkronizasyon atlandı:`, err?.message || err);
      }
      await new Promise((r) => setTimeout(r, 800)); // sağlayıcılar arası sakin geçiş
    }
  } finally {
    bgSyncRunning = false;
  }
}

function updateBackgroundSyncSchedule() {
  if (bgSyncTimer) {
    clearInterval(bgSyncTimer);
    bgSyncTimer = null;
  }
  const settings = getSetting('notification_settings', {
    notificationsEnabled: true,
    syncIntervalMinutes: 0.5,
    soundEnabled: true,
  });

  const minutes = Number(settings.syncIntervalMinutes) || 0.5;
  if (minutes > 0) {
    const ms = Math.max(15000, Math.round(minutes * 60 * 1000));
    bgSyncTimer = setInterval(() => {
      runBackgroundSync().catch((e) => console.error('[bg-sync] hata:', e));
    }, ms);
    console.log(`[bg-sync] Arka plan senkronizasyonu devrede (${ms / 1000} sn aralıkla).`);
  } else {
    console.log('[bg-sync] Arka plan senkronizasyonu kapalı.');
  }
}

let isQuitting = false;
let tray = null;

function createTray() {
  if (tray && !tray.isDestroyed()) return;

  const icoPath = resolveAppIcon(true);
  const pngPath = resolveAppIcon(false);
  let trayImage = null;

  if (icoPath) {
    try {
      const img = nativeImage.createFromPath(icoPath);
      if (!img.isEmpty()) trayImage = img;
    } catch {}
  }
  if (!trayImage && pngPath) {
    try {
      const img = nativeImage.createFromPath(pngPath);
      if (!img.isEmpty()) trayImage = img;
    } catch {}
  }

  try {
    tray = new Tray(trayImage || icoPath || pngPath);
    tray.setToolTip('Postacı — E-posta İstemcisi');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Postacı\'yı Aç',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setSkipTaskbar(false);
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      {
        label: 'Yeni E-posta Yaz',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setSkipTaskbar(false);
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.webContents.send('cmd:compose');
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Tüm Hesapları Eşitle',
        click: () => {
          runBackgroundSync().catch(() => {});
        },
      },
      { type: 'separator' },
      {
        label: 'Tamamen Kapat (Çıkış)',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isMinimized()) {
            mainWindow.setSkipTaskbar(false);
            mainWindow.restore();
            mainWindow.focus();
          } else {
            mainWindow.focus();
          }
        } else {
          mainWindow.setSkipTaskbar(false);
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createWindow();
      }
    });

    tray.on('double-click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(false);
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('[tray] Sistem tepsisi simgesi oluşturulamadı:', err?.message);
  }
}

function createWindow() {
  const icoPath = resolveAppIcon(true);
  const pngPath = resolveAppIcon(false);
  const iconPath = icoPath || pngPath;

  let nativeImg = undefined;
  if (iconPath) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) nativeImg = img;
    } catch {}
  }

  const behavior = getSetting('app_behavior_settings', {
    launchOnStartup: false,
    startMinimized: false,
    hideTaskbarOnMinimize: true,
    closeToQuit: false,
    useGmailShortcuts: true,
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Postacı',
    // Windows'ta Win32 Shell doğrudan .ico dosya yolunu almalıdır
    icon: (process.platform === 'win32' && icoPath) ? icoPath : (nativeImg || iconPath || undefined),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.on('preload-error', (_evt, preloadPath, error) => {
    console.error('[preload] Preload script hatası:', preloadPath, error);
  });

  if (process.platform === 'win32' && icoPath) {
    try {
      win.setIcon(icoPath);
    } catch {}
  } else if (nativeImg) {
    try {
      win.setIcon(nativeImg);
    } catch {}
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow = win;

  // Dahili İmla / Yazım Denetimi (Native Spellchecker) Ayarı
  try {
    win.webContents.session.setSpellCheckerLanguages(['tr-TR', 'en-US']);
  } catch (e) {
    console.warn('[spellcheck] Diller ayarlanamadı:', e?.message);
  }

  // Yazılabilir alanlarda sağ tık imla önerileri ve pano menüsü
  win.webContents.on('context-menu', (_event, params) => {
    if (params.isEditable) {
      const menu = new Menu();

      // İmla Denetimi Kelime Önerileri
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          menu.append(
            new MenuItem({
              label: suggestion,
              click: () => win.webContents.replaceMisspelling(suggestion),
            })
          );
        }
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Hatalı kelimeyi yerel sözlüğe ekle
      if (params.misspelledWord) {
        menu.append(
          new MenuItem({
            label: `"${params.misspelledWord}" Sözlüğe Ekle`,
            click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
          })
        );
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Standart Pano İşlemleri
      menu.append(new MenuItem({ role: 'cut', label: 'Kes' }));
      menu.append(new MenuItem({ role: 'copy', label: 'Kopyala' }));
      menu.append(new MenuItem({ role: 'paste', label: 'Yapıştır' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Tümünü Seç' }));
      menu.popup();
    }
  });

  const isStartedFromStartup = Array.isArray(process.argv) && (
    process.argv.includes('--minimized') ||
    process.argv.includes('--hidden') ||
    process.argv.includes('--startup') ||
    process.argv.includes('--autostart')
  );

  win.once('ready-to-show', () => {
    if (isStartedFromStartup && behavior.startMinimized) {
      if (behavior.hideTaskbarOnMinimize) {
        win.hide();
        win.setSkipTaskbar(true);
      } else {
        win.minimize();
        win.setSkipTaskbar(false);
      }
    } else {
      win.setSkipTaskbar(false);
      win.show();
      win.focus();
    }
    if (Array.isArray(process.argv)) {
      setTimeout(() => {
        handleProtocolUrl(process.argv.join(' '));
      }, 1200);
    }
  });

  win.on('focus', () => {
    try {
      win.flashFrame(false);
    } catch {}
  });

  // Çıkma tuşu ('X'): 'closeToQuit' kapalıysa uygulamadan çıkma, simge durumuna küçültüp gizle
  win.on('close', (event) => {
    if (isQuitting) return;

    const currentBehavior = getSetting('app_behavior_settings', {
      closeToQuit: false,
      hideTaskbarOnMinimize: true,
    });

    if (!currentBehavior.closeToQuit) {
      event.preventDefault();
      win.hide();
      if (currentBehavior.hideTaskbarOnMinimize) {
        win.setSkipTaskbar(true);
      }
    }
  });

  // Simge durumuna küçültüldüğünde ('-'):
  win.on('minimize', () => {
    const currentBehavior = getSetting('app_behavior_settings', {
      hideTaskbarOnMinimize: true,
    });
    if (currentBehavior.hideTaskbarOnMinimize) {
      win.setSkipTaskbar(true);
    }
  });

  win.on('restore', () => {
    win.setSkipTaskbar(false);
  });

  win.on('show', () => {
    win.setSkipTaskbar(false);
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  initDb(app.getPath('userData'));
  ipcMain.handle('db:stats', () => getStats());

  // Sistem Bilgisi: RAM, DB boyutu, Electron/Node/Chrome versiyonları
  ipcMain.handle('db:system-info', async () => {
    const memUsage = process.memoryUsage();
    const dbFilePath = getDbPath();
    let dbSizeBytes = 0;
    if (dbFilePath) {
      try { dbSizeBytes = fs.statSync(dbFilePath).size; } catch {}
    }
    return {
      ram: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
        rssMB: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
        externalMB: Math.round(memUsage.external / 1024 / 1024 * 10) / 10,
      },
      db: {
        sizeBytes: dbSizeBytes,
        sizeMB: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
        path: dbFilePath,
      },
      versions: {
        electron: process.versions.electron || '?',
        node: process.versions.node || '?',
        chrome: process.versions.chrome || '?',
        v8: process.versions.v8 || '?',
      },
    };
  });

  // DB Vakum (VACUUM + optimize) — Gelişmiş sekmesi "Önbelleği Temizle" butonu
  ipcMain.handle('db:vacuum', () => {
    vacuumDb();
    return true;
  });
  ipcMain.handle('accounts:list', () => listAccounts());
  ipcMain.handle('auth:start', async (_evt, provider) => {
    const tokens = await startOAuthFlow(provider);
    // E-posta: önce id_token'dan (her zaman elimizde), olmazsa profil API'sinden.
    let profile = emailFromIdToken(tokens.id_token);
    if (!profile.email) {
      profile = await fetchProfileEmail(provider, tokens.access_token).catch(() => ({ email: null, name: null }));
    }
    if (!profile.email) {
      throw new Error('E-posta adresi profilden alınamadı. Lütfen sağlayıcı izinlerini onaylayarak tekrar deneyin.');
    }
    const expiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    const saved = {
      provider,
      email: profile.email,
      displayName: profile.name,
      refreshTokenEnc: enc(tokens.refresh_token),
      accessTokenEnc: enc(tokens.access_token),
      tokenExpiry: expiry,
    };
    addAccount(saved);
    return saved;
  });
  ipcMain.on('app:get-version-sync', (event) => {
    try {
      event.returnValue = app.getVersion();
    } catch {
      event.returnValue = '1.0.16';
    }
  });
  ipcMain.handle('accounts:add', (_evt, acc) => addAccount(acc));
  ipcMain.handle('accounts:get', async (_evt, id) => {
    const acc = getAccountById(id);
    if (!acc) return null;
    const { password_enc: _p, access_token_enc: _a, refresh_token_enc: _r, ...safe } = acc;
    return safe;
  });
  ipcMain.handle('accounts:update', async (_evt, id, updates) => {
    const acc = getAccountById(id);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const dbUpdates = {
      displayName: updates.displayName,
      imapHost: updates.imapHost,
      imapPort: updates.imapPort,
      smtpHost: updates.smtpHost,
      smtpPort: updates.smtpPort,
      smtpSecure: updates.smtpSecure,
    };
    if (updates.password && updates.password.trim()) {
      dbUpdates.passwordEnc = enc(updates.password.trim());
    }
    updateAccount(id, dbUpdates);
    return true;
  });
  ipcMain.handle('accounts:delete', async (_evt, id) => {
    deleteAccount(id);
    return true;
  });
  ipcMain.handle('mail:sync', async (_evt, email) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    try {
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () => syncInbox({ provider: acc.provider, email: acc.email, db: getDb(), ...creds }));
      if (res && res.newMessages && res.newMessages.length > 0) {
        notifyNewMessages(acc.email, res.newMessages);
      }
      return res;
    } catch (e) {
      throw new Error(friendlySyncError(acc.provider, e));
    }
  });
  const _folderSyncMap = new Map(); // email -> timestamp
  const _folderSyncInFlight = new Map(); // email -> Promise

  async function fetchFoldersFromImap(acc) {
    const email = acc.email;
    if (_folderSyncInFlight.has(email)) {
      return _folderSyncInFlight.get(email);
    }

    const task = (async () => {
      let creds = await freshCredentials(acc);
      let list;
      try {
        list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
      } catch (initialErr) {
        let activeErr = initialErr;
        const errStr = `${activeErr?.message || ''} ${activeErr?.responseText || ''} ${activeErr?.response || ''}`.toLowerCase();
        if (errStr.includes('authenticated but not connected') && acc.provider === 'microsoft') {
          try {
            console.log(`[mail:folders] ${email} için Microsoft token zorla yenilenip tekrar deneniyor...`);
            creds = await freshCredentials(acc, true);
            list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
          } catch (retryErr) {
            activeErr = retryErr;
          }
        }
        if (!list) {
          console.warn('[mail:folders] IMAP klasör listesi alınamadı, DB önbelleği kullanılıyor:', activeErr?.message);
          try {
            const db = getDb();
            const cached = db.prepare(`SELECT name, path, flags FROM folders WHERE account_id=(SELECT id FROM accounts WHERE email=?)`).all(email);
            if (cached && cached.length > 0) {
              return cached.map((f) => {
                let flags = [];
                try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
                return { path: f.path, name: f.name, flags, delimiter: '/' };
              });
            }
          } catch {}
          throw err;
        }
      }
      try {
        const db = getDb();
        const upsert = db.prepare(`
          INSERT INTO folders (account_id, name, path, flags, unread_count)
          VALUES ((SELECT id FROM accounts WHERE email=?), ?, ?, ?, 0)
          ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, flags=excluded.flags
        `);
        for (const f of list) {
          upsert.run(email, f.name || f.path, f.path, JSON.stringify(f.flags || []));
        }
      } catch (e) {
        console.warn('[mail:folders] DB klasör önbelleği güncelleme uyarısı:', e?.message);
      }
      return list.map((f) => ({ path: f.path, name: f.name, flags: f.flags, delimiter: f.delimiter }));
    })();

    _folderSyncInFlight.set(email, task);
    try {
      return await task;
    } finally {
      _folderSyncInFlight.delete(email);
    }
  }

  ipcMain.handle('mail:folders', async (_evt, email) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');

    // 1. ÖNCELİKLE yerel SQLite önbelleğini kontrol et:
    // Varsa ANINDA (0 ms) dön, UI ve kullanıcı sıfır gecikmeyle açılır!
    try {
      const db = getDb();
      const cached = db.prepare(`
        SELECT f.name, f.path, f.flags,
               COALESCE((SELECT SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END)
                         FROM messages m
                         WHERE m.account_id = f.account_id AND m.folder_path = f.path), 0) AS unread_count
        FROM folders f
        WHERE f.account_id = (SELECT id FROM accounts WHERE email = ?)
      `).all(email);
      if (cached && cached.length > 0) {
        return cached.map((f) => {
          let flags = [];
          try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
          return { path: f.path, name: f.name, flags, delimiter: '/', unread_count: f.unread_count || 0 };
        });
      }
    } catch {}

    // 2. Yalnızca yerel DB'de hiç klasör yoksa (ilk defa eklenen yepyeni hesap) IMAP'ten çek
    return fetchFoldersFromImap(acc);
  });
  ipcMain.handle('mail:sync-folder', async (_evt, email, folderPath) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    try {
      const normEmail = (email || '').toLowerCase().trim();
      _lastSyncTime.set(normEmail, Date.now());
      const creds = await freshCredentials(acc);
      const res = await imapLock(email, () => syncFolder({
        provider: acc.provider, email: acc.email, folderPath, db: getDb(), ...creds,
        skipUid: (uid) => isDeleted(email, folderPath, String(uid)),
      }));
      if (folderPath === 'INBOX' && res && res.newMessages && res.newMessages.length > 0) {
        notifyNewMessages(acc.email, res.newMessages);
      }
      return res;
    } catch (e) {
      throw new Error(friendlySyncError(acc.provider, e));
    }
  });
  ipcMain.handle('mail:list', (_evt, email, folderPath, limit, offset) => {
    return listMessages(email, folderPath || 'INBOX', limit || 50, offset || 0);
  });
  ipcMain.handle('mail:count', (_evt, email, folderPath) => {
    return countFolderMessages(email, folderPath || 'INBOX');
  });
  ipcMain.handle('mail:list-unified', (_evt, limit, offset) => {
    return listUnifiedMessages(limit || 50, offset || 0);
  });
  ipcMain.handle('mail:count-unified', () => {
    return countUnifiedMessages();
  });
  ipcMain.handle('mail:unread-counts', () => {
    return getAllUnreadCounts();
  });
  ipcMain.handle('mail:search-unified', (_evt, query) => {
    if (!query || !query.trim()) return [];
    return searchUnifiedMessages(query.trim());
  });
  ipcMain.handle('mail:sync-all-inboxes', async () => {
    const accs = listAccounts();
    const results = [];
    for (const acc of accs) {
      try {
        const full = getAccountByEmail(acc.email);
        if (!full) continue;
        const creds = await freshCredentials(full);
        const res = await imapLock(acc.email, () => syncFolder({
          provider: full.provider, email: full.email, folderPath: 'INBOX', db: getDb(), ...creds,
          skipUid: (uid) => isDeleted(full.email, 'INBOX', String(uid)),
        }));
        if (res && res.newMessages && res.newMessages.length > 0) {
          notifyNewMessages(acc.email, res.newMessages);
        }
        results.push({ email: acc.email, ...res });
      } catch (e) {
        const prov = (() => { try { return (getAccountByEmail(acc.email) || {}).provider; } catch { return undefined; } })();
        results.push({ email: acc.email, error: friendlySyncError(prov, e) });
      }
    }
    return results;
  });
  ipcMain.handle('mail:sync-more', async (_evt, email, folderPath, beforeUid, limit) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    try {
      const creds = await freshCredentials(acc);
      return await imapLock(email, () => syncFolder({
        provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX',
        db: getDb(), limit: limit || 50, beforeUid: beforeUid || null,
        ...creds,
        skipUid: (uid) => isDeleted(email, folderPath, String(uid)),
      }));
    } catch (e) {
      throw new Error(friendlySyncError(acc.provider, e));
    }
  });
  ipcMain.handle('mail:search', (_evt, email, folderPath, query) => {
    if (!query || !query.trim()) return [];
    return searchMessages(email, folderPath || 'INBOX', query.trim());
  });
  ipcMain.handle('mail:thread', (_evt, email, folderPath, messageId) => {
    return getThreadMessages(email, folderPath || 'INBOX', messageId);
  });
  // Gövde + ek bilgilerini DB'ye yazan tek fonksiyon (body ve şablon yolları ortak kullanır)
  function persistBody(email, folder, uid, fetched) {
    saveMessageBody(email, folder, uid, fetched);
    saveAttachments(email, folder, uid, fetched.attachments || []);
  }
  ipcMain.handle('mail:body', async (_evt, email, folderPath, uid) => {
    const folder = folderPath || 'INBOX';
    const cached = getMessageBody(email, folder, uid);
    if (cached && (cached.body_html || cached.body_text)) {
      return { html: cached.body_html, text: cached.body_text, messageId: cached.message_id || null, references: cached.references || [], cached: true };
    }
    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
      return { html: cached?.body_html || null, text: cached?.body_text || null, messageId: null, references: [], cached: true };
    }
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    // Mesaj taşındıysa (çöp kutusu vb.) alternatif klasörlerde de dene (sağlayıcıya özel)
    const candidates = [folder];
    if (acc.provider === 'google') {
      candidates.push('[Gmail]/Çöp kutusu', '[Gmail]/Trash');
    } else if (acc.provider === 'microsoft') {
      candidates.push('Deleted Items', 'Trash');
    } else {
      candidates.push('Trash', 'Deleted Items');
    }

    const uniqueCandidates = [...new Set(candidates)];
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const tryFolder = uniqueCandidates[i];
      try {
        const body = await imapLock(email, () =>
          fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...creds })
        );
        persistBody(email, folder, uid, body);
        return { ...body, cached: false };
      } catch (e) {
        const errStr = `${e?.message || ''} ${e?.responseText || ''} ${e?.response || ''}`.toLowerCase();
        
        const isConnError = /connection|socket|econnreset|etimedout|epipe|command failed|wrong_version_number|not connected/i.test(errStr);
        if (isConnError) {
          // Bağlantı/Exchange kilidi durumunda 2.5 saniye bekleyip temiz bağlantıyla bir kez daha dene
          try {
            await new Promise((r) => setTimeout(r, 2500));
            const retryCreds = await freshCredentials(acc);
            const retryBody = await imapLock(email, () =>
              fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...retryCreds })
            );
            persistBody(email, folder, uid, retryBody);
            return { ...retryBody, cached: false };
          } catch {}
        }
        if (isConnError || i === uniqueCandidates.length - 1) {
          console.error(`[body] ${email} uid=${uid} hata:`, e?.message || e);
          throw new Error(`Gövde alınamadı (${e?.message || e})`);
        }
        // Yalnızca ileti orijinal klasörde bulunamadıysa bir sonraki adayı dene
      }
    }
  });
  ipcMain.handle('mail:mark-read', async (_evt, email, folderPath, uid) => {
    markReadDb(email, folderPath || 'INBOX', uid); // önce yerel
    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
      return true;
    }
    // Sunucu bayrığı best-effort ve IMAP kuyruğuna girmeden
    setImmediate(async () => {
      try {
        const acc = getAccountByEmail(email);
        if (acc) {
          const creds = await freshCredentials(acc);
          await imapLock(email, () =>
            markSeen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
          );
        }
      } catch { /* best-effort */ }
    });
    return true;
  });
  ipcMain.handle('mail:mark-unread', async (_evt, email, folderPath, uid) => {
    markUnreadDb(email, folderPath || 'INBOX', uid); // önce yerel
    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
      return true;
    }
    setImmediate(async () => {
      try {
        const acc = getAccountByEmail(email);
        if (acc) {
          const creds = await freshCredentials(acc);
          await imapLock(email, () =>
            markUnseen({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, ...creds })
          );
        }
      } catch { /* best-effort */ }
    });
    return true;
  });
  ipcMain.handle('mail:star', (_evt, email, folderPath, uid) => {
    return toggleStarDb(email, folderPath || 'INBOX', uid);
  });

  function isTrashFolder(folderPath) {
    return /trash|çöp|deleted|bin/i.test(folderPath || '');
  }

  function getTrashFolder(email) {
    try {
      const row = getDb().prepare(
        `SELECT path FROM folders
         WHERE account_id = (SELECT id FROM accounts WHERE email=?)
           AND (lower(path) LIKE '%çöp%' OR lower(path) LIKE '%trash%' OR lower(path) LIKE '%deleted%' OR lower(name) LIKE '%çöp%' OR lower(name) LIKE '%trash%')
         ORDER BY id ASC LIMIT 1`
      ).get(email);
      if (row?.path) return row.path;
    } catch {}
    const acc = getAccountByEmail(email);
    if (acc?.provider === 'google') return '[Gmail]/Çöp kutusu';
    if (acc?.provider === 'microsoft') return 'Deleted Items';
    return 'Trash';
  }

  function getArchiveFolder(email) {
    try {
      const row = getDb().prepare(
        `SELECT path FROM folders
         WHERE account_id = (SELECT id FROM accounts WHERE email=?)
           AND (lower(path) LIKE '%archive%' OR lower(path) LIKE '%arşiv%' OR lower(path) LIKE '%tüm postalar%' OR lower(path) LIKE '%all mail%')
         ORDER BY id ASC LIMIT 1`
      ).get(email);
      if (row?.path) return row.path;
    } catch {}
    const acc = getAccountByEmail(email);
    if (acc?.provider === 'google') return '[Gmail]/Tüm Postalar';
    return 'Archive';
  }

  ipcMain.handle('mail:delete', async (_evt, email, folderPath, uid) => {
    if (!email || !folderPath || !uid) return false;
    const isTrash = isTrashFolder(folderPath);

    // 1. Önce ANINDA yerel DB ve önbellek yönetimi (0ms tepki)
    markDeleted(email, folderPath, String(uid));

    // Yerel taslaklar veya gönderilen kuyruk mesajları IMAP üzerinde aranmaz, doğrudan DB'den silinir
    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
      try {
        getDb().prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND uid=?`
        ).run(email, String(uid));
      } catch (err) {
        console.warn('[mail:delete] taslak silme uyarısı:', err?.message);
      }
      return true;
    }

    // Mesajın subject, message_id ve ek bilgilerini yerel DB'den al (IMAP fallback arama ve taşıma için)
    let localMsg = null;
    let localAtts = [];
    try {
      localMsg = getDb().prepare(
        `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      ).get(email, folderPath, String(uid));
      localAtts = getDb().prepare(
        `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
      ).all(email, folderPath, String(uid));
    } catch {}

    try {
      // 1. Mesajı kaynak klasörden ANINDA sil (0ms tepki)
      // UYARI: Çöp kutusuna eski INBOX UID'si ile geçici kayıt eklemiyoruz!
      // Bu geçersiz UID çöpten silinmeye çalışıldığında bulunamaz ve hortlamaya yol açar.
      getDb().prepare(
        `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      ).run(email, folderPath, String(uid));
      try {
        getDb().prepare(
          `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
        ).run(email, folderPath, String(uid));
      } catch {}
    } catch (dbErr) {
      console.warn('[mail:delete] DB güncelleme uyarısı:', dbErr?.message);
    }

    // 2. Ardından sunucu tarafı IMAP işlemini yürüt
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          moveToTrash({
            provider: acc.provider,
            email: acc.email,
            folderPath,
            uid: String(uid),
            subject: localMsg?.subject,
            messageId: localMsg?.message_id,
            ...creds,
          })
        );
        console.log('[mail:delete] moveToTrash result:', res);
        if (!res) return false;

        if (isTrash) {
          // Çöp kutusunda expunge edilen gerçek UID varsa (eski UID'den farklıysa) onu da önbelleğe al ve DB'den temizle
          if (res.realUid && res.realUid !== String(uid)) {
            markDeleted(email, folderPath, res.realUid);
            try {
              getDb().prepare(
                `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              ).run(email, folderPath, res.realUid);
              getDb().prepare(
                `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
              ).run(email, folderPath, res.realUid);
            } catch {}
          }
        } else if (res.dest && res.destUid && localMsg) {
          // Normal klasörden çöpe taşındıysa ve sunucu yeni UID döndürdüyse (COPYUID):
          // Çöp kutusuna GERÇEK UID ile ekle! Asla eski/geçersiz INBOX UID'si kullanılmaz.
          const finalDest = res.dest;
          const finalUid = String(res.destUid);
          try {
            const db = getDb();
            const existing = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            ).get(email, finalDest, finalUid);

            if (!existing) {
              db.prepare(`
                INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                localMsg.account_id,
                finalDest,
                finalUid,
                localMsg.subject,
                localMsg.from_addr,
                localMsg.to_addr,
                localMsg.date,
                localMsg.snippet,
                localMsg.body_html,
                localMsg.body_text,
                localMsg.is_read,
                localMsg.message_id,
                localMsg.refs,
                localMsg.starred || 0
              );
            }

            if (localAtts && localAtts.length > 0) {
              const insAtt = db.prepare(`
                INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `);
              for (const att of localAtts) {
                insAtt.run(att.account_id, finalDest, finalUid, att.idx, att.filename, att.content_type, att.size);
              }
            }
          } catch (syncErr) {
            console.warn('[mail:delete] DB hedef UID ekleme hatası:', syncErr?.message);
          }
        }
      }
      return true;
    } catch (e) {
      console.error('[mail:delete] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:batch-delete', async (_evt, email, folderPath, uids) => {
    if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
    const isTrash = isTrashFolder(folderPath);
    for (const uid of uids) {
      markDeleted(email, folderPath, String(uid));
    }

    const localDraftUids = uids.filter((u) => String(u).startsWith('draft-') || String(u).startsWith('local-'));
    const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));

    // Yerel taslakları doğrudan veritabanından sil
    if (localDraftUids.length > 0) {
      try {
        const db = getDb();
        const delStmt = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND uid=?`
        );
        db.transaction((list) => {
          for (const uid of list) delStmt.run(email, String(uid));
        })(localDraftUids);
      } catch (err) {
        console.warn('[mail:batch-delete] yerel taslak silme uyarısı:', err?.message);
      }
    }

    // 1. Sunucu mesajlarının yerel DB durumunu anında güncelle (0ms tepki)
    let localMsgs = [];
    let localAtts = [];
    if (serverUids.length > 0) {
      try {
        const db = getDb();
        if (!isTrash) {
          const placeholders = serverUids.map(() => '?').join(',');
          localMsgs = db.prepare(
            `SELECT * FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid IN (${placeholders})`
          ).all(email, folderPath, ...serverUids.map(String));
          localAtts = db.prepare(
            `SELECT * FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid IN (${placeholders})`
          ).all(email, folderPath, ...serverUids.map(String));
        }

        const stmt = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
        );
        const attStmt = db.prepare(
          `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
        );
        db.transaction((list) => {
          for (const uid of list) {
            stmt.run(email, folderPath, String(uid));
            try { attStmt.run(email, folderPath, String(uid)); } catch {}
          }
        })(serverUids);
      } catch (dbErr) {
        console.warn('[mail:batch-delete] DB uyarısı:', dbErr?.message);
      }
    }

    // 2. IMAP üzerinde toplu taşı veya expunge et (yalnızca sunucu mesajları için)
    if (serverUids.length > 0) {
      try {
        const acc = getAccountByEmail(email);
        if (acc) {
          const creds = await freshCredentials(acc);
          const res = await imapLock(email, () =>
            batchMoveToTrash({ provider: acc.provider, email: acc.email, folderPath, uids: serverUids, ...creds })
          );
          if (!isTrash && res?.dest && res?.uidMap && localMsgs.length > 0) {
            const finalDest = res.dest;
            const uidMap = res.uidMap || {};
            try {
              const db = getDb();
              const checkStmt = db.prepare(
                `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              );
              const insMsg = db.prepare(`
                INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, body_html, body_text, is_read, message_id, refs, starred)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              const insAtt = db.prepare(`
                INSERT OR IGNORE INTO attachments (account_id, folder_path, msg_uid, idx, filename, content_type, size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `);

              db.transaction((msgs) => {
                for (const m of msgs) {
                  const newUid = uidMap[String(m.uid)];
                  if (newUid) {
                    const existing = checkStmt.get(email, finalDest, String(newUid));
                    if (!existing) {
                      insMsg.run(
                        m.account_id,
                        finalDest,
                        String(newUid),
                        m.subject,
                        m.from_addr,
                        m.to_addr,
                        m.date,
                        m.snippet,
                        m.body_html,
                        m.body_text,
                        m.is_read,
                        m.message_id,
                        m.refs,
                        m.starred || 0
                      );
                    }
                    const atts = localAtts.filter((a) => String(a.msg_uid) === String(m.uid));
                    for (const a of atts) {
                      try { insAtt.run(a.account_id, finalDest, String(newUid), a.idx, a.filename, a.content_type, a.size); } catch {}
                    }
                  }
                }
              })(localMsgs);
            } catch (batchDbErr) {
              console.warn('[mail:batch-delete] DB senkron ekleme uyarısı:', batchDbErr?.message);
            }
          }
        }
        return true;
      } catch (e) {
        console.error('[mail:batch-delete] error:', e);
        return false;
      }
    }

    return true;
  });

  ipcMain.handle('mail:move-to-folder', async (_evt, email, fromFolder, toFolder, uid) => {
    if (!email || !fromFolder || !toFolder || !uid) return false;
    if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

    markDeleted(email, fromFolder, String(uid));
    try {
      getDb().prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      ).run(toFolder, email, fromFolder, String(uid));
    } catch (e) {
      console.warn('[mail:move-to-folder] DB uyarısı:', e?.message);
    }

    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) return true;

    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          moveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uid: String(uid), ...creds })
        );
        if (res && res.destUid) {
          const finalUid = String(res.destUid);
          try {
            const db = getDb();
            const existing = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            ).get(email, toFolder, finalUid);
            if (existing) {
              db.prepare(
                `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              ).run(email, toFolder, String(uid));
            } else {
              db.prepare(
                `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              ).run(toFolder, finalUid, email, toFolder, String(uid));
            }
            try {
              db.prepare(
                `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
              ).run(toFolder, finalUid, email, fromFolder, String(uid));
            } catch {}
          } catch (mErr) {
            console.warn('[mail:move-to-folder] UID güncelleme hatası:', mErr?.message);
          }
        } else if (res && !res.destUid) {
          try {
            getDb().prepare(
              `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            ).run(email, toFolder, String(uid));
          } catch {}
        }
      }
      return true;
    } catch (e) {
      console.error('[mail:move-to-folder] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:batch-move-to-folder', async (_evt, email, fromFolder, toFolder, uids) => {
    if (!email || !fromFolder || !toFolder || !Array.isArray(uids) || uids.length === 0) return false;
    if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return true;

    for (const uid of uids) {
      markDeleted(email, fromFolder, String(uid));
    }

    try {
      const db = getDb();
      const stmt = db.prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      );
      db.transaction((list) => {
        for (const uid of list) stmt.run(toFolder, email, fromFolder, String(uid));
      })(uids);
    } catch (e) {
      console.warn('[mail:batch-move-to-folder] DB uyarısı:', e?.message);
    }

    const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
    if (serverUids.length === 0) return true;

    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder, toFolder, uids: serverUids, ...creds })
        );
        if (res && res.uidMap) {
          const uidMap = res.uidMap;
          try {
            const db = getDb();
            const updateStmt = db.prepare(
              `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const deleteStmt = db.prepare(
              `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const checkStmt = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const updateAttStmt = db.prepare(
              `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
            );

            db.transaction((list) => {
              for (const oldUid of list) {
                const newUid = uidMap[String(oldUid)];
                if (newUid) {
                  const existing = checkStmt.get(email, toFolder, String(newUid));
                  if (existing) {
                    deleteStmt.run(email, toFolder, String(oldUid));
                  } else {
                    updateStmt.run(toFolder, String(newUid), email, toFolder, String(oldUid));
                  }
                  try {
                    updateAttStmt.run(toFolder, String(newUid), email, fromFolder, String(oldUid));
                  } catch {}
                } else {
                  deleteStmt.run(email, toFolder, String(oldUid));
                }
              }
            })(serverUids);
          } catch (bmErr) {
            console.warn('[mail:batch-move-to-folder] UID güncelleme hatası:', bmErr?.message);
          }
        }
      }
      return true;
    } catch (e) {
      console.error('[mail:batch-move-to-folder] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:archive', async (_evt, email, folderPath, uid) => {
    if (!email || !folderPath || !uid) return false;
    const targetArchive = getArchiveFolder(email);
    if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

    markDeleted(email, folderPath, String(uid));
    try {
      getDb().prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      ).run(targetArchive, email, folderPath, String(uid));
    } catch (e) {
      console.warn('[mail:archive] DB uyarısı:', e?.message);
    }

    if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) return true;

    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          moveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uid: String(uid), ...creds })
        );
        if (res && res.destUid) {
          const finalUid = String(res.destUid);
          try {
            const db = getDb();
            const existing = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            ).get(email, targetArchive, finalUid);
            if (existing) {
              db.prepare(
                `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              ).run(email, targetArchive, String(uid));
            } else {
              db.prepare(
                `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
              ).run(targetArchive, finalUid, email, targetArchive, String(uid));
            }
            try {
              db.prepare(
                `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
              ).run(targetArchive, finalUid, email, folderPath, String(uid));
            } catch {}
          } catch (aErr) {
            console.warn('[mail:archive] UID güncelleme hatası:', aErr?.message);
          }
        } else if (res && !res.destUid) {
          try {
            getDb().prepare(
              `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            ).run(email, targetArchive, String(uid));
          } catch {}
        }
      }
      return true;
    } catch (e) {
      console.error('[mail:archive] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:batch-archive', async (_evt, email, folderPath, uids) => {
    if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
    const targetArchive = getArchiveFolder(email);
    if (folderPath.toLowerCase() === targetArchive.toLowerCase()) return true;

    for (const uid of uids) {
      markDeleted(email, folderPath, String(uid));
    }

    try {
      const db = getDb();
      const stmt = db.prepare(
        `UPDATE messages SET folder_path=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
      );
      db.transaction((list) => {
        for (const uid of list) stmt.run(targetArchive, email, folderPath, String(uid));
      })(uids);
    } catch (e) {
      console.warn('[mail:batch-archive] DB uyarısı:', e?.message);
    }

    const serverUids = uids.filter((u) => !String(u).startsWith('draft-') && !String(u).startsWith('local-'));
    if (serverUids.length === 0) return true;

    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        const res = await imapLock(email, () =>
          batchMoveToFolder({ provider: acc.provider, email: acc.email, fromFolder: folderPath, toFolder: targetArchive, uids: serverUids, ...creds })
        );
        if (res && res.uidMap) {
          const uidMap = res.uidMap;
          try {
            const db = getDb();
            const updateStmt = db.prepare(
              `UPDATE messages SET folder_path=?, uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const deleteStmt = db.prepare(
              `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const checkStmt = db.prepare(
              `SELECT id FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
            );
            const updateAttStmt = db.prepare(
              `UPDATE attachments SET folder_path=?, msg_uid=? WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
            );

            db.transaction((list) => {
              for (const oldUid of list) {
                const newUid = uidMap[String(oldUid)];
                if (newUid) {
                  const existing = checkStmt.get(email, targetArchive, String(newUid));
                  if (existing) {
                    deleteStmt.run(email, targetArchive, String(oldUid));
                  } else {
                    updateStmt.run(targetArchive, String(newUid), email, targetArchive, String(oldUid));
                  }
                  try {
                    updateAttStmt.run(targetArchive, String(newUid), email, folderPath, String(oldUid));
                  } catch {}
                } else {
                  deleteStmt.run(email, targetArchive, String(oldUid));
                }
              }
            })(serverUids);
          } catch (baErr) {
            console.warn('[mail:batch-archive] UID güncelleme hatası:', baErr?.message);
          }
        }
      }
      return true;
    } catch (e) {
      console.error('[mail:batch-archive] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:batch-mark-read', async (_evt, email, folderPath, uids, isRead = true) => {
    if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
    batchMarkReadDb(email, folderPath, uids, isRead ? 1 : 0);
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        await imapLock(email, () =>
          batchMarkSeen({ provider: acc.provider, email: acc.email, folderPath, uids, isSeen: !!isRead, ...creds })
        );
      }
      return true;
    } catch (e) {
      console.error('[mail:batch-mark-read] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:batch-star', async (_evt, email, folderPath, uids, starred = true) => {
    if (!email || !folderPath || !Array.isArray(uids) || uids.length === 0) return false;
    batchToggleStarDb(email, folderPath, uids, starred ? 1 : 0);
    try {
      const acc = getAccountByEmail(email);
      if (acc) {
        const creds = await freshCredentials(acc);
        await imapLock(email, () =>
          batchToggleFlag({ provider: acc.provider, email: acc.email, folderPath, uids, isFlagged: !!starred, ...creds })
        );
      }
      return true;
    } catch (e) {
      console.error('[mail:batch-star] error:', e);
      return false;
    }
  });

  ipcMain.handle('contacts:search', async (_evt, query) => {
    try {
      return searchContacts(query);
    } catch {
      return [];
    }
  });

  ipcMain.handle('contacts:list', async (_evt, query) => {
    try {
      return listContacts(query);
    } catch (e) {
      console.error('[contacts:list] error:', e);
      return [];
    }
  });

  ipcMain.handle('contacts:upsert', async (_evt, contact) => {
    try {
      return upsertContact(contact);
    } catch (e) {
      console.error('[contacts:upsert] error:', e);
      throw e;
    }
  });

  ipcMain.handle('contacts:delete', async (_evt, id) => {
    try {
      return deleteContact(id);
    } catch (e) {
      console.error('[contacts:delete] error:', e);
      return false;
    }
  });

  ipcMain.handle('app:set-spellcheck', async (_evt, enabled) => {
    try {
      if (mainWindow?.webContents?.session) {
        mainWindow.webContents.session.setSpellCheckerEnabled(Boolean(enabled));
      }
      return true;
    } catch (e) {
      console.error('[app:set-spellcheck] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:save-draft', async (_evt, { email, to, subject, text, html }) => {
    if (!email) return false;
    try {
      return saveDraftMessage(email, { to, subject, text, html });
    } catch (e) {
      console.error('[mail:save-draft] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:send', async (_evt, { fromEmail, to, cc, bcc, subject, text, html, inReplyTo, references, attachments }) => {
    const acc = getAccountByEmail(fromEmail);
    if (!acc) throw new Error('Gönderen hesap bulunamadı.');
    const toList = splitAddresses(to);
    if (toList.length === 0) throw new Error('Geçerli bir alıcı girin.');
    if (!text || !text.trim()) throw new Error('İleti boş olamaz.');
    const atts = attachments || [];
    const totalBytes = atts.reduce((n, a) => n + Math.ceil((a.dataBase64 || '').length * 3 / 4), 0);
    if (totalBytes > 20 * 1024 * 1024) throw new Error('Ekler toplam 20MB sınırını aşıyor.');
    const creds = await freshCredentials(acc);
    const smtpOpts = acc.auth_type === 'password'
      ? { smtpHost: acc.smtp_host, smtpPort: acc.smtp_port, smtpSecure: !!acc.smtp_secure }
      : {};
    const transporter = createTransporter({ provider: acc.provider, email: acc.email, ...creds, ...smtpOpts });
    const ccList = splitAddresses(cc);
    const bccList = splitAddresses(bcc);
    const raw = await buildRaw({ from: acc.email, to: toList, cc: ccList, subject: subject || '(konusuz)', text, html, inReplyTo, references, attachments: atts });
    let info;
    try {
      info = await sendRaw(transporter, raw, { from: acc.email, to: [...toList, ...ccList, ...bccList] });
    } catch (e) {
      console.error(`[send] ${fromEmail} hata:`, e?.message || e);
      throw new Error(`Gönderilemedi (${e?.message || e})`);
    }
    saveSentMessage(acc.email, { to: toList.join(', '), subject, text, html });
    // Sunucudaki Gönderilmiş klasörüne kopya (best-effort)
    try {
      await appendToSent({ provider: acc.provider, email: acc.email, raw, ...creds });
    } catch { /* yerel kayıt esas */ }
    return { messageId: info?.messageId || null };
  });
  ipcMain.handle('mail:attachments', (_evt, email, folderPath, uid) => {
    const folder = folderPath || 'INBOX';
    return listAttachments(email, folder, uid);
  });
  ipcMain.handle('mail:attachment-save', async (_evt, email, folderPath, uid, index) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
    const safeName = path.basename(att.filename).replace(/[<>:"/\\|?*]/g, '_') || 'ek.bin';
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: safeName });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, att.content);
    return { saved: true, path: filePath };
  });
  ipcMain.handle('mail:attachment-preview', async (_evt, email, folderPath, uid, index) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
    return {
      filename: att.filename,
      contentType: att.contentType,
      dataBase64: Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content || '').toString('base64'),
    };
  });
  ipcMain.handle('mail:autoconfig', (_evt, email) => detectSettings(email));
  async function composeTemplate(email, folderPath, uid, mode) {
    const folder = folderPath || 'INBOX';
    const meta = getMessageMeta(email, folder, uid);
    if (!meta) throw new Error('Mesaj bulunamadı.');
    let b = getMessageBody(email, folder, uid);
    if (!(b && (b.body_html || b.body_text))) {
      const acc = getAccountByEmail(email);
      if (!acc) throw new Error('Hesap bulunamadı.');
      const creds = await freshCredentials(acc);
      const fetched = await fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds });
      persistBody(email, folder, uid, fetched);
      b = { body_html: fetched.html, body_text: fetched.text, message_id: fetched.messageId, references: fetched.references };
    }
    const original = {
      from: meta.from_addr,
      to: meta.to_addr,
      cc: meta.cc_addr,
      subject: meta.subject,
      date: meta.date,
      html: b.body_html,
      text: b.body_text,
      messageId: b.message_id,
      references: b.references || [],
    };
    if (mode === 'reply') return buildReply(original);
    if (mode === 'replyAll') return buildReplyAll(original, email);
    return buildForward(original);
  }
  ipcMain.handle('mail:reply-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'reply'));
  ipcMain.handle('mail:reply-all-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'replyAll'));
  ipcMain.handle('mail:forward-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'forward'));
  ipcMain.handle('mail:export-eml', async (_evt, email, folderPath, uid) => {
    const folder = folderPath || 'INBOX';
    const meta = getMessageMeta(email, folder, uid);
    let body = getMessageBody(email, folder, uid);
    if (!body || (!body.body_html && !body.body_text)) {
      try {
        const acc = getAccountByEmail(email);
        if (acc) {
          const creds = await freshCredentials(acc);
          const fetched = await imapLock(email, () => fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds }));
          persistBody(email, folder, uid, fetched);
          body = fetched;
        }
      } catch {}
    }
    const cleanSub = (meta?.subject || 'eposta').replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${cleanSub}.eml`,
      filters: [{ name: 'E-posta Dosyası', extensions: ['eml'] }],
    });
    if (canceled || !filePath) return { saved: false };
    const eml = [
      `From: ${meta?.from_addr || email}`,
      `Subject: ${meta?.subject || '(konusuz)'}`,
      `Date: ${meta?.date || new Date().toISOString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      body?.body_html || body?.body_text || '(İçerik boş)',
    ].join('\r\n');
    await fs.promises.writeFile(filePath, eml, 'utf8');
    return { saved: true, path: filePath };
  });
  ipcMain.handle('mail:empty-trash', async (_evt, email) => {
    const trashFolder = getTrashFolder(email);
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');

    // 1. Yerel DB'deki ilgili hesaba ve çöp klasörüne ait mesajları ve ekleri temizle
    getDb().prepare(`DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=?`).run(email, trashFolder);
    try {
      getDb().prepare(`DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=?`).run(email, trashFolder);
    } catch {}

    // 2. IMAP sunucusundaki mesajları kalıcı expunge et
    try {
      const creds = await freshCredentials(acc);
      await imapLock(email, async () => {
        return withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
          await client.mailboxOpen(trashFolder, { readOnly: false });
          const all = await client.search({ all: true }, { uid: true });
          if (all && all.length > 0) {
            for (const u of all) {
              markDeleted(email, trashFolder, String(u));
            }
            await client.messageFlagsAdd(all.join(','), ['\\Deleted'], { uid: true });
            try { await client.messageDelete(all.join(','), { uid: true }); } catch {}
            try { await client.run('EXPUNGE'); } catch {}
          }
          try { await client.mailboxClose(); } catch {}
        });
      });
      return true;
    } catch (e) {
      console.error('[empty-trash] hata:', e);
      return false;
    }
  });
  // Bağlantı Testi — mevcut kaydedilmiş veya formda düzenlenen hesap kimlik bilgilerini doğrular
  ipcMain.handle('accounts:test-connection', async (_evt, { accountId, ...overrides }) => {
    const acc = getAccountById(accountId);
    if (!acc) throw new Error('Hesap bulunamadı.');

    const result = { imap: null, smtp: null };

    try {
      if (acc.auth_type === 'password') {
        let password = (overrides && overrides.password && overrides.password.trim()) ? overrides.password.trim() : null;
        if (!password && acc.password_enc) {
          password = dec(acc.password_enc);
        }
        if (!password) {
          const fullAcc = getAccountByEmail(acc.email);
          if (fullAcc?.password_enc) {
            password = dec(fullAcc.password_enc);
          }
        }
        if (!password) {
          throw new Error('Kayıtlı şifre bulunamadı. Lütfen şifre alanına şifrenizi girerek tekrar test edin.');
        }

        const imapHost = (overrides && overrides.imapHost) ? overrides.imapHost.trim() : acc.imap_host;
        const imapPort = (overrides && overrides.imapPort) ? Number(overrides.imapPort) : Number(acc.imap_port || 993);
        const smtpHost = (overrides && overrides.smtpHost) ? overrides.smtpHost.trim() : acc.smtp_host;
        const smtpPort = (overrides && overrides.smtpPort) ? Number(overrides.smtpPort) : Number(acc.smtp_port || 465);
        const smtpSecure = (overrides && overrides.smtpSecure !== undefined)
          ? Boolean(overrides.smtpSecure)
          : (acc.smtp_secure !== 0);

        // IMAP Testi
        try {
          await verifyImap({ host: imapHost, port: imapPort, email: acc.email, password });
          result.imap = { ok: true };
        } catch (imapErr) {
          result.imap = { ok: false, error: imapErr.message || String(imapErr) };
        }

        // SMTP Testi
        if (smtpHost && smtpPort) {
          try {
            const transporter = createTransporter({
              provider: acc.provider,
              email: acc.email,
              password,
              smtpHost,
              smtpPort,
              smtpSecure,
            });
            await transporter.verify();
            result.smtp = { ok: true };
          } catch (smtpErr) {
            result.smtp = { ok: false, error: smtpErr.message || String(smtpErr) };
          }
        } else {
          result.smtp = { ok: false, error: 'SMTP sunucusu veya portu belirtilmemiş.' };
        }
      } else {
        // OAuth hesap — IMAP bağlantısını withClient ile test et
        const creds = await freshCredentials(acc);
        if (creds.accessToken) {
          await withClient({ provider: acc.provider, email: acc.email, accessToken: creds.accessToken }, async (client) => {
            await client.mailboxOpen('INBOX', { readOnly: true });
          });
          result.imap = { ok: true };
          result.smtp = { ok: true, note: 'OAuth bağlantısı IMAP ile doğrulandı.' };
        } else {
          throw new Error('OAuth erişim anahtarı alınamadı.');
        }
      }
    } catch (err) {
      result.imap = result.imap || { ok: false, error: friendlySyncError(acc.provider, err) };
    }

    return result;
  });

  // ── Gmail / OAuth dostu hata eşlemesi (salt metin dönüşümü, akışa dokunmaz) ──
  function friendlySyncError(provider, err) {
    const raw = err?.message || String(err || '');
    const low = raw.toLowerCase();
    const isGoogle = (provider || '').toLowerCase().includes('google') || low.includes('gmail');
    if (/invalid_grant|invalid client|unauthorized_client|access_denied|token has been expired or revoked|refresh token/i.test(raw)) {
      return `${raw} — Bu hesap Google erişimini reddetmiş/geri almış olabilir. Çözüm: Gmail'de IMAP'ın açık olduğunu doğrulayın (Gmail Ayarları → Yönlendirme ve POP/IMAP → IMAP erişimini etkinleştir), sonra Ayarlar → Hesaplar → Yeni Hesap Ekle ile AYNI e-postayı yeniden bağlayın (mevcut veriler korunur).`;
    }
    if (/imap.*disabled|imap access is disabled|application-specific password|app password|invalid credentials|authentication failed|auth failed|login failed/i.test(raw)) {
      return `${raw} — Gmail bu hesaba IMAP ile girişe izin vermiyor. Çözüm: (1) Gmail web → Ayarlar → IMAP'i etkinleştirin, (2) Google Hesabı → Güvenlik → Postacı erişimini kaldırıp hesabı yeniden bağlayın.`;
    }
    if (/too many simultaneous connections|too many connections/i.test(raw)) {
      return `${raw} — Gmail eşzamanlı bağlantı limitine takıldı (çok hesap aynı anda). Birkaç saniye bekleyip Eşitle'ye tekrar basın; arka plan senkronizasyonu sırayla dener.`;
    }
    if (/timeout|etimedout|econnreset|epipe|socket|network|fetch failed|enotfound/i.test(raw)) {
      return `${raw} — Geçici ağ/IMAP kesintisi. İnterneti kontrol edip Eşitle'yi tekrar deneyin.`;
    }
    if (isGoogle && /no such mailbox|mailbox|folder/i.test(raw)) {
      return `${raw} — Klasör Gmail'de bulunamadı (etiket adı değişmiş olabilir). Klasör listesini yenileyip INBOX üzerinden eşitleyin.`;
    }
    return raw;
  }

  // ── Salt-okunur hesap tanısı (DB'ye yazmaz, hesap ekleme akışına dokunmaz) ──
  // Adımlar: hesap kaydı → token varlığı → token yenileme → IMAP INBOX açma + status
  ipcMain.handle('mail:diagnose', async (_evt, email) => {
    const steps = [];
    const push = (key, ok, detail) => { steps.push({ key, ok, detail: String(detail || '').slice(0, 500) }); };
    try {
      const acc = getAccountByEmail(email);
      if (!acc) {
        push('account', false, `${email} yerel DB'de bulunamadı.`);
        return { email, ok: false, steps, hint: 'Hesap listede yoksa yeniden ekleyin.' };
      }
      push('account', true, `provider=${acc.provider || '?'} auth=${acc.auth_type || 'oauth'}`);
      if (acc.auth_type === 'password') {
        push('token', !!acc.password_enc, acc.password_enc ? 'Kayıtlı şifre mevcut.' : 'Kayıtlı şifre yok.');
      } else {
        push('token', !!(acc.refresh_token_enc || acc.access_token_enc), acc.refresh_token_enc ? 'Refresh token kayıtlı.' : 'Refresh token YOK — hesabı yeniden bağlayın.');
      }
      let creds;
      try {
        creds = await freshCredentials(acc);
        push('refresh', true, acc.auth_type === 'password' ? 'Şifre çözüldü.' : `Access token alındı (süre: ${acc.token_expiry || 'bilinmiyor'}).`);
      } catch (e) {
        push('refresh', false, friendlySyncError(acc.provider, e));
        return { email, ok: false, steps, hint: 'Token yenilenemedi — Gmail IMAP iznini ve yeniden bağlamayı deneyin.' };
      }
      try {
        const info = await imapLock(email, async () => {
          return withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
            const mb = await client.mailboxOpen('INBOX', { readOnly: true });
            let status = null;
            try { status = await client.status('INBOX', { messages: true, unseen: true }); } catch {}
            return { exists: mb?.exists ?? client.mailbox?.exists ?? null, status };
          });
        });
        const total = info?.status?.messages ?? info?.exists ?? '?';
        const unseen = info?.status?.unseen ?? '?';
        push('imap', true, `INBOX açıldı. kutuda=${total} okunmamış=${unseen}`);
        return { email, ok: true, steps, hint: total === 0 ? 'INBOX sunucuda boş görünüyor — Gmail webde gelen kutusunu kontrol edin.' : 'Bağlantı sağlıklı. Liste boşsa Eşitle + klasör seçimine bakın.' };
      } catch (e) {
        push('imap', false, friendlySyncError(acc.provider, e));
        return { email, ok: false, steps, hint: 'IMAP INBOX açılamadı — yukarıdaki IMAP/Gmail kontrol listesini uygulayın.' };
      }
    } catch (e) {
      push('fatal', false, friendlySyncError('', e));
      return { email, ok: false, steps, hint: 'Beklenmeyen tanı hatası.' };
    }
  });

  ipcMain.handle('accounts:add-manual', async (_evt, { email, password, imap, smtp }) => {
    if (!email || !password) throw new Error('E-posta ve şifre gerekli.');
    // Kaydetmeden önce bağlantıyı doğrula (anında hata bildirimi)
    await verifyImap({ host: imap.host, port: imap.port, email, password });
    return addAccount({
      provider: 'imap',
      email,
      authType: 'password',
      imapHost: imap.host,
      imapPort: imap.port,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      passwordEnc: enc(password),
    });
  });
  ipcMain.handle('notifications:get-settings', () => {
    return getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 0.5,
      soundEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
  });
  ipcMain.handle('notifications:save-settings', (_evt, newSettings) => {
    const current = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 0.5,
      soundEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
    const updated = { ...current, ...newSettings };
    setSetting('notification_settings', updated);
    updateBackgroundSyncSchedule();
    return updated;
  });
  ipcMain.handle('notifications:test', () => {
    const accs = listAccounts();
    const targetEmail = accs.length > 0 ? accs[0].email : '';
    showDesktopNotification({
      title: '📧 Postacı — Test Bildirimi',
      body: 'Windows masaüstü bildirimleri aktif! Tıklayarak gelen kutunuza gidebilirsiniz.',
      email: targetEmail,
      folderPath: 'INBOX',
      uid: '',
      silent: false,
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.flashFrame(true); } catch {}
      mainWindow.webContents.send('notify:new-mail', {
        email: targetEmail,
        folderPath: 'INBOX',
        count: 1,
        messages: [{ uid: 'test', subject: 'Postacı test bildirimi başarıyla alındı!', from: 'Postacı Ekibi' }],
      });
    }
    return true;
  });
  ipcMain.handle('app:get-settings', () => {
    return getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
      language: 'tr',
    });
  });
  ipcMain.handle('app:save-settings', (_evt, newSettings) => {
    const current = getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
      language: 'tr',
    });
    const updated = { ...current, ...newSettings };
    setSetting('app_behavior_settings', updated);

    if (typeof updated.launchOnStartup === 'boolean' || typeof updated.startMinimized === 'boolean') {
      syncStartupSettings(!!updated.launchOnStartup, !!updated.startMinimized);
    }

    return updated;
  });

  ipcMain.handle('shell:open-external', (_evt, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:') || url.startsWith('ms-settings:'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Windows Görev Çubuğu Rozeti — okunmamış sayısı
  ipcMain.handle('app:set-badge', (_evt, count) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    try {
      if (!count || count <= 0) {
        mainWindow.setOverlayIcon(null, '');
        if (tray && !tray.isDestroyed()) tray.setToolTip('Postacı - E-posta İstemcisi');
        return true;
      }
      const label = count > 99 ? '99+' : String(count);
      const size = 24;
      // SVG rozet ikonu oluştur
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#e53e3e"/>
        <text x="${size / 2}" y="${count > 9 ? 16 : 17}" text-anchor="middle" fill="white"
          font-size="${count > 9 ? 10 : 13}" font-family="Arial,sans-serif" font-weight="bold">${label}</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      const img = nativeImage.createFromDataURL(dataUrl);
      mainWindow.setOverlayIcon(img, `${count} okunmamış ileti`);
      if (tray && !tray.isDestroyed()) tray.setToolTip(`Postacı — ${count} okunmamış`);
      return true;
    } catch (e) {
      console.warn('[badge] setOverlayIcon hatası:', e?.message);
      return false;
    }
  });

  // Dosya Seç Dialog (özel arkaplan resmi için)
  ipcMain.handle('dialog:open-file', async (_evt, { filters, title } = {}) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Dosya Seç',
      properties: ['openFile'],
      filters: filters || [
        { name: 'Resim Dosyaları', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    try {
      const data = fs.readFileSync(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };
      const mime = mimeMap[ext] || 'image/png';
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ensureWindowsShortcut();
  try {
    app.setAppUserModelId('com.postaci.app');
  } catch {}

  // Başlangıç ayarlarını uygulama her açıldığında Windows ile senkronize et
  const initialBehavior = getSetting('app_behavior_settings', {
    launchOnStartup: false,
    startMinimized: false,
  });
  if (initialBehavior.launchOnStartup) {
    syncStartupSettings(true, !!initialBehavior.startMinimized);
  }

  createTray();
  createWindow();
  updateBackgroundSyncSchedule();
  setTimeout(() => {
    runBackgroundSync().catch(() => {});
  }, 4000);
});

app.on('second-instance', (_event, commandLine, _workingDirectory) => {
  // Bildirime tıklanması veya uygulamanın tekrar çalıştırılması halinde mevcut pencereyi öne getir
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(false);
    mainWindow.show();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);

    if (Array.isArray(commandLine)) {
      handleProtocolUrl(commandLine.join(' '));
    }
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  const behavior = getSetting('app_behavior_settings', {
    closeToQuit: false,
  });
  if (isQuitting || behavior.closeToQuit || process.platform === 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
