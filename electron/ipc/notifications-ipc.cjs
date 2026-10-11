// electron/ipc/notifications-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain } = require('electron');
const { listAccounts, getSetting, setSetting } = require('../db.cjs');
const { showDesktopNotification, flushAllPendingToasts, DEFAULT_NOTIFICATION_SETTINGS } = require('../notifications.cjs');
const { updateBackgroundSyncSchedule } = require('../background-sync.cjs');

function register(deps) {
  const { getMainWindow } = deps;

ipcMain.handle('notifications:get-settings', () => {
  // Varsayılanlar notifications.cjs'teki TEK kaynaktan gelir ve getSetting
  // kayıtlı ayarla birleştirir (eksik anahtar kalmaz).
  return getSetting('notification_settings', DEFAULT_NOTIFICATION_SETTINGS);
});

ipcMain.handle('notifications:save-settings', (_evt, newSettings) => {
  const current = getSetting('notification_settings', DEFAULT_NOTIFICATION_SETTINGS);
  const updated = { ...current, ...(newSettings || {}) };
  setSetting('notification_settings', updated);
  updateBackgroundSyncSchedule();
  return updated;
});

ipcMain.handle('notifications:test', () => {
  const accs = listAccounts();
  const targetEmail = accs.length > 0 ? accs[0].email : '';
  // Test bildirimi birleştirme penceresini beklemesin: göster ve hemen boşalt
  showDesktopNotification({
    title: '📧 Postacı — Test Bildirimi',
    body: 'Windows masaüstü bildirimleri aktif! Tıklayarak gelen kutunuza gidebilirsiniz.',
    email: targetEmail,
    folderPath: 'INBOX',
    uid: 'test-' + Date.now(),
  });
  flushAllPendingToasts();
  if (getMainWindow() && !getMainWindow().isDestroyed()) {
    try { getMainWindow().flashFrame(true); } catch {}
    getMainWindow().webContents.send('notify:new-mail', {
      email: targetEmail,
      folderPath: 'INBOX',
      count: 1,
      messages: [{ uid: 'test', subject: 'Postacı test bildirimi başarıyla alındı!', from: 'Postacı Ekibi' }],
      quiet: false,
      muted: false,
    });
  }
  return true;
});

}

module.exports = { register };
