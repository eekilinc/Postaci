// electron/ipc/mail-read-ipc.cjs — okuma kanallari (list/count/search/thread/body/attachments/export).
// mail-ipc.cjs'in alt grubu; ipc.cjs yukleyicisi tarafindan kaydettirilir.
// Sozlesme: ipc.test.ts (kanal + duman), ipc-static.test.ts (import/kullanim).


const { ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { getAccountByEmail, listMessages, countFolderMessages, listUnifiedMessages, countUnifiedMessages, searchUnifiedMessages, searchMessages, getThreadMessages, getMessageMeta, getMessageBody, listAttachments } = require('../db.cjs');
const { fetchBody, fetchAttachment } = require('../mail.cjs');
const { freshCredentials } = require('../token-auth.cjs');
const { imapLock } = require('../imap-queue.cjs');
const { persistBody } = require('../ipc-helpers.cjs');



function register(_deps) {
ipcMain.handle('mail:list', (_evt, email, folderPath, limit, offset) => {
return listMessages(email, folderPath || 'INBOX', limit || 50, offset || 0);
});

ipcMain.handle('mail:count', (_evt, email, folderPath) => {
return countFolderMessages(email, folderPath || 'INBOX');
});

ipcMain.handle('mail:list-unified', (_evt, limit, offset) => {
return listUnifiedMessages(limit || 50, offset || 0);
});

ipcMain.handle('mail:count-unified', () => {
return countUnifiedMessages();
});

ipcMain.handle('mail:search-unified', (_evt, query) => {
if (!query || !query.trim()) return [];
return searchUnifiedMessages(query.trim());
});

ipcMain.handle('mail:search', (_evt, email, folderPath, query) => {
if (!query || !query.trim()) return [];
return searchMessages(email, folderPath || 'INBOX', query.trim());
});

ipcMain.handle('mail:thread', (_evt, email, folderPath, messageId) => {
return getThreadMessages(email, folderPath || 'INBOX', messageId);
});

ipcMain.handle('mail:body', async (_evt, email, folderPath, uid) => {
const folder = folderPath || 'INBOX';
const cached = getMessageBody(email, folder, uid);
if (cached && (cached.body_html || cached.body_text)) {
  return { html: cached.body_html, text: cached.body_text, messageId: cached.message_id || null, references: cached.references || [], cached: true };
}
if (String(uid).startsWith('draft-') || String(uid).startsWith('local-')) {
  return { html: cached?.body_html || null, text: cached?.body_text || null, messageId: null, references: [], cached: true };
}
const acc = getAccountByEmail(email);
if (!acc) throw new Error('Hesap bulunamadı.');
const creds = await freshCredentials(acc);
// Mesaj taşındıysa (çöp kutusu vb.) alternatif klasörlerde de dene (sağlayıcıya özel)
const candidates = [folder];
if (acc.provider === 'google') {
  candidates.push('[Gmail]/Çöp kutusu', '[Gmail]/Trash');
} else if (acc.provider === 'microsoft') {
  candidates.push('Deleted Items', 'Trash');
} else {
  candidates.push('Trash', 'Deleted Items');
}

const uniqueCandidates = [...new Set(candidates)];
for (let i = 0; i < uniqueCandidates.length; i++) {
  const tryFolder = uniqueCandidates[i];
  try {
    const body = await imapLock(email, () =>
      fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...creds })
    );
    persistBody(email, folder, uid, body);
    return { ...body, cached: false };
  } catch (e) {
    const errStr = `${e?.message || ''} ${e?.responseText || ''} ${e?.response || ''}`.toLowerCase();
    
    const isConnError = /connection|socket|econnreset|etimedout|epipe|command failed|wrong_version_number|not connected/i.test(errStr);
    if (isConnError) {
      // Bağlantı/Exchange kilidi durumunda 2.5 saniye bekleyip temiz bağlantıyla bir kez daha dene
      try {
        await new Promise((r) => setTimeout(r, 2500));
        const retryCreds = await freshCredentials(acc);
        const retryBody = await imapLock(email, () =>
          fetchBody({ provider: acc.provider, email: acc.email, folderPath: tryFolder, uid, ...retryCreds })
        );
        persistBody(email, folder, uid, retryBody);
        return { ...retryBody, cached: false };
      } catch {}
    }
    if (isConnError || i === uniqueCandidates.length - 1) {
      console.error(`[body] ${email} uid=${uid} hata:`, e?.message || e);
      throw new Error(`Gövde alınamadı (${e?.message || e})`);
    }
    // Yalnızca ileti orijinal klasörde bulunamadıysa bir sonraki adayı dene
  }
}
});

ipcMain.handle('mail:attachments', (_evt, email, folderPath, uid) => {
const folder = folderPath || 'INBOX';
return listAttachments(email, folder, uid);
});

ipcMain.handle('mail:attachment-save', async (_evt, email, folderPath, uid, index) => {
const acc = getAccountByEmail(email);
if (!acc) throw new Error('Hesap bulunamadı.');
const creds = await freshCredentials(acc);
const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
const safeName = path.basename(att.filename).replace(/[<>:"/\\|?*]/g, '_') || 'ek.bin';
const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: safeName });
if (canceled || !filePath) return { saved: false };
await fs.promises.writeFile(filePath, att.content);
return { saved: true, path: filePath };
});

ipcMain.handle('mail:attachment-preview', async (_evt, email, folderPath, uid, index) => {
const acc = getAccountByEmail(email);
if (!acc) throw new Error('Hesap bulunamadı.');
const creds = await freshCredentials(acc);
const att = await imapLock(email, () => fetchAttachment({ provider: acc.provider, email: acc.email, folderPath: folderPath || 'INBOX', uid, index, ...creds }));
return {
  filename: att.filename,
  contentType: att.contentType,
  dataBase64: Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content || '').toString('base64'),
};
});

ipcMain.handle('mail:export-eml', async (_evt, email, folderPath, uid) => {
const folder = folderPath || 'INBOX';
const meta = getMessageMeta(email, folder, uid);
let body = getMessageBody(email, folder, uid);
if (!body || (!body.body_html && !body.body_text)) {
  try {
    const acc = getAccountByEmail(email);
    if (acc) {
      const creds = await freshCredentials(acc);
      const fetched = await imapLock(email, () => fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds }));
      persistBody(email, folder, uid, fetched);
      body = fetched;
    }
  } catch {}
}
const cleanSub = (meta?.subject || 'eposta').replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
const { canceled, filePath } = await dialog.showSaveDialog({
  defaultPath: `${cleanSub}.eml`,
  filters: [{ name: 'E-posta Dosyası', extensions: ['eml'] }],
});
if (canceled || !filePath) return { saved: false };
const eml = [
  `From: ${meta?.from_addr || email}`,
  `Subject: ${meta?.subject || '(konusuz)'}`,
  `Date: ${meta?.date || new Date().toISOString()}`,
  `MIME-Version: 1.0`,
  `Content-Type: text/html; charset=utf-8`,
  ``,
  body?.body_html || body?.body_text || '(İçerik boş)',
].join('\r\n');
await fs.promises.writeFile(filePath, eml, 'utf8');
return { saved: true, path: filePath };
});

}

module.exports = { register };
