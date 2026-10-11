// electron/mail-syncfolder.test.ts — syncFolder'ın bayat kayıt sözleşmesi.
//
// KULLANICI BELİRTİSİ (v1.0.62): "Gmail dışı hesapta Spam klasöründe 1 e-posta
// görünüyor ama açınca boş; eşitlesem de düzelmiyor."
//
// KÖK NEDEN HIPOTEZI: Spam klasörleri sunucular tarafından otomatik temizlenip
// YENİDEN YARATILIR → UIDVALIDITY sıfırlanır → yerel DB'de ESKİ UID'li satır
// kalır. syncFolder'ın sıfırlama algısı (lastSeenUid > serverMaxUid) akışı
// İLK SENKRON hızlı yoluna düşürür; bu yol iletileri çekip ERKEN DÖNER ve
// budama (prune) bloğuna HİÇ ULAŞMAZ → bayat satır sonsuza dek kalır:
//   - listede görünür ("1 e-posta görünüyor")
//   - açılınca ölü UID ile gövde getirme patlar ("boş")
//   - Eşitle de düzeltmez ("eşitlesem de olmuyor")
//
// Bu dosya İSTENEN davranışı sabitler: ilk senkron hızlı yolu DA budamaya
// düşer; bayat satır temizlenir, yeni ileti kalır. Testler sahte IMAP
// istemcisi + gerçek SQLite ile koşar (syncFolder'ın client DI parametresi).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const db = require('./db.cjs') as {
  initDb: (p: string) => unknown;
  getDb: () => {
    prepare: (s: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] };
  };
  addAccount: (a: Record<string, unknown>) => unknown;
  getAccountByEmail: (e: string) => unknown;
};

// Sahte IMAP istemcisi: imapflow yüzeyinin syncFolder'ın kullandığı kısmı
function fakeImap(opts: {
  exists: number;
  uidNext: number;
  unseen?: number;
  uidsOnServer: number[];            // kutuda bulunan UID'ler
  envelopes?: Record<number, { subject?: string }>; // UID -> zarf
}) {
  const uidSet = new Set(opts.uidsOnServer);
  const searchByUid = (query: string): number[] => {
    // "N:*" veya "N:M" veya "N" biçimlerini çöz
    const m = String(query).match(/^(\d+):(\*|\d+)$/);
    if (m) {
      const lo = Number(m[1]);
      const hi = m[2] === '*' ? Math.max(...opts.uidsOnServer, lo) : Number(m[2]);
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      return opts.uidsOnServer.filter((u) => u >= a && u <= b);
    }
    // virgüllü liste: prune bunu kullanır — yalnız SUNUCUDA VAR OLANLARI döndür
    if (String(query).includes(',')) {
      return String(query)
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => uidSet.has(n));
    }
    const single = Number(query);
    return uidSet.has(single) ? [single] : [];
  };
  const client = {
    mailboxOpen: async () => ({ exists: opts.exists, uidNext: opts.uidNext }),
    status: async () => ({ messages: opts.exists, unseen: opts.unseen ?? 0, recent: 0 }),
    search: async (q: { uid: string }) => searchByUid(q.uid),
    fetch: async function* (range: string) {
      // hedef UID listesi (virgüllü) veya dizi aralığı "N:*"
      let uids: number[] = [];
      if (range.includes(',')) {
        uids = range.split(',').map((x) => Number(x.trim())).filter((n) => uidSet.has(n));
      } else {
        uids = searchByUid(range);
      }
      for (const u of uids) {
        const env = opts.envelopes?.[u] ?? { subject: `ileti-${u}` };
        yield {
          uid: u,
          envelope: { subject: env.subject, from: [{ address: 'a@b.c', name: 'A' }], to: [], date: new Date() },
          flags: new Set(['\\Seen']),
          bodyStructure: { type: 'text/plain' },
        };
      }
    },
    messageFlagsAdd: async () => true,
    messageFlagsRemove: async () => true,
  };
  return client;
}

let tmpDir = '';
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'postaci-sf-'));
  db.initDb(tmpDir);
  db.addAccount({ provider: 'imap', email: 'kullanici@ornek.com', password: 'x', imap: { host: 'h', port: 993 }, smtp: { host: 's', port: 465, secure: true } } as never);
});
afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

const EMAIL = 'kullanici@ornek.com';
const FOLDER = 'Spam';

const uidsInFolder = (): string[] =>
  (db.getDb().prepare(
    `SELECT uid FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE) AND folder_path=? COLLATE NOCASE`,
  ).all(EMAIL, FOLDER) as { uid: string }[]).map((r) => String(r.uid));

const seedStaleRow = (uid: string) => {
  db.getDb().prepare(
    `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, is_read, starred, has_att)
     VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, 'bayat konu', 'eski@a.b', NULL, '2026-01-01', 'bayat', 0, 0, 0)`,
  ).run(EMAIL, FOLDER, uid);
};

const { syncFolder } = require('./mail.cjs') as {
  syncFolder: (p: Record<string, unknown>) => Promise<{ total: number; synced: number }>;
};

describe('syncFolder — UIDVALIDITY sıfırlanması (spam klasörü yeniden yaratıldı)', () => {
  beforeEach(() => {
    db.getDb().prepare(
      `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)`,
    ).run(EMAIL);
  });

  it('eski nesil bayat satır temizlenir, yeni ileti kalır (kullanıcı belirtisi)', async () => {
    // Yerel: ESKİ nesilden kalma bayat satır (eski UID 4500)
    seedStaleRow('4500');
    // Sunucu: klasör yeniden yaratıldı; kutuda 1 YENİ ileti var (uid 1)
    const client = fakeImap({ exists: 1, uidNext: 2, unseen: 1, uidsOnServer: [1] });

    const res = await syncFolder({
      provider: 'imap', email: EMAIL, folderPath: FOLDER, db: db.getDb(), limit: 50, client,
    } as never);

    expect(res.synced).toBe(1);
    const uids = uidsInFolder();
    // Yeni ileti yerelde
    expect(uids).toContain('1');
    // BAYAT satır budanmalı — aksi halde listede "1 e-posta" görünür ama
    // açıldığında sunucuda olmayan UID ile gövde istenir: BOŞ.
    expect(uids).not.toContain('4500');
  });

  it('artımlı senkronda yeni ileti yoksa tablo değişmez', async () => {
    seedStaleRow('1');
    const client = fakeImap({ exists: 1, uidNext: 2, uidsOnServer: [1] });
    const res = await syncFolder({
      provider: 'imap', email: EMAIL, folderPath: FOLDER, db: db.getDb(), limit: 50, client,
    } as never);
    expect(res.total).toBe(1);
    expect(uidsInFolder()).toEqual(['1']);
  });

  it('sunucu kutuyu boşalttıysa yerel satırlar temizlenir', async () => {
    seedStaleRow('7');
    const client = fakeImap({ exists: 0, uidNext: 1, uidsOnServer: [] });
    await syncFolder({
      provider: 'imap', email: EMAIL, folderPath: FOLDER, db: db.getDb(), limit: 50, client,
    } as never);
    expect(uidsInFolder()).toEqual([]);
  });

  it('çoklu bayat satır + sunucu hiç UID döndürmezse veri kaybı koruması satırları korur', async () => {
    seedStaleRow('100');
    seedStaleRow('200');
    // Sunucu 1 yeni ileti döndürüyor ama PRUNE sorgusuna boş yanıt veren anomal
    const client = fakeImap({ exists: 1, uidNext: 2, uidsOnServer: [1] });
    const origSearch = client.search.bind(client);
    // prune batch aramasına boş dön (anomali simülasyonu); diğer aramalar normal
    client.search = async (q: { uid: string }) => {
      if (String(q.uid).includes(',')) return [];
      return origSearch(q);
    };
    await syncFolder({
      provider: 'imap', email: EMAIL, folderPath: FOLDER, db: db.getDb(), limit: 50, client,
    } as never);
    const uids = uidsInFolder();
    // koruma: hiçbir bayat satır silinmedi
    expect(uids).toContain('100');
    expect(uids).toContain('200');
  });
});