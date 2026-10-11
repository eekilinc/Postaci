// @vitest-environment jsdom
// src/utils/sanitizeEmail.test.tsx — e-posta gövdesi görüntüleme zinciri.
//
// GİZLİLİK SÖZLEŞMESİ: allowRemoteImages KAPALIYKEN ileti, gönderenin uzak
// sunucularına HİÇBİR görüntü isteği çıkarmamalı. Kalkanın dört vektörü var:
//   1. <img src="https://…">                     (klasik izleme pikseli)
//   2. style="background:url(https://…)"          (CSS sızıntısı — kalkan
//      açıkken dahi CSP img-src https: üzerinden yükleniyordu)
//   3. poster= / srcset= öznitelikleri
//   4. <input type=image src=…>
// Bu test, zincirin bu dördünü kapattığını VE aynı anda meşru içerikleri
// (data: gömülü imza görselleri, göreli URL'ler, örnek metinler) bozmadığını
// sabitler. Düzeltmeden önce 2-4 numaralı vektörler KIRMIZI idi.
import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml, sanitizeSignatureHtml, escapeHtml } from './sanitizeEmail';

const blocked = (html: string) => sanitizeEmailHtml(html, { allowRemoteImages: false });
const allowed = (html: string) => sanitizeEmailHtml(html, { allowRemoteImages: true });

describe('temel sanitizasyon (XSS koruması)', () => {
  it('script etiketini düşürür', () => {
    expect(blocked('<p>selam</p><script>alert(1)</script>')).not.toContain('<script');
  });

  it('onclick gibi olay özniteliklerini düşürür', () => {
    expect(blocked('<p onclick="alert(1)">x</p>')).not.toContain('onclick');
  });

  it('boş girdide boş döner', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });
});

describe('vektör 1 — <img src> uzak görseller', () => {
  it('kalkan kapalıyken uzak img yer tutucuya dönüşür', () => {
    const out = blocked('<img src="https://tracker.example/p.png" alt="x">');
    expect(out).toContain('[Görsel gizlendi]');
    expect(out).not.toContain('tracker.example/p.png"');
  });

  it('protokole göreli // adresler de uzak sayılır', () => {
    const out = blocked('<img src="//tracker.example/p.png">');
    expect(out).toContain('[Görsel gizlendi]');
  });

  it('kalkan açıkken uzak img yerinde kalır', () => {
    const out = allowed('<img src="https://cdn.example/p.png">');
    expect(out).toContain('cdn.example/p.png');
  });

  it('data: gömülü görseller kalkan kapalıyken de kalır (imza logoları)', () => {
    const out = blocked('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(out).toContain('data:image/png');
  });
});

describe('vektör 2 — CSS url() sızıntısı', () => {
  it('kalkan kapalıyken uzak arka plan url() none olur', () => {
    const out = blocked('<div style="background:url(https://tracker.example/px.png)">A</div>');
    expect(out).not.toContain('tracker.example');
    expect(out).toContain('background:none');
  });

  it('protokole göreli // url() de temizlenir', () => {
    const out = blocked('<div style="background:url(//tracker.example/px.png)">A</div>');
    expect(out).not.toContain('tracker.example');
  });

  it('tek ve çift tırnaklı url() biçimleri temizlenir', () => {
    expect(blocked(`<div style="background:url('https://t.example/a.png')">A</div>`)).not.toContain('t.example');
    expect(blocked('<div style=\'background:url("https://t.example/b.png")\'>A</div>')).not.toContain('t.example');
  });

  it('kalkan açıkken uzak url() yerinde kalır', () => {
    const out = allowed('<div style="background:url(https://cdn.example/bg.png)">A</div>');
    expect(out).toContain('cdn.example/bg.png');
  });

  it('data: ve göreli url() kalkan kapalıyken de kalır', () => {
    expect(blocked('<div style="background:url(data:image/png;base64,xx)">A</div>')).toContain('data:image/png');
    expect(blocked('<div style="background:url(/inline/logo.png)">A</div>')).toContain('/inline/logo.png');
  });

  it('gövde ÖRNEK METNİ olan url(https://…) dokunulmaz', () => {
    const out = blocked('<p>Şu kodu kullan: url(https://ornek.com/a.png) — böyle.</p>');
    expect(out).toContain('url(https://ornek.com/a.png)');
  });
});

describe('vektör 3 — poster / srcset', () => {
  it('uzak poster özniteliği kaldırılır', () => {
    expect(blocked('<video poster="https://tracker.example/v.png"><source src="x"></video>')).not.toContain('poster');
  });

  it('uzak srcset özniteliği kaldırılır', () => {
    expect(blocked('<img src="data:image/png;base64,AA" srcset="https://t.example/2x.png 2x">')).not.toContain('srcset');
  });
});

describe('vektör 4 — <input type=image>', () => {
  it('uzak src değeri düşürülür, etiket zarar görmez', () => {
    const out = blocked('<input type="image" src="https://tracker.example/b.png" alt="b">');
    expect(out).toContain('<input');
    expect(out).not.toContain('tracker.example');
  });
});

describe('taşma temizliği (regresyon)', () => {
  it('white-space:nowrap normal olur', () => {
    expect(blocked('<div style="white-space: nowrap">x</div>')).toContain('white-space: normal');
  });

  it('<nobr> span olur', () => {
    expect(blocked('<nobr>uzun</nobr>')).toContain('<span>uzun</span>');
  });
});

describe('sanitizeSignatureHtml — imza önizlemesi', () => {
  it('script ve olay enjeksiyonunu düşürür', () => {
    const out = sanitizeSignatureHtml('<p>imza</p><script>alert(1)</script><p onclick="x()">a</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
    expect(out).toContain('imza');
  });

  it('uzak logo görseli meşru olduğu için yerinde kalır', () => {
    expect(sanitizeSignatureHtml('<img src="https://sirket.example/logo.png">')).toContain('logo.png');
  });
});

describe('escapeHtml — şablon interpolasyonu', () => {
  it('HTML isaretlemesini metne cevirir', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('cift tirnak & olarak kacar', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it('tırnak ve amp; güvenli', () => {
    expect(escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });

  it('null/undefined boş dizgiye düşer', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });
});