// electron/ipc/app-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { app, ipcMain, nativeImage } = require('electron');
const { getSetting, setSetting } = require('../db.cjs');
const { syncStartupSettings } = require('../shell-integration.cjs');

function register(deps) {
  const { getMainWindow, getTray } = deps;

ipcMain.on('app:get-version-sync', (event) => {
  try {
    event.returnValue = app.getVersion();
  } catch {
    event.returnValue = '1.0.16';
  }
});

ipcMain.handle('app:set-spellcheck', async (_evt, enabled) => {
  try {
    if (getMainWindow()?.webContents?.session) {
      getMainWindow().webContents.session.setSpellCheckerEnabled(Boolean(enabled));
    }
    return true;
  } catch (e) {
    console.error('[app:set-spellcheck] error:', e);
    return false;
  }
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

// Windows Görev Çubuğu Rozeti — okunmamış sayısı
ipcMain.handle('app:set-badge', (_evt, count) => {
  if (!getMainWindow() || getMainWindow().isDestroyed()) return false;
  try {
    if (!count || count <= 0) {
      getMainWindow().setOverlayIcon(null, '');
      if (getTray() && !getTray().isDestroyed()) getTray().setToolTip('Postacı - E-posta İstemcisi');
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
    getMainWindow().setOverlayIcon(img, `${count} okunmamış ileti`);
    if (getTray() && !getTray().isDestroyed()) getTray().setToolTip(`Postacı — ${count} okunmamış`);
    return true;
  } catch (e) {
    console.warn('[badge] setOverlayIcon hatası:', e?.message);
    return false;
  }
});

}

module.exports = { register };
