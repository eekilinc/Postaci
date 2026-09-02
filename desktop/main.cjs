const { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu, nativeImage, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { recordStartupError } = require('./startup.cjs');
const { findOAuthCallbackArg } = require('./oauth-protocol.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let PORT = process.env.PORT || 3001;
const ownsInstance = app.requestSingleInstanceLock();
let pendingOAuthReturn = Boolean(findOAuthCallbackArg(process.argv));
if (!ownsInstance) app.quit();

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on('second-instance', (_event, argv) => {
  if (findOAuthCallbackArg(argv)) pendingOAuthReturn = true;
  focusMainWindow();
});
app.on('open-url', (event, url) => {
  if (!findOAuthCallbackArg([url])) return;
  event.preventDefault();
  pendingOAuthReturn = true;
  focusMainWindow();
});

// Default Desktop Preferences
const defaultSettings = {
  minimizeToTrayOnClose: true,
  minimizeToTrayOnMinimize: true,
  autoStartOnBoot: false,
  startMinimized: false,
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop_settings.json');
}

function loadDesktopSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
    }
  } catch (err) {
    console.warn('Failed to load desktop settings:', err);
  }
  return { ...defaultSettings };
}

function saveDesktopSettings(settings) {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');

    // Apply auto-start setting
    if (app.setLoginItemSettings) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.autoStartOnBoot),
        openAsHidden: Boolean(settings.startMinimized),
      });
    }
  } catch (err) {
    console.warn('Failed to save desktop settings:', err);
  }
}

let desktopSettings = loadDesktopSettings();

async function startBackend() {
  if (!isDev) {
    try {
      const userDataDir = path.join(app.getPath('userData'), 'data');
      if (!fs.existsSync(userDataDir)) {
        try {
          fs.mkdirSync(userDataDir, { recursive: true });
        } catch (e) {
          console.warn('Could not create userData data dir:', e);
        }
      }
      process.env.POSTACI_DATA_DIR = userDataDir;
      // Let Windows choose a free port instead of conflicting with other local services.
      process.env.PORT = process.env.PORT || '0';
      process.env.POSTACI_DESKTOP = '1';
      process.env.NODE_ENV = 'production';
      if (safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')) {
        globalThis.__postaciKeychain = {
          encrypt: value => safeStorage.encryptString(value).toString('base64'),
          decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64')),
        };
      } else {
        console.warn('OS keychain unavailable; credentials use a local key protected by filesystem permissions.');
      }

      const candidates = [
        path.join(__dirname, '../dist/server/index.cjs'),
        path.join(__dirname, 'dist/server/index.cjs'),
        path.join(process.resourcesPath, 'app.asar/dist/server/index.cjs'),
        path.join(process.resourcesPath, 'app/dist/server/index.cjs'),
        path.join(process.resourcesPath, 'dist/server/index.cjs')
      ];
      const serverBundle = candidates.find(c => fs.existsSync(c)) || candidates[0];
      console.log('🚀 Starting internal Postacı server from:', serverBundle);
      const backend = require(serverBundle);
      const address = await backend.serverReady;
      if (!address?.port) throw new Error('Sunucu hazır olma bilgisi alınamadı.');
      PORT = address.port;
    } catch (err) {
      console.error('Failed to start internal server:', err);
      dialog.showErrorBox('Sunucu Başlatma Hatası', 'Postacı sunucusu başlatılamadı:\n' + recordStartupError(app.getPath('userData'), err));
      return false;
    }
  }
  return true;
}

// Generate modern Tray Icon
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  const fallbackPath = path.join(__dirname, 'icon.png');
  if (fs.existsSync(fallbackPath)) {
    return nativeImage.createFromPath(fallbackPath).resize({ width: 32, height: 32 });
  }
  return nativeImage.createEmpty();
}

function setupTray() {
  if (tray) return;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Postacı — Yeni Nesil E-Posta İstemcisi');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📬 Postacı\'yı Göster',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '⚡ Hızlı E-Posta Yaz',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app-action', 'compose');
        }
      },
    },
    {
      label: '🔄 Şimdi Senkronize Et',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('app-action', 'sync');
        }
      },
    },
    { type: 'separator' },
    {
      label: '⚙️ Ayarlar',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app-action', 'settings');
        }
      },
    },
    { type: 'separator' },
    {
      label: '❌ Tamamen Çıkış Yap',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createWindow() {
  const iconPath = process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'icon.ico'))
    ? path.join(__dirname, 'icon.ico')
    : path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Postacı — Yeni Nesil E-Posta İstemcisi',
    backgroundColor: '#ffffff',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = ['http://127.0.0.1:' + PORT, ...(isDev ? ['http://127.0.0.1:5173'] : [])];
    if (!allowed.includes(new URL(url).origin)) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  const indexPath = path.join(__dirname, '../dist/client/index.html');

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173').catch(() => {
      if (fs.existsSync(indexPath)) {
        mainWindow.loadURL('http://127.0.0.1:' + PORT);
      }
    });
  } else {
    // In production desktop: Load the local bundled HTML immediately
    mainWindow.loadURL('http://127.0.0.1:' + PORT).catch((err) => {
      console.warn('Failed to load local HTML, trying HTTP fallback:', err);
      mainWindow.loadURL('http://127.0.0.1:' + PORT);
    });
  }

  // A subframe/resource failure must never trigger a full-window reload loop.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) console.error('Uygulama sayfası yüklenemedi:', errorDescription);
  });

  // Handle renderer crash / white screen auto-recovery
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
    if (details.reason !== 'clean-exit') {
      console.log('Auto-recovering window after renderer crash...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (isDev) {
            mainWindow.loadURL('http://127.0.0.1:5173');
          } else if (fs.existsSync(indexPath)) {
            mainWindow.loadURL('http://127.0.0.1:' + PORT);
          } else {
            mainWindow.loadURL('http://127.0.0.1:' + PORT);
          }
        }
      }, 600);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive, attempting soft reload...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!desktopSettings.startMinimized) {
      mainWindow.show();
      mainWindow.focus();
      if (mainWindow.webContents) {
        mainWindow.webContents.focus();
      }
    }
  });

  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  });

  // Minimize to tray if enabled
  mainWindow.on('minimize', (event) => {
    if (desktopSettings.minimizeToTrayOnMinimize) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Close to tray if enabled
  mainWindow.on('close', (event) => {
    if (!isQuitting && desktopSettings.minimizeToTrayOnClose) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // DevTools shortcut (F12 or Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!ownsInstance) return;
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('postaci', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('postaci');
  }
  desktopSettings = loadDesktopSettings();
  if (!await startBackend()) { app.quit(); return; }

  createWindow();
  setupTray();
  if (pendingOAuthReturn) {
    pendingOAuthReturn = false;
    focusMainWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !desktopSettings.minimizeToTrayOnClose) {
    app.quit();
  }
});

function isTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false;
  try {
    return ['http://127.0.0.1:' + PORT, ...(isDev ? ['http://127.0.0.1:5173'] : [])].includes(new URL(event.senderFrame.url).origin);
  } catch { return false; }
}

// IPC: Settings
ipcMain.handle('get-desktop-settings', (event) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  desktopSettings = loadDesktopSettings();
  return desktopSettings;
});

ipcMain.handle('set-desktop-settings', (event, newSettings) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  newSettings = Object.fromEntries(Object.keys(defaultSettings).filter(k => typeof newSettings?.[k] === 'boolean').map(k => [k, newSettings[k]]));
  desktopSettings = { ...desktopSettings, ...newSettings };
  saveDesktopSettings(desktopSettings);
  return desktopSettings;
});

// IPC: Notifications
ipcMain.on('notify', (event, { title, body, emailId, accountId }) => {
  if (!isTrustedSender(event)) return;
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: title || 'Postacı',
      body: body || 'Yeni bir bildirim aldınız.',
      icon: createTrayIcon(),
    });

    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (emailId) {
          mainWindow.webContents.send('open-email', { emailId, accountId });
        }
      }
    });

    notif.show();
  }
});

ipcMain.on('set-badge', (event, count) => {
  if (!isTrustedSender(event)) return;
  if (app.setBadgeCount) {
    app.setBadgeCount(count || 0);
  }
});

// IPC: External Link
ipcMain.on('open-external', (event, url) => {
  if (!isTrustedSender(event)) return;
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    shell.openExternal(url);
  }
});

// OAuth uses the system browser; embedded user agents are not supported by Google.
ipcMain.handle('open-oauth-window', async (event, url) => {
  if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
  const parsed = new URL(url);
  if (parsed.origin !== 'https://accounts.google.com' || parsed.pathname !== '/o/oauth2/v2/auth') throw new Error('Invalid OAuth URL');
  await shell.openExternal(parsed.href);
  return { opened: true };
});
