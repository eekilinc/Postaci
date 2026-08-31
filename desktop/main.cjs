const { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = process.env.PORT || 3001;

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

function startBackend() {
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

      const candidates = [
        path.join(__dirname, '../dist/server/index.cjs'),
        path.join(__dirname, 'dist/server/index.cjs'),
        path.join(process.resourcesPath, 'app.asar/dist/server/index.cjs'),
        path.join(process.resourcesPath, 'app/dist/server/index.cjs'),
        path.join(process.resourcesPath, 'dist/server/index.cjs')
      ];
      const serverBundle = candidates.find(c => fs.existsSync(c)) || candidates[0];
      console.log('🚀 Starting internal Postacı server from:', serverBundle);
      require(serverBundle);
    } catch (err) {
      console.error('Failed to start internal server:', err);
      dialog.showErrorBox('Sunucu Başlatma Hatası', 'Postacı sunucusu başlatılamadı:\n' + (err.stack || err.message));
    }
  }
}

function waitForServer(url = 'http://127.0.0.1:3001/api/system/health', timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() - start < timeoutMs) {
          setTimeout(check, 150);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (Date.now() - start < timeoutMs) {
          setTimeout(check, 150);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(500, () => req.destroy());
    };
    check();
  });
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
      sandbox: false,
      webSecurity: false,
    },
  });

  const indexPath = path.join(__dirname, '../dist/client/index.html');

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173').catch(() => {
      if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath);
      }
    });
  } else {
    // In production desktop: Load the local bundled HTML immediately
    mainWindow.loadFile(indexPath).catch((err) => {
      console.warn('Failed to load local HTML, trying HTTP fallback:', err);
      mainWindow.loadURL('http://127.0.0.1:3001');
    });
  }

  // Handle any failed loads gracefully
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`Page load failed: ${validatedURL} (${errorCode}: ${errorDescription}), reloading local bundle...`);
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    }
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
            mainWindow.loadFile(indexPath);
          } else {
            mainWindow.loadURL('http://127.0.0.1:3001');
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

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.whenReady().then(async () => {
  desktopSettings = loadDesktopSettings();
  startBackend();

  if (!isDev) {
    // Wait for the internal backend server to be healthy before displaying the UI
    await waitForServer(`http://127.0.0.1:${PORT}/api/system/health`, 8000);
  }

  createWindow();
  setupTray();

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

// IPC: Settings
ipcMain.handle('get-desktop-settings', () => {
  desktopSettings = loadDesktopSettings();
  return desktopSettings;
});

ipcMain.handle('set-desktop-settings', (_event, newSettings) => {
  desktopSettings = { ...desktopSettings, ...newSettings };
  saveDesktopSettings(desktopSettings);
  return desktopSettings;
});

// IPC: Notifications
ipcMain.on('notify', (_event, { title, body, emailId, accountId }) => {
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

ipcMain.on('set-badge', (_event, count) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(count || 0);
  }
});

// IPC: External Link
ipcMain.on('open-external', (_event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    shell.openExternal(url);
  }
});

// IPC: OAuth Popup Window (Embedded Dialog with Clean Chrome User-Agent)
ipcMain.handle('open-oauth-window', async (_event, url) => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 540,
      height: 700,
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      modal: true,
      show: true,
      title: 'Google Girişi — Postacı',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    });

    const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    authWindow.webContents.setUserAgent(chromeUserAgent);

    authWindow.loadURL(url, { userAgent: chromeUserAgent });

    authWindow.webContents.on('did-finish-load', () => {
      const currentUrl = authWindow.webContents.getURL();
      if (currentUrl.includes('/api/auth/google/callback') && !currentUrl.includes('error=')) {
        setTimeout(() => {
          if (!authWindow.isDestroyed()) {
            authWindow.close();
          }
          resolve({ success: true });
        }, 1500);
      }
    });

    authWindow.on('closed', () => {
      resolve({ closed: true });
    });
  });
});
