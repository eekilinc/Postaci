// electron/notifications.cjs - masaustu bildirimleri ve postaci:// protokolu (main.cjs'ten tasindi)
const { Notification } = require('electron');
const fs = require('fs');
const { getSetting } = require('./db.cjs');
const { resolveAppIcon } = require('./shell-integration.cjs');

const _activeNotifications = new Set();
let _getMainWindow = () => null;
let _createWindow = () => {};
function initNotifications({ getMainWindow, createWindow }) {
  _getMainWindow = getMainWindow || (() => null);
  _createWindow = createWindow || (() => {});
}
function getMainWindow() { return _getMainWindow(); }
function createWindow() { return _createWindow(); }

function isInQuietHours() {
  try {
    const settings = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 2,
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
        const mainWindow = getMainWindow();
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

      const mainWindow = getMainWindow();
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
    syncIntervalMinutes: 2,
    soundEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  if (!settings.notificationsEnabled) return;

  const mainWindow = getMainWindow();

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

module.exports = { initNotifications, isInQuietHours, showDesktopNotification, handleProtocolUrl, notifyNewMessages, _activeNotifications };
