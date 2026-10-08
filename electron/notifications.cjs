// electron/notifications.cjs - masaustu bildirimleri ve postaci:// protokolu (main.cjs'ten tasindi)
const { Notification } = require('electron');
const fs = require('fs');
const { getSetting } = require('./db.cjs');
const { resolveAppIcon } = require('./shell-integration.cjs');
const { log } = require('./logger.cjs');

// ── Varsayılan bildirim ayarları ────────────────────────────────────────────
// Bu nesne TEK kaynaktır. getSetting() kayıtlı ayarı bu nesneyle birleştirir,
// böylece eski sürümden kalan eksik anahtarlar da geçerli bir değere düşer.
// (getSetting merge'i olmazsa örn. syncIntervalMinutes undefined dönüyor,
//  arka plan senkronu sessizce hiç çalışmıyordu.)
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  notificationsEnabled: true,
  syncIntervalMinutes: 2,
  soundEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
});

function loadSettings() {
  return getSetting('notification_settings', DEFAULT_NOTIFICATION_SETTINGS);
}

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
    const settings = loadSettings();
    if (!settings.quietHoursEnabled) return false;

    const now = new Date();
    const curMins = now.getHours() * 60 + now.getMinutes();

    const [sH, sM] = String(settings.quietHoursStart || '22:00').split(':').map(Number);
    const [eH, eM] = String(settings.quietHoursEnd || '08:00').split(':').map(Number);
    const startMins = (sH || 0) * 60 + (sM || 0);
    const endMins = (eH || 0) * 60 + (eM || 0);
    if (!Number.isFinite(startMins) || !Number.isFinite(endMins)) return false;

    if (startMins <= endMins) {
      return curMins >= startMins && curMins < endMins;
    }
    // Gece boyu sessiz saatler (Örn: 22:00 -> 08:00)
    return curMins >= startMins || curMins < endMins;
  } catch {
    return false;
  }
}

// ── Bildirim kuyruğu (N2/N3) ────────────────────────────────────────────────
// Sorun: her yeni mail için AYRI bir toast üretiliyordu. Windows aynı anda tek
// afiş gösterdiği için çoklu hesaplarda gelen bildirimler birbirinin yerine
// geçiyor, kullanıcı "birkaç mail geldi, tek bildirim gördüm" diyordu.
// Çözüm: TEK bir global pencere kullan. Pencerede gelen tüm bildirimleri
// (hesap/folder fark etmeksizin) birleştir ve pencere dolunca TEK toast göster.
// Kuyruk ilk öğede başlar, her yeni öğe pencereyi UZATMAZ — böylece sürekli
// gelen mail'lerde toast hiç gösterilemez hale gelmez.
const COALESCE_WINDOW_MS = 1200;
let _pendingToasts = [];
let _toastTimer = null;
const _recentlyNotified = new Map(); // "email|folder|uid" -> timestamp

function toastKeyFor(item) {
  return `${item.email}|${item.folderPath || 'INBOX'}|${item.uid || ''}`;
}

// Aynı mail için kısa sürede tekrar toast üretme (senkron çift tetikleme koruması)
function isRecentlyNotified(item, windowMs = 30000) {
  const key = toastKeyFor(item);
  const t = _recentlyNotified.get(key);
  if (t && Date.now() - t < windowMs) return true;
  _recentlyNotified.set(key, Date.now());
  if (_recentlyNotified.size > 500) {
    const oldest = _recentlyNotified.keys().next().value;
    _recentlyNotified.delete(oldest);
  }
  return false;
}

function flushToastQueue() {
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
  const items = _pendingToasts;
  _pendingToasts = [];
  if (!items || items.length === 0) return;

  const last = items[items.length - 1];
  const accounts = new Set(items.map((u) => u.email));
  const accountNote = accounts.size > 1 ? ` · ${accounts.size} hesap` : '';

  if (items.length === 1) {
    emitDesktopToast({
      title: `📧 ${last.from || last.email}`,
      body: last.subject || '(konusuz)',
      email: last.email,
      folderPath: last.folderPath || 'INBOX',
      uid: last.uid,
    });
  } else {
    emitDesktopToast({
      title: `📧 ${accountNote.trim()} (${items.length} yeni e-posta)`,
      body: `${last.from ? last.from + ': ' : ''}${last.subject || '(konusuz)'}`,
      email: last.email,
      folderPath: last.folderPath || 'INBOX',
      uid: last.uid,
    });
  }
  log.info(`[notify] ${items.length} yeni ileti tek afişte birleştirildi (${[...accounts].join(', ')})`);
}

// Toast kuyruğuna ekler; aynı pencerede gelenler tek afişte birleşir.
function queueDesktopToast(item) {
  if (isRecentlyNotified(item)) return;
  _pendingToasts.push(item);
  if (!_toastTimer) {
    _toastTimer = setTimeout(flushToastQueue, COALESCE_WINDOW_MS);
  }
}

// ── Windows Toast (tek mekanizma) ───────────────────────────────────────────
// ÖNCEKİ DÖRT AŞAMALI TASARIMIN SORUNU:
//  1) WinRT toast (her mail için `powershell.exe` süreci — 0,5-2,5 sn gecikme)
//  2) AYRICA Electron `Notification` — ikisi de aynı AUMID ile aynı içerikle
//     çalışıyor, banner birbirinin yerine geçiyordu (çift bildirim).
// Şimdi TEK yol var (WinRT toast). Electron `Notification` yalnızca WinRT
// başarısız olursa yedek olarak devreye girer — mutlak çift bildirim yok.
let _toastSuppressedLogged = false;

function escapeXml(str) {
  return String(str || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function buildToastScript({ title, body, email, folderPath, uid }) {
  const cleanTitle = escapeXml(title || 'Postacı');
  const cleanBody = escapeXml(body || 'Yeni e-posta alındı.');
  const notifIcon = resolveAppIcon(false) || resolveAppIcon(true);
  // appLogoOverride kaynağı mutlaka geçerli bir dosya olmalı; okunamayan yol
  // Windows'ta afişin tamamının düşmesine yol açabiliyor -> yalnızca doğrulanmışsa ekle
  const iconXml =
    notifIcon && notifIcon.toLowerCase().endsWith('.png') && safeExists(notifIcon)
      ? `<image placement="appLogoOverride" hint-crop="circle" src="${notifIcon.replace(/\\/g, '/')}" />`
      : '';

  const encEmail = encodeURIComponent(email || '');
  const encFolder = encodeURIComponent(folderPath || 'INBOX');
  const encUid = encodeURIComponent(String(uid || ''));
  const launchUrl = `postaci://open-message?email=${encEmail}&folderPath=${encFolder}&uid=${encUid}`;
  const escLaunch = launchUrl.replace(/&/g, '&amp;');

  return `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast scenario="reminder" activationType="protocol" launch="${escLaunch}"><visual><binding template="ToastGeneric"><text>${cleanTitle}</text><text>${cleanBody}</text>${iconXml}</binding></visual><actions><action content="E-postayı Aç" arguments="${escLaunch}" activationType="protocol" /></actions></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Priority = [Windows.UI.Notifications.ToastNotificationPriority]::High
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('com.postaci.app').Show($toast)
`;
}

function safeExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// WinRT toast'ı gösterir. Başarısız olursa Electron Notification'a düşer.
// N4: PowerShell'in stderr'i de yakalanır — önceden stderr okunmadığı için
// WinRT hataları tamamen görünmez oluyordu, teşhis imkânsızdı.
function emitDesktopToast(opts) {
  if (process.platform !== 'win32') {
    // WinRT yoksa (macOS/Linux) doğrudan Electron bildirimine düş
    showElectronNotification(opts);
    return;
  }

  const { exec } = require('child_process');
  const psScript = buildToastScript(opts);
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  let settled = false;
  const fallback = (reason) => {
    if (settled) return;
    settled = true;
    log.warn(`[notify] WinRT toast gösterilemedi (${reason}); Electron bildirimine düşülüyor`);
    if (!_toastSuppressedLogged) {
      _toastSuppressedLogged = true;
      log.warn(
        '[notify] Not: Windows "Odak Yardımı / Rahatsız Etmeyin" açıksa ' +
        'bildirimler yalnızca İşlem Merkezi\'ne düşer, afiş çıkmaz. ' +
        'Bu durumda kod hatası değildir.',
      );
    }
    showElectronNotification(opts);
  };

  try {
    const child = exec(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 256 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || err.message || '').trim().slice(0, 300);
          return fallback(detail || `exit=${err.code}`);
        }
        // stderr boş değilse WinRT yine de uyarı üretmiş olabilir (fail-soft durumları)
        const warn = String(stderr || '').trim();
        if (warn) log.warn(`[notify] WinRT uyarısı: ${warn.slice(0, 300)}`);
        settled = true;
      },
    );
    // exec çıktısı biriktir: maxBuffer taşması süreci sessizce öldürüyordu
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
  } catch (e) {
    fallback(e?.message || 'spawn başarısız');
  }
}

function showElectronNotification({ title, body, email, folderPath, uid }) {
  if (!Notification.isSupported()) return;
  try {
    const notifIcon = resolveAppIcon(false);
    const notif = new Notification({
      title: title || 'Postacı',
      body: body || 'Yeni e-posta alındı.',
      icon: (notifIcon && notifIcon.toLowerCase().endsWith('.png')) ? notifIcon : undefined,
      silent: true, // sesi renderer yönetir (ayarlar tek kaynaktan oradan gelir)
    });

    _activeNotifications.add(notif);
    const cleanup = () => _activeNotifications.delete(notif);
    notif.on('close', cleanup);
    notif.on('failed', cleanup);
    notif.on('click', () => {
      cleanup();
      focusAndOpenMessage({ email, folderPath, uid });
    });
    notif.show();
  } catch (e) {
    log.warn('[notify] Electron bildirimi gösterilemedi:', e?.message || e);
  }
}

function focusAndOpenMessage({ email, folderPath, uid }) {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    const created = createWindow();
    // Pencere yeni oluşturulduysa IPC gönderilemez; renderer hazır olunca
    // navigate edebilsin diye hedefi bir kuyruğa bırak.
    if (created && !created.isDestroyed() && email) {
      attachOpenMessageOnReady(created, { email, folderPath, uid });
      return;
    }
    return;
  }
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

// Taze pencerede renderer hazır olana kadar tıklamayı beklet
function attachOpenMessageOnReady(win, payload) {
  try {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('notify:open-message', payload);
          }
        } catch {}
      }, 600);
    });
  } catch {}
}

// Geriye dönük uyum + testler için doğrudan çağrılabilir yüzey
function showDesktopNotification(opts = {}) {
  try {
    if (isInQuietHours()) {
      log.info('[notify] Sessiz saatler devrede — bildirim susturuldu.');
      return false;
    }
    queueDesktopToast(opts);
    return true;
  } catch (err) {
    log.error('[notify] Hata:', err);
    return false;
  }
}

function flushAllPendingToasts() {
  flushToastQueue();
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
          mainWindow.webContents.send('notify:open-message', { email, folderPath, uid });
        }
      } else {
        // Pencere yoksa (tekil örnekte kapatılmış) oluştur ve hedefi ilet
        const created = createWindow();
        if (created && email) attachOpenMessageOnReady(created, { email, folderPath, uid });
      }
    }
  } catch (err) {
    log.warn('[protocol] URL ayrıştırma hatası:', err?.message || err);
  }
}

function notifyNewMessages(accountEmail, newMessages, opts = {}) {
  if (!newMessages || newMessages.length === 0) return;

  const settings = loadSettings();
  const folderPath = opts.folderPath || 'INBOX';
  const quiet = isInQuietHours();

  // N1: Sessiz saatlerde bildirimleri kapat, ama ARAYÜZ TAZELEMESİNİ engelleme.
  // Önceden masaüstü bildirimi susturulup `notify:new-mail` yine gönderiliyordu;
  // renderer ses çalıyordu -> kullanıcı "ses geliyor ama bildirim gelmiyor" diyordu.
  if (!settings.notificationsEnabled) {
    log.info(`[notify] Masaüstü bildirimleri kapalı (${accountEmail}) — sessize alındı.`);
    sendToRenderer(accountEmail, folderPath, newMessages, { quiet: true, muted: true });
    return;
  }
  if (quiet) {
    log.info(`[notify] Sessiz saatler devrede — ${accountEmail} için bildirim susturuldu.`);
    sendToRenderer(accountEmail, folderPath, newMessages, { quiet: true, muted: true });
    return;
  }

  // 1. Görev çubuğunu Turuncu Yanıp Söndür (Taskbar Flash)
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
    try { mainWindow.flashFrame(true); } catch {}
  }

  // 2. Masaüstü bildirimlerini kuyruğa al; hepsi tek afişte birleşir
  for (const m of newMessages) {
    queueDesktopToast({
      email: accountEmail,
      folderPath,
      uid: m.uid,
      from: m.from,
      subject: m.subject,
    });
  }

  // 3. Renderer arayüzüne canlı bildirim ve ses tetikleyici gönder
  sendToRenderer(accountEmail, folderPath, newMessages, { quiet: false, muted: !settings.soundEnabled });
}

function sendToRenderer(accountEmail, folderPath, newMessages, flags) {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('notify:new-mail', {
      email: accountEmail,
      folderPath: folderPath || 'INBOX',
      count: newMessages.length,
      messages: newMessages,
      // N1 + N5: renderer ses ve in-app kart kararını bu bayraklara göre verir.
      // `muted` = ses açık/kapalı ayarı, `quiet` = sessiz saat.
      quiet: !!flags.quiet,
      muted: !!flags.muted,
    });
  } catch (e) {
    log.warn('[notify] Renderer\'a bildirim gönderilemedi:', e?.message || e);
  }
}

module.exports = {
  initNotifications,
  isInQuietHours,
  showDesktopNotification,
  handleProtocolUrl,
  notifyNewMessages,
  flushAllPendingToasts,
  DEFAULT_NOTIFICATION_SETTINGS,
  _activeNotifications,
};