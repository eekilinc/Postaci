import DOMPurify from 'dompurify';
import type { Attachment } from '../types';
export interface PrivacyOptions { blockExternalImages: boolean; blockTrackingPixels: boolean }
const safeImage = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,)/i;
export function sanitizeEmailHtml(html: string, attachments: Attachment[], privacy: PrivacyOptions): string {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['b','i','em','strong','a','p','br','ul','ol','li','div','span','h1','h2','h3','h4','h5','h6','blockquote','code','pre','table','tr','td','th','tbody','thead','tfoot','img','hr','center','font'],
    ALLOWED_ATTR: ['href','src','alt','title','style','width','height','align','valign','bgcolor','color','cellpadding','cellspacing','border','colspan','rowspan'],
  });
  const hiddenImages = new WeakSet(Array.from(fragment.querySelectorAll('img')).filter(img => /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i.test(img.getAttribute('style') || '')));
  for (const element of fragment.querySelectorAll<HTMLElement>('[style]')) {
    // Keep layout/color declarations, never URL-bearing CSS, positioning or application selectors.
    const safeProperties = /^(color|background-color|font(-size|-family|-weight|-style)?|text-align|text-decoration|line-height|white-space|margin(-top|-bottom|-left|-right)?|padding(-top|-bottom|-left|-right)?|border(-color|-width|-style|-collapse)?|width|max-width|height|display)$/;
    const style = element.style;
    for (const property of Array.from(style)) {
      const value = style.getPropertyValue(property);
      if (!safeProperties.test(property) || /url|image-set|expression|var\(|\\|@/i.test(value)) style.removeProperty(property);
    }
  }
  for (const img of fragment.querySelectorAll('img')) {
    let src = img.getAttribute('src') || '';
    if (/^cid:/i.test(src)) {
      const cid = src.slice(4).replace(/[<>]/g, '');
      const att = attachments.find(a => a.contentId?.replace(/[<>]/g, '') === cid || a.filename === cid);
      src = att?.contentBase64 ? 'data:' + att.contentType + ';base64,' + att.contentBase64 : '';
    }
    if (src.startsWith('//')) src = 'https:' + src;
    const remote = /^https?:\/\//i.test(src);
    const pixel = remote && (hiddenImages.has(img) ||
      ['width','height'].some(attr => { const value = img.getAttribute(attr) || img.style.getPropertyValue(attr); return value !== '' && /^\d+(?:px)?$/.test(value) && parseInt(value, 10) <= 2; }) ||
      /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i.test(img.getAttribute('style') || '') ||
      /(?:track|beacon|pixel|open\.gif|open\.png)/i.test(src)
    );
    if (!safeImage.test(src) || (remote && privacy.blockExternalImages) || (privacy.blockTrackingPixels && pixel)) {
      img.replaceWith(document.createTextNode(img.alt ? '[Görsel: ' + img.alt + ']' : '[Görsel engellendi]'));
    } else { img.src = src; img.setAttribute('referrerpolicy', 'no-referrer'); }
  }
  for (const a of fragment.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    if (!/^(https?:\/\/|mailto:)/i.test(href)) a.removeAttribute('href');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
export function emailDocument(body: string, dark: boolean, allowRemoteImages: boolean): string {
  const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:" + (allowRemoteImages ? ' https: http:' : '') + "; form-action 'none'; base-uri 'none'";
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="referrer" content="no-referrer"><style>body{margin:12px;font:14px/1.6 system-ui;overflow-wrap:anywhere;color:' + (dark ? '#e2e8f0' : '#172033') + ';background:' + (dark ? '#161d2d' : '#fff') + '}img{max-width:100%;height:auto}table{max-width:100%}a{color:#60a5fa}pre{white-space:pre-wrap}</style></head><body>' + body + '</body></html>';
}
