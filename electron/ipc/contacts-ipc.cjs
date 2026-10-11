// electron/ipc/contacts-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain } = require('electron');
const { searchContacts, listContacts, upsertContact, deleteContact } = require('../db.cjs');

function register(_deps) {

ipcMain.handle('contacts:search', async (_evt, query) => {
  try {
    return searchContacts(query);
  } catch {
    return [];
  }
});

ipcMain.handle('contacts:list', async (_evt, query) => {
  try {
    return listContacts(query);
  } catch (e) {
    console.error('[contacts:list] error:', e);
    return [];
  }
});

ipcMain.handle('contacts:upsert', async (_evt, contact) => {
  try {
    return upsertContact(contact);
  } catch (e) {
    console.error('[contacts:upsert] error:', e);
    throw e;
  }
});

ipcMain.handle('contacts:delete', async (_evt, id) => {
  try {
    return deleteContact(id);
  } catch (e) {
    console.error('[contacts:delete] error:', e);
    return false;
  }
});

}

module.exports = { register };
