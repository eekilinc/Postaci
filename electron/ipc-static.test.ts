// electron/ipc-static.test.ts — IPC modüllerinin import/kullanım tutarlılığı.
//
// NEDEN STATİK BİR TEST: handler gövdelerindeki `try { ... } catch {}` blokları
// eksik bir import'un ReferenceError'unu SESSİZCE yutabilir (ipc.test.ts'teki
// duman testi _folderListFetchedAt / FOLDER_LIST_REFRESH_MS eksikliğini bu
// yüzden yakalayamıyordu). Bu test kaynaktan okur: bir modülde KULLANILAN her
// yardımcı, o modülün require listesinde olmalı — çalışma zamanına gerek yok,
// deterministiktir.
//
// KAPSAM: electron/ipc.cjs ve (bölme tamamlanınca) electron/ipc/ altındaki
// tüm .cjs modülleri. Yardımcı listesi ipc-helpers.cjs'in module.exports
// bloğundan okunur — yeni yardımcı eklendiğinde bu testin listesi otomatik
// güncellenir.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

// ipc-helpers.cjs'in module.exports bloğundan yardımcı adlarını çıkar
const helpersSrc = readFileSync(require.resolve('./ipc-helpers.cjs'), 'utf8');
const exportsMatch = helpersSrc.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
const HELPER_NAMES = (exportsMatch?.[1] || '')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

/** Kaynaktan yorum satırlarını ve ipc-helpers require bloğunu soyup kalan metni döndürür */
function bodyWithoutRequireAndComments(src: string, moduleName: string): string {
  let body = src;
  // ipc-helpers require destructure'ını tamamen çıkar
  const reqRe = /const\s*\{[^}]*\}\s*=\s*require\('\.{1,2}\/ipc-helpers\.cjs'\);?/g;
  body = body.replace(reqRe, '');
  // satır yorumlarını düşür (blok yorumlar nadiren isim çağırır; yeterli)
  body = body
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  void moduleName;
  return body;
}

/** Modülün require listesinde geçen yardımcı adları */
function importedHelpers(src: string): Set<string> {
  const m = src.match(/const\s*\{([^}]*)\}\s*=\s*require\('\.{1,2}\/ipc-helpers\.cjs'\);?/);
  return new Set(
    (m?.[1] || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

describe('IPC modülleri — yardımcı import/kullanım tutarlılığı', () => {
  it('ipc-helpers.cjs yardımcı listesi okunabilmeli (bekçi)', () => {
    expect(HELPER_NAMES.length).toBeGreaterThan(10);
    expect(HELPER_NAMES).toContain('withIpcTimeout');
    expect(HELPER_NAMES).toContain('emptySpecialFolder');
  });

  const modulePaths = [join(HERE, 'ipc.cjs')];
  const ipcDir = join(HERE, 'ipc');
  if (existsSync(ipcDir)) {
    for (const f of readdirSync(ipcDir)) {
      if (f.endsWith('.cjs')) modulePaths.push(join(ipcDir, f));
    }
  }

  it.each(modulePaths.map((p) => [p]))('%s: kullanılan her yardımcı import edilmiş olmalı', (mod) => {
    const src = readFileSync(mod as string, 'utf8');
    const imported = importedHelpers(src);
    const body = bodyWithoutRequireAndComments(src, mod as string);
    const missing: string[] = [];
    for (const name of HELPER_NAMES) {
      // require listesinde olmayan ama gövdede geçen isim -> bölme hatası
      const uses = new RegExp(`\\b${name}\\b`).test(body);
      if (uses && !imported.has(name)) missing.push(name);
      // import edilmiş ama hiç kullanılmayan -> ölü import (idame maliyeti)
      if (!uses && imported.has(name)) missing.push(`${name} (import edilmiş ama kullanılmıyor)`);
    }
    expect(missing, `${mod}: ${missing.join(', ')}`).toEqual([]);
  });
});