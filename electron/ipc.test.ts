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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const IPC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'ipc');

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

// ── "Makul dünya" stub'ları ─────────────────────────────────────────────────
// Handler'lar yalnızca doğru TİPTE veri döndüğünde derin kod yollarına girer.
// Eğer stub her şey için undefined döndürürse, handler doğrulama bariyerinde
// ("Hesap bulunamadı") durur ve gövdesindeki eksik import YAKALANMAZ — duman
// testi false confidence verirdi. Bu yüzden hesap, kimlik, DB ve IMAP istemcisi
// gerçekçi nesneler döndürür; handler gövdesi sonuna kadar yürür.
const fakeDb = {
  prepare: () => ({
    get: () => ({}),
    all: () => [],
    run: () => ({ changes: 0 }),
  }),
  exec: () => undefined,
  pragma: () => undefined,
};
const fakeAccount = {
  id: 1,
  provider: 'imap',
  email: 'a@x.com',
  display_name: 'Test',
  auth_type: 'password',
  password_enc: 'eA==',
  imap_host: 'h',
  imap_port: 993,
  smtp_host: 's',
  smtp_port: 465,
};
const fakeCreds = {
  accessToken: 'tok',
  password: 'pass',
  imapHost: 'h',
  imapPort: 993,
  smtpHost: 's',
  smtpPort: 465,
  smtpSecure: true,
};
const fakeClient = new Proxy(
  {
    mailboxOpen: async () => ({ exists: 0 }),
    mailboxClose: async () => undefined,
    search: async () => [],
    status: async () => ({ messages: 0, unseen: 0 }),
    listTree: async () => ({ folders: [] }),
    list: async () => [],
    messageDelete: async () => undefined,
    messageFlagsAdd: async () => true,
    run: async () => undefined,
  },
  { get: (t, k) => (k in t ? t[k] : async () => undefined) },
);
const stubFor = (name: string): Record<string, unknown> => {
  switch (name) {
    case './db.cjs':
      return {
        getDb: () => fakeDb,
        getStats: () => ({ accounts: 1, folders: 1, messages: 1 }),
        getDbPath: () => 'C:/x.db',
        vacuumDb: () => true,
        listAccounts: () => [fakeAccount],
        getAccountById: () => fakeAccount,
        getAccountByEmail: () => fakeAccount,
        updateAccount: () => true,
        deleteAccount: () => true,
        updateTokens: () => true,
        addAccount: () => 1,
        listMessages: () => [],
        countFolderMessages: () => ({ total: 0, unread: 0 }),
        listUnifiedMessages: () => [],
        countUnifiedMessages: () => ({ total: 0, unread: 0 }),
        searchUnifiedMessages: () => [],
        searchMessages: () => [],
        getThreadMessages: () => [],
        getMessageMeta: () => ({}),
        getMessageBody: () => null, // onbellek bos: handler fetch+persistBody yoluna insin
        saveMessageBody: () => undefined,
        listAttachments: () => [],
        saveAttachments: () => undefined,
        markReadDb: () => true,
        markUnreadDb: () => true,
        toggleStarDb: () => 1,
        batchMarkReadDb: () => true,
        batchToggleStarDb: () => true,
        searchContacts: () => [],
        listContacts: () => [],
        upsertContact: () => ({}),
        deleteContact: () => true,
        saveSentMessage: () => 'local-1',
        saveDraftMessage: () => 'draft-1',
        getSetting: () => ({}),
        setSetting: () => undefined,
        getAllUnreadCounts: () => ({ byAccount: {}, byFolder: {}, unified: 0 }),
      };
    case './mail.cjs':
      return {
        emailFromIdToken: () => ({ email: 'a@x.com' }),
        fetchProfileEmail: async () => 'a@x.com',
        syncInbox: async () => ({ total: 0, synced: 0, newMessages: [] }),
        syncFolder: async () => ({ total: 0, synced: 0, newMessages: [] }),
        fetchBody: async () => ({ html: '<p>x</p>', text: 'x', attachments: [] }),
        fetchAttachment: async () => ({ filename: 'a.txt', contentType: 'text/plain', dataBase64: 'QQ==' }),
        markSeen: async () => true,
        markUnseen: async () => true,
        createTransporter: () => ({ sendMail: async () => ({ messageId: 'ok' }), verify: async () => true }),
        buildRaw: () => 'raw',
        sendRaw: async () => true,
        appendToSent: async () => true,
        verifyImap: async () => ({ ok: true }),
        listFolders: async () => [],
        moveToTrash: async () => ({ success: true, dest: 'Trash', destUid: '9' }),
        batchMoveToTrash: async () => true,
        batchMarkSeen: async () => true,
        batchToggleFlag: async () => true,
        moveToFolder: async () => true,
        batchMoveToFolder: async () => true,
        withClient: (_c: unknown, fn: (c: unknown) => unknown) => fn(fakeClient),
        imapErrDetail: (e: unknown) => (e as Error)?.message || String(e),
        invalidateClient: () => undefined,
        isAuthFailed: () => false,
      };
    case './token-auth.cjs':
      return {
        enc: (s: string) => Buffer.from(s).toString('base64'),
        dec: (b: string) => Buffer.from(b, 'base64').toString('utf8'),
        freshCredentials: async () => fakeCreds,
        withAuthRetry: (_a: unknown, fn: (c: unknown) => unknown) => fn(fakeCreds),
        _tokenRefreshPromises: new Map(),
      };
    case './imap-queue.cjs':
      return {
        markDeleted: () => undefined,
        isDeleted: () => false,
        clearDeleted: () => undefined,
        _lastSyncTime: new Map(),
        _imapQueues: new Map(),
        _lastImapOpTime: new Map(),
        _activeFolderPerAccount: new Map(),
        imapLock: (_e: string, fn: () => unknown) => Promise.resolve(fn()),
        SYNC_CONCURRENCY: 2,
        syncOneInboxWithTimeout: async () => ({ total: 0, synced: 0 }),
        isTimeoutError: () => false,
        runWithConcurrency: async (_items: unknown[]) => [],
      };
    case './auth.cjs':
      return { startOAuthFlow: async () => ({ access_token: 'a', refresh_token: 'r', id_token: 'i' }) };
    case './providers.cjs':
      return { detectSettings: async () => ({ imap: { host: 'h', port: 993, secure: true }, smtp: { host: 's', port: 465, secure: true }, source: 'guess', note: '' }) };
    case './compose.cjs':
      return {
        splitAddresses: (s: string) => (s || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean),
        buildReply: () => ({ to: '', cc: '', subject: '', text: '', html: '', inReplyTo: undefined, references: undefined }),
        buildReplyAll: () => ({ to: '', cc: '', subject: '', text: '', html: '', inReplyTo: undefined, references: undefined }),
        buildForward: () => ({ to: '', cc: '', subject: '', text: '', html: '', inReplyTo: undefined, references: undefined }),
      };
    case './db-drizzle.cjs':
      return { adjustFolderUnread: () => undefined };
    case './notifications.cjs':
      return {
        notifyNewMessages: () => undefined,
        showDesktopNotification: () => undefined,
        flushAllPendingToasts: () => undefined,
        DEFAULT_NOTIFICATION_SETTINGS: {},
      };
    case './background-sync.cjs':
      return { updateBackgroundSyncSchedule: () => undefined };
    case './shell-integration.cjs':
      return { syncStartupSettings: () => undefined };
    default:
      return new Proxy({}, { get: () => vi.fn() });
  }
};

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
  injectStub(require.resolve(rel), stubFor(rel));
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
    // Kanallar ipc/ altındaki alan modüllerinde; updater kendi modülünde.
    const MAIN_FILES = [...readdirSync(IPC_DIR).map((f) => `./ipc/${f}`), './updater.cjs'];
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

    const all = [...readdirSync(IPC_DIR).map((f) => `./ipc/${f}`), './notifications.cjs', './updater.cjs', './background-sync.cjs']
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

// ── Duman: tum handler'lar cagrilabilir olmali (bölme güvenliği) ──────────────
// ipc.cjs alan bazli modüllere bölündüğünde yanlış modüle düşen bir yardımcı
// fonksiyon, yalnızca İLGİLİ handler çağrıldığında ReferenceError üretir.
// Kanal sayısı testi bunu yakalayamaz (kayıt yine 66 olur). Bu duman, her
// handler'ı stub bağımlılıklarla bir kez ÇAĞIRIR ve yalnız ReferenceError'u
// hata sayar — stub'lar yüzünden çıkan TypeError'lar beklenendir.
describe('registerIpc — handler dumanı (bölme güvenliği)', () => {
  it('hiçbir handler ReferenceError üretmez', async () => {
    const failures: string[] = [];
    for (const [ch, fn] of handlers) {
      try {
        // Zincir takılmaları önle: stub'lar senkron döner ama yine de sınırla
        const r = Promise.race([
          Promise.resolve(fn({}, 'a@x.com', 'INBOX', ['123'], 1, {})),
          new Promise((res) => setTimeout(() => res('timeout-guard'), 500)),
        ]);
        await r;
      } catch (e) {
        // DİKKAT: handler gövdelerindeki catch blokları ReferenceError'u
        // yakalayıp friendlySyncError ile SARAR — surfaced hata artık Error
        // olur, instanceof yakalayamaz. Sarmalanan mesaj metni hâlâ
        // "ReferenceError: X is not defined" içerir; mesaj bazında aranır.
        const msg = String((e as Error)?.message || e);
        if (e instanceof ReferenceError || /ReferenceError|is not defined/.test(msg)) {
          failures.push(`${ch}: ${msg}`);
        }
      }
    }
    expect(failures, `ReferenceError üreten handler'lar:\n${failures.join('\n')}`).toEqual([]);
  }, 20000);
});
