// electron/ipc/shell-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain, shell } = require('electron');

function register(_deps) {

ipcMain.handle('shell:open-external', (_evt, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:') || url.startsWith('ms-settings:'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

}

module.exports = { register };
