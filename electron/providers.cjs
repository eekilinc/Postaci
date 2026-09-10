// electron/providers.cjs - genel IMAP/SMTP sunucu bulma
// Sıra: 1) bilinen sağlayıcılar 2) Thunderbird autoconfig (ISPDB) 3) akıllı tahmin
const { XMLParser } = require('fast-xml-parser');

// OAuth ile bağlananlar burada da listeli (şifreyle girişte uygulama şifresi gerekir)
const KNOWN = {
  'gmail.com': { imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, note: 'Normal şifre çalışmaz, Google uygulama şifresi gerekir.' },
  'googlemail.com': { imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, note: 'Normal şifre çalışmaz, Google uygulama şifresi gerekir.' },
  'outlook.com': { imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp.office365.com', port: 587, secure: false }, note: 'OAuth önerilir; şifreyle girişte uygulama şifresi gerekir.' },
  'hotmail.com': { imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp.office365.com', port: 587, secure: false }, note: 'OAuth önerilir.' },
  'live.com': { imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp.office365.com', port: 587, secure: false }, note: 'OAuth önerilir.' },
  'yahoo.com': { imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }, note: 'Yahoo uygulama şifresi ile çalışır (Hesap güvenliği > Uygulama şifresi).' },
  'ymail.com': { imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }, note: 'Yahoo uygulama şifresi gerekir.' },
  'icloud.com': { imap: { host: 'imap.mail.me.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }, note: 'Apple uygulamaya özel parola gerekir.' },
  'me.com': { imap: { host: 'imap.mail.me.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }, note: 'Apple uygulamaya özel parola gerekir.' },
  'mac.com': { imap: { host: 'imap.mail.me.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }, note: 'Apple uygulamaya özel parola gerekir.' },
  'gmx.com': { imap: { host: 'imap.gmx.com', port: 993, secure: true }, smtp: { host: 'mail.gmx.com', port: 587, secure: false }, note: '' },
  'gmx.net': { imap: { host: 'imap.gmx.net', port: 993, secure: true }, smtp: { host: 'mail.gmx.net', port: 587, secure: false }, note: '' },
  'web.de': { imap: { host: 'imap.web.de', port: 993, secure: true }, smtp: { host: 'smtp.web.de', port: 587, secure: false }, note: '' },
  'yandex.com': { imap: { host: 'imap.yandex.com', port: 993, secure: true }, smtp: { host: 'smtp.yandex.com', port: 465, secure: true }, note: '' },
  'ya.ru': { imap: { host: 'imap.yandex.ru', port: 993, secure: true }, smtp: { host: 'smtp.yandex.ru', port: 465, secure: true }, note: '' },
};

function guess(domain) {
  return {
    imap: { host: `imap.${domain}`, port: 993, secure: true },
    smtp: { host: `smtp.${domain}`, port: 587, secure: false },
    note: 'Otomatik tahmin; çalışmazsa sağlayıcınızın belgelerine bakın.',
    source: 'tahmin',
  };
}

async function fromAutoconfig(domain) {
  // Thunderbird ISP veritabanı (herkese açık, Mozilla)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`https://autoconfig.thunderbird.net/v1.1/${domain}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml);
    const cfg = doc?.clientConfig?.emailProvider;
    if (!cfg) return null;
    const incoming = Array.isArray(cfg.incomingServer) ? cfg.incomingServer : [cfg.incomingServer];
    const outgoing = Array.isArray(cfg.outgoingServer) ? cfg.outgoingServer : [cfg.outgoingServer];
    const imap = incoming.find((s) => String(s?.['@_type']).toLowerCase() === 'imap') || incoming[0];
    const smtp = outgoing.find((s) => String(s?.['@_type']).toLowerCase() === 'smtp') || outgoing[0];
    if (!imap || !smtp) return null;
    const imapPort = Number(imap.port) || 993;
    const smtpPort = Number(smtp.port) || 587;
    return {
      imap: { host: imap.hostname, port: imapPort, secure: imapPort === 993 },
      smtp: { host: smtp.hostname, port: smtpPort, secure: smtpPort === 465 },
      note: '',
      source: 'autoconfig',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function detectSettings(email) {
  const domain = String(email).split('@')[1]?.toLowerCase().trim();
  if (!domain) throw new Error('Geçerli bir e-posta adresi girin.');
  if (KNOWN[domain]) return { ...KNOWN[domain], source: 'bilinen' };
  const auto = await fromAutoconfig(domain);
  if (auto) return auto;
  return guess(domain);
}

module.exports = { KNOWN, detectSettings };
