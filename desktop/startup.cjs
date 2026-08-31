const fs = require('node:fs');
const path = require('node:path');

function describeStartupError(error) {
  const messages = [];
  const visited = new Set();
  for (let current = error; current && !visited.has(current); current = current.cause) {
    visited.add(current);
    messages.push((current.code ? current.code + ': ' : '') + (current.message || String(current)));
  }
  return messages.join('\nNeden: ') || 'Bilinmeyen başlangıç hatası.';
}

function recordStartupError(userDataDir, error) {
  const detail = describeStartupError(error);
  const logPath = path.join(userDataDir, 'startup-error.log');
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(logPath, new Date().toISOString() + '\n' + detail + '\n', { mode: 0o600 });
    return detail + '\n\nHata kaydı: ' + logPath;
  } catch {
    return detail + '\n\nHata kaydı diske yazılamadı. Veri klasörü izinlerini kontrol edin.';
  }
}

module.exports = { describeStartupError, recordStartupError };
