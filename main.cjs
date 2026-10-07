const { app, BrowserWindow, nativeImage, Tray, Menu, MenuItem, shell } = require('electron');

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
  try { require('./electron/logger.cjs').log.error('[uncaughtException]', err); } catch {}
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] İşlenmemiş Promise Reddi (Unhandled Rejection):', reason);
  try { require('./electron/logger.cjs').log.error('[unhandledRejection]', reason); } catch {}
});

// 4. Windows Görev Çubuğu ve Bildirim Eşleşmesi (AUMID)
try {
  app.setAppUserModelId('com.postaci.app');
} catch {}

const path = require('path');
const { initDb, getSetting } = require('./electron/db.cjs');

// ── Taşınan modüller (electron/) ──────────────────────────────────────────
const { resolveAppIcon, ensureWindowsShortcut, syncStartupSettings } = require('./electron/shell-integration.cjs');
const { initNotifications, handleProtocolUrl } = require('./electron/notifications.cjs');
const { initBackgroundSync, runBackgroundSync, updateBackgroundSyncSchedule } = require('./electron/background-sync.cjs');

let mainWindow = null;
initNotifications({ getMainWindow: () => mainWindow, createWindow: () => createWindow() });
initBackgroundSync({ getMainWindow: () => mainWindow });


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
  const { initLogger } = require('./electron/logger.cjs');
  const applog = initLogger(app.getPath('userData'));
  applog.info(`[start] Postacı v${app.getVersion()} açıldı`);
  const { registerIpc } = require('./electron/ipc.cjs');
  registerIpc({ getMainWindow: () => mainWindow, getTray: () => tray });

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
  try {
    require('./electron/updater.cjs').initUpdater(() => mainWindow);
  } catch (e) {
    console.warn('[updater] başlatılamadı:', e?.message);
  }
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
