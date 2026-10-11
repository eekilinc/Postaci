// electron/ipc/dialog-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain, dialog } = require('electron');
const fs = require('node:fs');

function register(deps) {
  const { getMainWindow } = deps;

// Dosya Seç Dialog (özel arkaplan resmi için)
ipcMain.handle('dialog:open-file', async (_evt, { filters, title } = {}) => {
  if (!getMainWindow() || getMainWindow().isDestroyed()) return null;
  const result = await dialog.showOpenDialog(getMainWindow(), {
    title: title || 'Dosya Seç',
    properties: ['openFile'],
    filters: filters || [
      { name: 'Resim Dosyaları', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] },
      { name: 'Tüm Dosyalar', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  try {
    const data = fs.readFileSync(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };
    const mime = mimeMap[ext] || 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

}

module.exports = { register };
