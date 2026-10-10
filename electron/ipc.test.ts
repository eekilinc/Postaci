// electron/ipc.test.ts — IPC kanal kayıt yüzeyi
//
// registerIpc() tek seferde 66 kanal kaydeder (65 handle + 1 on). Bu dosya,
// dosyaları bölme/ayrıştırma sırasında bir kanalın kaybolmasını, yeniden
// adlandırılmasını veya preload köprüsünde tanımlı olmayan bir kanalın
// eklenmesini yakalar.
//
// Kanal ADLARI sözleşmedir: preload.cjs bu isimlerle invoke ediyor. Bir kanal
// kaybolursa preload tarafında runtime'da undefined olur ve kullanıcı o özelliği
// sessizce kullanamaz — derleme hatası vermez.
//
// NOT: electron/ipc.cjs CommonJS `require` kullanıyor. Vitest'in `vi.mock`
// mekanizması ESM import zincirine uygulandığı ve bu dosya CJS olduğu için
// `require.cache` üzerinden stub enjekte ediyoruz — CJS'in gerçekten göreceği yol.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

// ── Electron stub ────────────────────────────────────────────────────────────
const handlers = new Map<string, (...args: unknown[]) => unknown>();
const openExternal = vi.fn();

const electronStub = {
  app: {
    getPath: () => '/tmp',
    getVersion: () => '1.0.57',
    getName: () => 'Postaci',
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: () => Promise.resolve(),
  },
  ipcMain: {
    handle: (ch: string, fn: unknown) => handlers.set(ch, fn as (...a: unknown[]) => unknown),
    on: (ch: string, fn: unknown) => handlers.set(ch, fn as (...a: unknown[]) => unknown),
    removeHandler: (ch: string) => handlers.delete(ch),
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
  shell: { openExternal },
};

function injectStub(absPath: string, exports: unknown) {
  require.cache[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports,
    children: [],
    paths: [],
  } as unknown as NodeModule;
}

injectStub(require.resolve('electron'), electronStub);

// Ağ/DB katmanları: bu test yalnızca KAYIT yüzeyini doğrular, handler
// gövdeleri çalıştırılmaz. Tüm dışa aktarımlar no-op olur.
for (const rel of [
  './db.cjs',
  './mail.cjs',
  './auth.cjs',
  './providers.cjs',
  './compose.cjs',
  './token-auth.cjs',
  './imap-queue.cjs',
  './db-drizzle.cjs',
  './notifications.cjs',
  './background-sync.cjs',
  './shell-integration.cjs',
]) {
  injectStub(require.resolve(rel), new Proxy({}, { get: () => vi.fn() }));
}

const { registerIpc } = require('./ipc.cjs') as {
  registerIpc: (ctx: Record<string, unknown>) => void;
};

const ctx = {
  getMainWindow: () => null,
  getTray: () => null,
  getWindow: () => null,
  createWindow: vi.fn(),
  quitApp: vi.fn(),
  onOpenAddAccount: vi.fn(),
};

beforeEach(() => {
  handlers.clear();
  openExternal.mockClear();
  registerIpc(ctx);
});

describe('registerIpc — kayıt yüzeyi', () => {
  it('65 ipcMain.handle + 1 ipcMain.on kanal kaydeder (66 kayıt)', () => {
    // 65 handle + app:get-version-sync (preload sendSync kullandığı için on)
    expect(handlers.size).toBe(66);
  });

  it('her kanal bir fonksiyon kaydeder', () => {
    for (const [ch, fn] of handlers) {
      expect(typeof fn, `${ch} fonksiyon değil`).toBe('function');
    }
  });

  it('kanal adları alan:eylem biçiminde', () => {
    for (const ch of handlers.keys()) {
      expect(ch, `${ch} 'alan:eylem' biçiminde değil`).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });

  it('en sık kullanılan kanallar yerinde', () => {
    for (const ch of ['mail:list', 'mail:send', 'mail:sync', 'accounts:list', 'db:stats']) {
      expect(handlers.has(ch), `${ch} kayıtlı değil`).toBe(true);
    }
  });
});

describe('preload köprüsü ile sözleşme', () => {
  // preload'da iki yönlü kanal vardır:
  //  - renderer -> main: invoke / sendSync -> main'de handle/on KAYITLI olmalı
  //  - main -> renderer: on               -> main'de webContents.send ile GONDERILIR,
  //                                          handler beklenmez (yanit bekleyen kanal degil)
  it('preload cevap bekleyen her kanal main tarafında kayitli', () => {
    const src = readFileSync(require.resolve('../preload.cjs'), 'utf8');
    const invoked = new Set(
      [...src.matchAll(/ipcRenderer\.(?:invoke|sendSync)\(\s*'([^']+)'/g)].map((m) => m[1])
    );
    expect(invoked.size, 'preload invoke kanal sayisi beklenenden az').toBeGreaterThan(50);
    // Kanallar tek dosyada değil: ipc.cjs + updater kendi modülünde.
    const MAIN_FILES = ['./ipc.cjs', './updater.cjs'];
    const all = MAIN_FILES.map((f) => readFileSync(require.resolve(f), 'utf8')).join('\n');
    const missing = [...invoked].filter((ch) => !all.includes(`'${ch}'`)).sort();
    // Eksik kanal = preload bir sey cagirIYOR ama main'de handler yok
    expect(missing, `main'de kayitli olmayan kanallar: ${missing.join(', ')}`).toEqual([]);
  });

  it('main -> renderer kanallari gercekten gonderiliyor', () => {
    const preloadSrc = readFileSync(require.resolve('../preload.cjs'), 'utf8');
    const listened = new Set(
      [...preloadSrc.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)].map((m) => m[1])
    );
    expect(listened.size, 'push kanali bulunamadi').toBeGreaterThan(0);

    const all = ['./ipc.cjs', './notifications.cjs', './updater.cjs', './background-sync.cjs']
      .map((f) => readFileSync(require.resolve(f), 'utf8'))
      .join('\n');
    const orphan = [...listened].filter((ch) => !all.includes(`'${ch}'`)).sort();
    expect(orphan, `hicbir yerde gonderilmeyen push kanallari: ${orphan.join(', ')}`).toEqual([]);
  });
});

describe('shell:open-external şema doğrulaması', () => {
  // IPC handler imzası (event, url) — event parametresi zorunlu, yoksa handler
  // gelen değeri "event" sanıp url'i undefined görür ve her şeyi reddeder.
  const fn = () => handlers.get('shell:open-external') as (e: unknown, u: unknown) => unknown;
  const call = (url: unknown) => fn()({}, url);

  it('yalnızca http/https/mailto/ms-settings kabul eder', () => {
    expect(call('https://example.com')).toBe(true);
    expect(call('http://example.com')).toBe(true);
    expect(call('mailto:a@b.com')).toBe(true);
    expect(call('ms-settings:notifications')).toBe(true);
  });

  it('tehlikeli şemaları reddeder', () => {
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '',
      null,
      undefined,
      123,
    ]) {
      expect(call(bad), `${String(bad)} reddedilmeliydi`).toBe(false);
    }
  });

  it('reddedilen şemalarda shell.openExternal çağrılmaz', () => {
    call('file:///etc/passwd');
    call('javascript:alert(1)');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('kabul edilen şemada shell.openExternal çağrılır', () => {
    call('https://example.com');
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });
});