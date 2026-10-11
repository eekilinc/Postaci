// electron/ipc/logs-ipc.cjs - tani loglari (logs:*)
//
// DİKKAT (2026-10-11 düzeltmesi): bu handler'lar main.cjs'ten (kök dizin)
// taşınırken gövdedeki gecikmeli require('./electron/logger.cjs') yolu
// düzeltilmemişti — electron/ altında bu yol 'electron/electron/...' olarak
// çözümleniyor, handler hatayı try/catch ile yutuyor ve "Log Klasörünü Aç"
// düğmesi v1.0.52'den beri SESSİZCE hiçbir şey yapmıyordu. ipc-static.test.ts
// artık tüm göreli require yollarını çözümleyerek bu sınıfı kilitler.

const { app, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { logPath } = require('../logger.cjs');

function register(_deps) {

  // Tanı logları: yolu ver (Ayarlar > Gelişmiş)
  ipcMain.handle('logs:get-path', () => {
    try {
      return logPath(app.getPath('userData'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('logs:open-folder', async () => {
    try {
      const dir = path.dirname(logPath(app.getPath('userData')));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      return { ok: !err, error: err || null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

}

module.exports = { register };