const { app, BrowserWindow, ipcMain, safeStorage, dialog, Notification, nativeImage, Tray, Menu, shell } = require('electron');

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

// 3. Windows Görev Çubuğu ve Bildirim Eşleşmesi (AUMID)
try {
  app.setAppUserModelId('com.postaci.app');
} catch {}

const path = require('path');
const fs = require('fs');
const { initDb, getDb, getStats, listAccounts, getAccountById, getAccountByEmail, updateAccount, deleteAccount, updateTokens, addAccount, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, saveMessageBody, markReadDb, markUnreadDb, toggleStarDb, batchMarkReadDb, batchToggleStarDb, searchContacts, saveSentMessage, saveDraftMessage, listAttachments, saveAttachments, getSetting, setSetting, getAllUnreadCounts } = require('./electron/db.cjs');
const { startOAuthFlow } = require('./electron/auth.cjs');
const { refreshAccessToken, emailFromIdToken, fetchProfileEmail, syncInbox, syncFolder, fetchBody, fetchAttachment, markSeen, markUnseen, createTransporter, buildRaw, sendRaw, appendToSent, verifyImap, listFolders, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, moveToFolder, batchMoveToFolder, withClient } = require('./electron/mail.cjs');
const { detectSettings } = require('./electron/providers.cjs');
const { splitAddresses, buildReply, buildForward } = require('./electron/compose.cjs');

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
    const password = dec(account.password_enc);
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

function cleanupConflictingShortcuts() {
  if (process.platform !== 'win32') return;
  try {
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    // 1. Electron'un otomatik oluşturduğu veya eski artık Electron.lnk kısayolunu sil (2. kurulum gibi görünmesini engeller)
    const electronLnk = path.join(startMenuDir, 'Electron.lnk');
    if (fs.existsSync(electronLnk)) {
      try { fs.unlinkSync(electronLnk); } catch {}
    }
    // 2. Geliştirme modunda node_modules/electron.exe'ye işaret eden kısayolları temizle (tıklamada path-to-app hatasını engeller)
    const devLnk = path.join(startMenuDir, 'Postacı.lnk');
    if (!app.isPackaged && fs.existsSync(devLnk)) {
      try {
        const details = shell.readShortcutLink(devLnk);
        if (details && details.target && details.target.toLowerCase().includes('node_modules')) {
          fs.unlinkSync(devLnk);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[shortcut] Kısayol temizleme hatası:', err?.message);
  }
}

let mainWindow = null;
const _activeNotifications = new Set();

function showDesktopNotification({ title, body, email, folderPath, uid, silent = false }) {
  try {
    if (!Notification.isSupported()) return;
    const notifIcon = resolveAppIcon(false) || resolveAppIcon(true);
    const notif = new Notification({
      title: title || 'Postacı',
      body: body || 'Yeni e-posta alındı.',
      icon: notifIcon || undefined,
      silent: !!silent,
      urgency: 'normal',
    });

    // V8 Garbage Collector'ın bildirim nesnesini bellekten erken silmesini ve
    // Windows Toast tıklama olaylarının düşmesini engellemek için referansı sakla
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

    notif.show();
  } catch (err) {
    console.error('[notification] Hata:', err);
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
      syncIntervalMinutes: 3,
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
        // Son 90 saniyede kullanıcı/arayüz zaten bu hesabı senkronize ettiyse arka planda tekrar çekme
        if (Date.now() - lastSync < 90000) {
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
          if (settings.notificationsEnabled) {
            if (res.newMessages.length === 1) {
              const m = res.newMessages[0];
              showDesktopNotification({
                title: `📧 ${m.from || acc.email}`,
                body: m.subject || '(konusuz)',
                email: acc.email,
                folderPath: 'INBOX',
                uid: m.uid,
                silent: !settings.soundEnabled,
              });
            } else {
              const last = res.newMessages[res.newMessages.length - 1];
              showDesktopNotification({
                title: `📧 ${acc.email} (${res.newMessages.length} yeni e-posta)`,
                body: `${last.from ? last.from + ': ' : ''}${last.subject || '(konusuz)'}`,
                email: acc.email,
                folderPath: 'INBOX',
                uid: last.uid,
                silent: !settings.soundEnabled,
              });
            }
          }

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
      await new Promise((r) => setTimeout(r, 1200)); // sağlayıcılar arası sakin geçiş
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
    syncIntervalMinutes: 3,
    soundEnabled: true,
  });

  const minutes = Number(settings.syncIntervalMinutes) || 0;
  if (minutes > 0) {
    const ms = minutes * 60 * 1000;
    bgSyncTimer = setInterval(() => {
      runBackgroundSync().catch((e) => console.error('[bg-sync] hata:', e));
    }, ms);
    console.log(`[bg-sync] Arka plan senkronizasyonu devrede (${minutes} dk aralıkla).`);
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

  mainWindow = win;

  win.once('ready-to-show', () => {
    if (behavior.startMinimized) {
      win.hide();
      if (behavior.hideTaskbarOnMinimize) {
        win.setSkipTaskbar(true);
      }
    } else {
      win.show();
    }
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
  ipcMain.handle('accounts:list', () => listAccounts());
  ipcMain.handle('auth:start', async (_evt, provider) => {
    const tokens = await startOAuthFlow(provider);
    // E-posta: önce id_token'dan (her zaman elimizde), olmazsa profil API'sinden.
    let profile = emailFromIdToken(tokens.id_token);
    if (!profile.email) {
      profile = await fetchProfileEmail(provider, tokens.access_token).catch(() => ({ email: null, name: null }));
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
    if (profile.email) addAccount(saved);
    return saved;
  });
  ipcMain.on('app:get-version-sync', (event) => {
    try {
      event.returnValue = app.getVersion();
    } catch {
      event.returnValue = '1.0.10';
    }
  });
  ipcMain.handle('accounts:add', (_evt, acc) => addAccount(acc));
  ipcMain.handle('accounts:get', async (_evt, id) => {
    return getAccountById(id);
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
    const creds = await freshCredentials(acc);
    return imapLock(email, () => syncInbox({ provider: acc.provider, email: acc.email, db: getDb(), ...creds }));
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
    const normEmail = (email || '').toLowerCase().trim();
    _lastSyncTime.set(normEmail, Date.now());
    const creds = await freshCredentials(acc);
    return imapLock(email, () => syncFolder({
      provider: acc.provider, email: acc.email, folderPath, db: getDb(), ...creds,
      skipUid: (uid) => isDeleted(email, folderPath, String(uid)),
    }));
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
        results.push({ email: acc.email, ...res });
      } catch (e) {
        results.push({ email: acc.email, error: e?.message || e });
      }
    }
    return results;
  });
  ipcMain.handle('mail:sync-more', async (_evt, email, folderPath, beforeUid, limit) => {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    return imapLock(email, () => syncFolder({
      provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX',
      db: getDb(), limit: limit || 50, beforeUid: beforeUid || null,
      ...creds,
      skipUid: (uid) => isDeleted(email, folderPath, String(uid)),
    }));
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

  ipcMain.handle('mail:save-draft', async (_evt, { email, to, subject, text, html }) => {
    if (!email) return false;
    try {
      return saveDraftMessage(email, { to, subject, text, html });
    } catch (e) {
      console.error('[mail:save-draft] error:', e);
      return false;
    }
  });

  ipcMain.handle('mail:send', async (_evt, { fromEmail, to, cc, subject, text, html, inReplyTo, references, attachments }) => {
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
    const raw = await buildRaw({ from: acc.email, to: toList, cc: splitAddresses(cc), subject: subject || '(konusuz)', text, html, inReplyTo, references, attachments: atts });
    let info;
    try {
      info = await sendRaw(transporter, raw, { from: acc.email, to: [...toList, ...splitAddresses(cc)] });
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
      subject: meta.subject,
      date: meta.date,
      html: b.body_html,
      text: b.body_text,
      messageId: b.message_id,
      references: b.references || [],
    };
    return mode === 'reply' ? buildReply(original) : buildForward(original);
  }
  ipcMain.handle('mail:reply-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'reply'));
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
      syncIntervalMinutes: 3,
      soundEnabled: true,
    });
  });
  ipcMain.handle('notifications:save-settings', (_evt, newSettings) => {
    const current = getSetting('notification_settings', {
      notificationsEnabled: true,
      syncIntervalMinutes: 3,
      soundEnabled: true,
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
    return true;
  });
  ipcMain.handle('app:get-settings', () => {
    return getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
    });
  });
  ipcMain.handle('app:save-settings', (_evt, newSettings) => {
    const current = getSetting('app_behavior_settings', {
      launchOnStartup: false,
      startMinimized: false,
      hideTaskbarOnMinimize: true,
      closeToQuit: false,
      useGmailShortcuts: true,
    });
    const updated = { ...current, ...newSettings };
    setSetting('app_behavior_settings', updated);

    if (typeof updated.launchOnStartup === 'boolean') {
      try {
        app.setLoginItemSettings({
          openAtLogin: updated.launchOnStartup,
          args: updated.startMinimized ? ['--minimized'] : [],
        });
      } catch (err) {
        console.warn('[settings] setLoginItemSettings hatası:', err?.message);
      }
    }

    return updated;
  });

  ipcMain.handle('shell:open-external', (_evt, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  cleanupConflictingShortcuts();
  try {
    app.setAppUserModelId('com.postaci.app');
  } catch {}

  createTray();
  createWindow();
  updateBackgroundSyncSchedule();
  setTimeout(() => {
    runBackgroundSync().catch(() => {});
  }, 90000);
});

app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  // Bildirime tıklanması veya uygulamanın tekrar çalıştırılması halinde mevcut pencereyi öne getir
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
  }
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
