// electron/updater.cjs - electron-updater kablolaması (otomatik güncelleme)
//
// Kurulum gerektirir (bir kez, main.cjs'ten):
//   const { initUpdater } = require('./electron/updater.cjs');
//   initUpdater(() => mainWindow);
//
// Davranış:
// - Sadece paketlenmiş uygulamada çalışır (dev'de sessizce atlanır).
// - Açılıştan 30sn sonra sessiz kontrol; bulursa arka planda indirir.
// - Uygulama kapanırken otomatik kurar (autoInstallOnAppQuit).
// - Durum renderer'a 'updater:status' olayıyla iletilir (checking|available|
//   downloading|downloaded|none|error). Arayüz bildirimi Faz 2'de.
// - Ayarlar ekranı için IPC: updater:check, updater:quit-install.
const { app, ipcMain } = require('electron');

let started = false;

function currentWin(getWin) {
  try {
    const w = getWin();
    return w && !w.isDestroyed() ? w : null;
  } catch {
    return null;
  }
}

function send(getWin, payload) {
  const w = currentWin(getWin);
  if (w) {
    try {
      w.webContents.send('updater:status', payload);
    } catch {}
  }
}

function initUpdater(getWin) {
  if (started) return;
  started = true;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('[updater] electron-updater yüklenemedi:', e?.message);
    return;
  }
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send(getWin, { state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send(getWin, { state: 'available', version: info?.version || null }),
  );
  autoUpdater.on('update-not-available', () => send(getWin, { state: 'none' }));
  autoUpdater.on('download-progress', (p) =>
    send(getWin, { state: 'downloading', percent: Math.round(p?.percent || 0) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send(getWin, { state: 'downloaded', version: info?.version || null }),
  );
  autoUpdater.on('error', (err) =>
    send(getWin, { state: 'error', message: String(err?.message || err).slice(0, 300) }),
  );

  ipcMain.handle('updater:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, version: r?.updateInfo?.version || null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 300) };
    }
  });
  ipcMain.handle('updater:quit-install', () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30_000);
}

module.exports = { initUpdater };
