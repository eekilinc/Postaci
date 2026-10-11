// electron/ipc/logs-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { app, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function register(_deps) {

// Tanı logları: yolu ver + klasörü aç (Ayarlar > Gelişmiş)
ipcMain.handle('logs:get-path', () => {
  try {
    return require('./electron/logger.cjs').logPath(app.getPath('userData'));
  } catch {
    return null;
  }
});

ipcMain.handle('logs:open-folder', async () => {
  try {
    const p = require('./electron/logger.cjs').logPath(app.getPath('userData'));
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return { ok: !err, error: err || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

}

module.exports = { register };
