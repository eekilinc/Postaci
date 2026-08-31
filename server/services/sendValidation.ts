import type { SendMailParams } from './smtpService.js';

export function validateSendPayload(input: unknown): asserts input is SendMailParams {
  const p = input as SendMailParams;
  if (!p || typeof p.accountId !== 'string' || !p.accountId) throw new Error('Gönderici hesabı gerekli.');
  if (!Array.isArray(p.to) || !p.to.length) throw new Error('En az bir alıcı gerekli.');
  const addresses = [p.to, p.cc || [], p.bcc || []];
  if (addresses.some(a => !Array.isArray(a)) || addresses.flat().length > 200) throw new Error('Geçersiz veya çok fazla alıcı.');
  for (const address of addresses.flat()) {
    if (!address || typeof address.email !== 'string' || address.email.length > 254 ||
      !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(address.email) ||
      (address.name !== undefined && (typeof address.name !== 'string' || /[\r\n]/.test(address.name)))) throw new Error('Geçersiz alıcı adresi.');
  }
  if (typeof p.subject !== 'string' || /[\r\n]/.test(p.subject) || p.subject.length > 1000) throw new Error('Geçersiz konu.');
  if (typeof p.bodyText !== 'string' || typeof p.bodyHtml !== 'string') throw new Error('İleti içeriği gerekli.');
  for (const value of [p.inReplyTo, p.references]) if (value !== undefined && (typeof value !== 'string' || /[\r\n]/.test(value))) throw new Error('Geçersiz ileti başlığı.');
  if (p.attachments !== undefined && (!Array.isArray(p.attachments) || p.attachments.length > 50)) throw new Error('Geçersiz ek listesi.');
  let size = 0;
  for (const a of p.attachments || []) {
    if (!a || typeof a.filename !== 'string' || /[\r\n]/.test(a.filename) || typeof a.contentBase64 !== 'string') throw new Error('Ek içeriği yüklenmemiş.');
    size += Buffer.byteLength(a.contentBase64, 'base64');
  }
  if (size > 25 * 1024 * 1024) throw new Error('Toplam ek boyutu 25 MB sınırını aşıyor.');
}
