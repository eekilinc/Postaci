// electron/logger.cjs - dosya loglama (electron-log)
//
// Kurulum (bir kez, main.cjs'te initDb'den sonra):
//   const { initLogger, log } = require('./electron/logger.cjs');
//   initLogger(app.getPath('userData'));
//
// Yazım yeri: <userData>/logs/main.log (günlük rotasyon, 5MB üst sınır).
// Dev'de de çalışır; paketlide file transport etkindir.
const path = require('path');

let log = console;
let started = false;

function initLogger(userDataPath) {
  if (started) return log;
  started = true;
  try {
    const elog = require('electron-log');
    elog.transports.file.resolvePathFn = () =>
      path.join(userDataPath, 'logs', 'main.log');
    elog.transports.file.maxSize = 5 * 1024 * 1024;
    elog.transports.file.level = 'info';
    elog.transports.console.level = 'warn';
    log = elog;
  } catch (e) {
    console.warn('[logger] electron-log yüklenemedi, console kullanılacak:', e?.message);
  }
  return log;
}

function logPath(userDataPath) {
  return path.join(userDataPath, 'logs', 'main.log');
}

module.exports = { initLogger, logPath, get log() { return log; } };
