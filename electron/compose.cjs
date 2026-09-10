// electron/compose.cjs - oluştur/yanıt/ilet ortak mantığı (tek modül)
// UI yalnızca bu fonksiyonların çıktısını forma doldurur; kural tek yerdedir.

function splitAddresses(s) {
  return String(s || '')
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter((x) => x.includes('@'));
}

function prefixSubject(subject, prefix) {
  const s = String(subject || '').trim() || '(konusuz)';
  // "Re: Re:" yığılmasını engelle
  if (new RegExp(`^${prefix}:\\s*`, 'i').test(s)) return s;
  return `${prefix}: ${s}`;
}

function quoteText({ text, from, date }) {
  const when = date ? new Date(date).toLocaleString('tr-TR') : '';
  const header = `${from || ''} ${when ? `<${when}> yazmış:` : 'yazmış:'}`;
  const quoted = String(text || '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `\n\n--- ${header} ---\n${quoted}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function quoteHtml({ html, text, from, date }) {
  const when = date ? new Date(date).toLocaleString('tr-TR') : '';
  const header = `${escapeHtml(from || '')} ${when ? `&lt;${when}&gt;` : ''} yazmış:`;
  const inner = html || `<pre>${escapeHtml(text || '')}</pre>`;
  return `<br><br><div>--- ${header} ---</div><blockquote style="margin:0 0 0 8px;padding-left:8px;border-left:2px solid #ccc">${inner}</blockquote>`;
}

// Yanıt formu: alıcı=orijinal gönderen, konu Re:, gövde alıntılı
function buildReply(original) {
  return {
    to: original.from || '',
    cc: '',
    subject: prefixSubject(original.subject, 'Re'),
    text: quoteText(original),
    html: quoteHtml(original),
    inReplyTo: original.messageId || undefined,
    references: [...(original.references || []), original.messageId].filter(Boolean).join(' ') || undefined,
  };
}

// İlet formu: alıcı boş, konu Fwd:, gövde alıntılı (threading yok)
function buildForward(original) {
  return {
    to: '',
    cc: '',
    subject: prefixSubject(original.subject, 'Fwd'),
    text: quoteText(original),
    html: quoteHtml(original),
    inReplyTo: undefined,
    references: undefined,
  };
}

module.exports = { splitAddresses, prefixSubject, quoteText, quoteHtml, buildReply, buildForward };
