// electron/ipc/mail-write-ipc.cjs — yazma kanallari (send, save-draft, yanit/ileri sablonlari, autoconfig).
// mail-ipc.cjs'in alt grubu; ipc.cjs yukleyicisi tarafindan kaydettirilir.
// Sozlesme: ipc.test.ts (kanal + duman), ipc-static.test.ts (import/kullanim).


const { ipcMain } = require('electron');
const { getAccountByEmail, getMessageMeta, getMessageBody, saveSentMessage, saveDraftMessage } = require('../db.cjs');
const { fetchBody, createTransporter, buildRaw, sendRaw, appendToSent } = require('../mail.cjs');
const { freshCredentials, withAuthRetry } = require('../token-auth.cjs');
const { splitAddresses, buildReply, buildReplyAll, buildForward } = require('../compose.cjs');
const { detectSettings } = require('../providers.cjs');
const { persistBody, friendlySyncError } = require('../ipc-helpers.cjs');


// Yanıt/ileri şablonu — mail:reply-template / reply-all-template / forward-template
// handler'larının ortak gövdesi. ipc-helpers'a değil buraya aittir: yalnız
// bu modülün handler'ları kullanır ve bağımlılıkları (compose.cjs) zaten burada.
async function composeTemplate(email, folderPath, uid, mode) {
  const folder = folderPath || 'INBOX';
  const meta = getMessageMeta(email, folder, uid);
  if (!meta) throw new Error('Mesaj bulunamadı.');
  let b = getMessageBody(email, folder, uid);
  if (!(b && (b.body_html || b.body_text))) {
    const acc = getAccountByEmail(email);
    if (!acc) throw new Error('Hesap bulunamadı.');
    const creds = await freshCredentials(acc);
    const fetched = await fetchBody({ provider: acc.provider, email: acc.email, folderPath: folder, uid, ...creds });
    persistBody(email, folder, uid, fetched);
    b = { body_html: fetched.html, body_text: fetched.text, message_id: fetched.messageId, references: fetched.references };
  }
  const original = {
    from: meta.from_addr,
    to: meta.to_addr,
    cc: meta.cc_addr,
    subject: meta.subject,
    date: meta.date,
    html: b.body_html,
    text: b.body_text,
    messageId: b.message_id,
    references: b.references || [],
  };
  if (mode === 'reply') return buildReply(original);
  if (mode === 'replyAll') return buildReplyAll(original, email);
  return buildForward(original);
}


function register(_deps) {
ipcMain.handle('mail:save-draft', async (_evt, { email, to, subject, text, html }) => {
if (!email) return false;
try {
  return saveDraftMessage(email, { to, subject, text, html });
} catch (e) {
  console.error('[mail:save-draft] error:', e);
  return false;
}
});

ipcMain.handle('mail:send', async (_evt, { fromEmail, to, cc, bcc, subject, text, html, inReplyTo, references, attachments }) => {
const acc = getAccountByEmail(fromEmail);
if (!acc) throw new Error('Gönderen hesap bulunamadı.');
const toList = splitAddresses(to);
if (toList.length === 0) throw new Error('Geçerli bir alıcı girin.');
if (!text || !text.trim()) throw new Error('İleti boş olamaz.');
const atts = attachments || [];
const totalBytes = atts.reduce((n, a) => n + Math.ceil((a.dataBase64 || '').length * 3 / 4), 0);
if (totalBytes > 20 * 1024 * 1024) throw new Error('Ekler toplam 20MB sınırını aşıyor.');
const ccList = splitAddresses(cc);
const bccList = splitAddresses(bcc);
const raw = await buildRaw({ from: acc.email, to: toList, cc: ccList, subject: subject || '(konusuz)', text, html, inReplyTo, references, attachments: atts });
const smtpOpts = acc.auth_type === 'password'
  ? { smtpHost: acc.smtp_host, smtpPort: acc.smtp_port, smtpSecure: !!acc.smtp_secure }
  : {};
let info;
try {
  // Ölü token durumunda otomatik yenileyip bir kez daha dene
  info = await withAuthRetry(acc, async (creds) => {
    const transporter = createTransporter({ provider: acc.provider, email: acc.email, ...creds, ...smtpOpts });
    return sendRaw(transporter, raw, { from: acc.email, to: [...toList, ...ccList, ...bccList] });
  });
} catch (e) {
  console.error(`[send] ${fromEmail} hata:`, e?.message || e);
  throw new Error(`Gönderilemedi (${friendlySyncError(acc.provider, e)})`);
}
saveSentMessage(acc.email, { to: toList.join(', '), subject, text, html });
// Sunucudaki Gönderilmiş klasörüne kopya (best-effort)
try {
  const creds = await freshCredentials(getAccountByEmail(fromEmail) || acc);
  await appendToSent({ provider: acc.provider, email: acc.email, raw, ...creds });
} catch { /* yerel kayıt esas */ }
return { messageId: info?.messageId || null };
});

ipcMain.handle('mail:autoconfig', (_evt, email) => detectSettings(email));

ipcMain.handle('mail:reply-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'reply'));

ipcMain.handle('mail:reply-all-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'replyAll'));

ipcMain.handle('mail:forward-template', (_evt, email, folderPath, uid) => composeTemplate(email, folderPath, uid, 'forward'));

}

module.exports = { register };
