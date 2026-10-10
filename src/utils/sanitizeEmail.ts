// src/utils/sanitizeEmail.ts — e-posta gövdesinin görüntülenme zinciri.
//
// Tek yerden yönetilir: useMessageBody burayı çağırır. Aynı zinciri ileride
// başka görüntüleme noktaları (imza önizlemesi vb.) de kullanabilir.
//
// Gizlilik sözleşmesi: `allowRemoteImages` KAPALIYKEN ileti, GÖNDERENİN
// uzak sunucularına HİÇBİR görüntü isteği çıkarmamalı. Bu yalnız <img src=…>
// için değil; CSS url(...) arka planları, poster/srcset öznitelikleri ve
// <input type=image> aynı isteği yapabilir (CSP img-src https: izin veriyor).
// Zincirin tamamı bu yüzden dört vektörü de kapatır.
import DOMPurify from 'dompurify';

export interface SanitizeEmailOptions {
  /** true: harici http(s) görseller yerinde bırakılır (kullanıcı izin verdi) */
  allowRemoteImages?: boolean;
}

const hiddenImgPlaceholder = (src: string) =>
  `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/50 text-[10px] text-zinc-400 select-none my-0.5" title="Harici görsel engellendi (${src})">[Görsel gizlendi]</span>`;

/** Uzak mı? http(s) ve protokole göreli (//) adresler uzak kabul edilir. */
function isRemoteUrl(u: string): boolean {
  return /^\s*(?:https?:)?\/\//i.test(u);
}

/**
 * style="…" özniteliği İÇİNDEKİ uzak url(...) ifadelerini `none` yapar.
 * Yalnızca öznitelik kapsamında çalışır: ileti gövdesinde geçen "url(https://…)"
 * örnek metinleri dokunulmaz kalır.
 */
function stripRemoteCssUrls(html: string): string {
  const strip = (css: string) =>
    // url(...), url('…'), url("…") — öznitelikte tırnaklar "/' olabilir
    css.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (token, _q: string, inner: string) => {
      const cleaned = inner.replace(/&(?:quot|apos|#39|#34);/gi, '');
      return isRemoteUrl(cleaned) ? 'none' : token;
    });

  return html
    .replace(/style\s*=\s*"([^"]*)"/gi, (_m, css: string) => `style="${strip(css)}"`)
    .replace(/style\s*=\s*'([^']*)'/gi, (_m, css: string) => `style='${strip(css)}'`);
}

/** poster/srcset öznitelikleri uzak adrese işaret ediyorsa özniteliği kaldırır. */
function stripRemoteMediaAttrs(html: string): string {
  return html
    .replace(/\s(?:poster|srcset)\s*=\s*"(?:https?:)?\/\/[^"]*"/gi, '')
    .replace(/\s(?:poster|srcset)\s*=\s*'(?:https?:)?\/\/[^']*'/gi, '');
}

/** <input type=image src=…> gibi nadir görüntü vektörünün uzak src değerini düşürür. */
function stripRemoteInputSrc(html: string): string {
  return html.replace(
    /<input\b([^>]*?)\ssrc=["'](?:https?:)?\/\/[^"']+["']([^>]*)>/gi,
    '<input$1$2>',
  );
}

export function sanitizeEmailHtml(
  html: string,
  { allowRemoteImages = false }: SanitizeEmailOptions = {},
): string {
  if (!html) return '';
  let sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });

  // Yatay taşmayı ve ekran dışına uzanan imza/duyuruları engelle:
  // 'white-space: nowrap' veya nowrap="..." özniteliklerini temizle
  sanitized = sanitized
    .replace(/white-space\s*:\s*nowrap/gi, 'white-space: normal')
    .replace(/<nobr\b[^>]*>/gi, '<span>')
    .replace(/<\/nobr>/gi, '</span>')
    .replace(/\s+nowrap(?=[\s=>])/gi, '');

  if (allowRemoteImages) return sanitized;

  // 1) Klasik vektör: <img src="https://…">
  sanitized = sanitized.replace(
    /<img([^>]*)\ssrc=["']((?:https?:)?\/\/[^"']+)["']([^>]*)>/gi,
    (_match, _before, src) => hiddenImgPlaceholder(src),
  );
  // 2) İzleme pikseli sızıntısı: CSS url(https://…) — kalkan açıkken dahi
  //    arka plan görselleri CSP (img-src https:) üzerinden yükleniyordu.
  sanitized = stripRemoteCssUrls(sanitized);
  // 3) video poster / img srcset
  sanitized = stripRemoteMediaAttrs(sanitized);
  // 4) <input type=image src=…>
  sanitized = stripRemoteInputSrc(sanitized);
  return sanitized;
}