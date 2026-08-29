const { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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
      const serverBundle = path.join(__dirname, '../dist/server/index.cjs');
      console.log('🚀 Starting internal Postacı server:', serverBundle);
      require(serverBundle);
    } catch (err) {
      console.error('Failed to start internal server:', err);
      dialog.showErrorBox('Sunucu Başlatma Hatası', 'Postacı sunucusu başlatılamadı:\n' + err.message);
    }
  }
}

// Generate modern Tray Icon
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="3" fill="#0f172a"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>`;
  return nativeImage.createFromBuffer(Buffer.from(svg));
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
  const iconPath = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Postacı — Yeni Nesil E-Posta İstemcisi',
    backgroundColor: '#090d16',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    const indexPath = path.join(__dirname, '../dist/client/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    if (!desktopSettings.startMinimized) {
      mainWindow.show();
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

app.whenReady().then(() => {
  desktopSettings = loadDesktopSettings();
  startBackend();
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
ipcMain.on('notify', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Postacı',
      body: body || 'Yeni bir bildirim aldınız.',
      icon: createTrayIcon(),
    }).show();
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
