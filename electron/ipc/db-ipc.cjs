// electron/ipc/db-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain } = require('electron');
const fs = require('node:fs');
const { getStats, getDbPath, vacuumDb } = require('../db.cjs');

function register(_deps) {

ipcMain.handle('db:stats', () => getStats());

// Sistem Bilgisi: RAM, DB boyutu, Electron/Node/Chrome versiyonları
ipcMain.handle('db:system-info', async () => {
  const memUsage = process.memoryUsage();
  const dbFilePath = getDbPath();
  let dbSizeBytes = 0;
  if (dbFilePath) {
    try { dbSizeBytes = fs.statSync(dbFilePath).size; } catch {}
  }
  return {
    ram: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
      rssMB: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
      externalMB: Math.round(memUsage.external / 1024 / 1024 * 10) / 10,
    },
    db: {
      sizeBytes: dbSizeBytes,
      sizeMB: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
      path: dbFilePath,
    },
    versions: {
      electron: process.versions.electron || '?',
      node: process.versions.node || '?',
      chrome: process.versions.chrome || '?',
      v8: process.versions.v8 || '?',
    },
  };
});

// DB Vakum (VACUUM + optimize) — Gelişmiş sekmesi "Önbelleği Temizle" butonu
ipcMain.handle('db:vacuum', () => {
  vacuumDb();
  return true;
});

}

module.exports = { register };
