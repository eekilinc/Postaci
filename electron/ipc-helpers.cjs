// electron/ipc-helpers.cjs - IPC isleyici ortak yardimcilari.
//
// ipc.cjs'ten ayrildi (2026-10-11): handler'lar alan bazli modullere
// bolunurken ortak yardimcilar tek yerde kalir. Bu dosya kendi
// bagimliliklarini dogrudan require eder; ipc.cjs ile dongsuzdur.
//
// DISARIDAN KULLANANLAR DIKKAT: _folderSyncInFlight / _folderListFetchedAt
// paylasilan MUTABLE durumdur — ayni Map referansi import edilmelidir,
// kopya degil.
const { getDb, getAccountByEmail, updateTokens, saveMessageBody, saveAttachments } = require('./db.cjs');
const { adjustFolderUnread } = require('./db-drizzle.cjs');
const { listFolders, isAuthFailed, invalidateClient, withClient, imapErrDetail } = require('./mail.cjs');
const { freshCredentials } = require('./token-auth.cjs');
const { imapLock, markDeleted } = require('./imap-queue.cjs');


const _folderSyncMap = new Map(); // email -> timestamp
const _folderSyncInFlight = new Map(); // email -> Promise
// Klasör listesinin IMAP'ten son çekildiği zaman (normEmail -> timestamp)
const _folderListFetchedAt = new Map();
const FOLDER_LIST_REFRESH_MS = 10 * 60 * 1000; // 10 dakikada bir tazele


// IPC yardımcı: asla sonsuza takılmaması için sınırlı süre (takılan IMAP sözünü boşa düşürür)
function withIpcTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} zaman aşımına uğradı (${Math.round(ms / 1000)} sn). Tekrar deneyin.`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => { if (t) clearTimeout(t); });
}


// Okunmamış sayacını yerel işlemler için delta ile güncelle.
// DİKKAT: `UPDATE folders SET unread_count = (SELECT SUM(...) FROM messages ...)`
// yazımı sunucudan gelen gerçek değeri yerel alt kümenin sayısıyla eziyordu
// (900 okunmamışlık klasör, 50 ileti senkronlandığı için 50'ye düşüyordu).
// Doğrusu: sunucu STATUS değerini yazar, yerel işlemler delta uygular.
function adjustUnread(email, folderPath, delta) {
  if (!delta || !folderPath) return;
  try {
    adjustFolderUnread(getDb(), email, folderPath, delta);
  } catch (e) {
    console.warn('[unread] sayaç güncellenemedi:', e?.message);
  }
}

// Verilen iletilerden kaç tanesi okunmamış? (silme/taşıma sonrası delta için)
function countUnread(email, folderPath, uids) {
  try {
    if (!Array.isArray(uids) || uids.length === 0) return 0;
    const ph = uids.map(() => '?').join(',');
    const row = getDb().prepare(
      `SELECT COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS n
       FROM messages
       WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
         AND folder_path=? COLLATE NOCASE AND uid IN (${ph})`
    ).get(email, folderPath, ...uids.map(String));
    return row?.n || 0;
  } catch {
    return 0;
  }
}

// Klasör önbelleğini tek yerden oku.
// unread_count kaynağı: DB'deki folders tablosunda SAKLANAN değer.
// Bu değeri sunucudan IMAP STATUS ile dolduran iki yol var:
//   - syncFolder (mail.cjs) → aktif klasör her senkronlanınca
//   - refreshFolderCounts (mail.cjs) → 15 dakikada bir tüm klasörler
// Daha önce burada HER çağrıda yerel `messages` alt kümesinden yeniden hesaplanıp
// folders.unread_count EZİLİYORDU. Yerel küme limit (30/50) ile sınırlı olduğu
// için 900 okunmamışı olan bir klasör 50'ye düşüyor ve refreshFolderCounts'in
// STATUS verisi kalıcı olarak bozuluyordu. Artık yalnızca okuyoruz.
function readFolderCache(email) {
  const db = getDb();
  const cached = db.prepare(`
    SELECT f.name, f.path, f.flags,
           COALESCE(f.unread_count, 0) AS unread_count,
           COALESCE((SELECT SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END)
                     FROM messages m
                     WHERE m.account_id = f.account_id AND lower(m.folder_path) = lower(f.path)), 0) AS local_unread
    FROM folders f
    WHERE f.account_id = (SELECT id FROM accounts WHERE email = ? COLLATE NOCASE)
  `).all(email);

  return (cached || []).map((f) => {
    let flags = [];
    try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
    // Sunucudan hiç STATUS gelmemişse (unread_count hiç yazılmamışsa) yerel
    // hesapla düşüş yap; yazılmışsa sunucu değeri doğrudur.
    const stored = Number(f.unread_count) || 0;
    const local = Number(f.local_unread) || 0;
    return {
      path: f.path,
      name: f.name,
      flags,
      delimiter: '/',
      unread_count: stored > 0 ? stored : local,
    };
  });
}


async function fetchFoldersFromImap(acc) {
    const email = acc.email;
    if (_folderSyncInFlight.has(email)) {
      return _folderSyncInFlight.get(email);
    }

    const task = (async () => {
      let creds = await freshCredentials(acc);
      let list;
      try {
        list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
      } catch (initialErr) {
        let activeErr = initialErr;
        const errStr = `${activeErr?.message || ''} ${activeErr?.responseText || ''} ${activeErr?.response || ''}`.toLowerCase();
        const needForcedRefresh =
          (errStr.includes('authenticated but not connected') && acc.provider === 'microsoft') ||
          (acc.auth_type !== 'password' && isAuthFailed(initialErr));
        if (needForcedRefresh) {
          try {
            console.log(`[mail:folders] ${email} için token zorla yenilenip tekrar deneniyor...`);
            try { invalidateClient(email); } catch {}
            const latest = getAccountByEmail(email) || acc;
            if (latest.refresh_token_enc) {
              updateTokens(email, { refreshTokenEnc: latest.refresh_token_enc, accessTokenEnc: null, tokenExpiry: null });
              creds = await freshCredentials(getAccountByEmail(email) || acc, true);
              list = await imapLock(email, () => listFolders({ provider: acc.provider, email: acc.email, ...creds }));
            }
          } catch (retryErr) {
            activeErr = retryErr;
          }
        }
        if (!list) {
          console.warn('[mail:folders] IMAP klasör listesi alınamadı, DB önbelleği kullanılıyor:', activeErr?.message);
          try {
            const db = getDb();
            const cached = db.prepare(`SELECT name, path, flags FROM folders WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)`).all(email);
            if (cached && cached.length > 0) {
              return cached.map((f) => {
                let flags = [];
                try { if (f.flags) flags = JSON.parse(f.flags); } catch {}
                return { path: f.path, name: f.name, flags, delimiter: '/' };
              });
            }
          } catch {}
          throw activeErr;
        }
      }
      try {
        const db = getDb();
        // Sadece UPSERT yetiyordu: sunucuda silinmiş bir klasör yerel DB'de
        // kalıcı olarak listelenmeye devam ediyordu (bayat rozetle).
        const upsert = db.prepare(`
          INSERT INTO folders (account_id, name, path, flags, unread_count)
          VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, 0)
          ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, flags=excluded.flags
        `);
        const serverPaths = [];
        for (const f of list) {
          upsert.run(email, f.name || f.path, f.path, JSON.stringify(f.flags || []));
          serverPaths.push(f.path);
        }
        // Artık sunucuda olmayan, yerelde mesaj/ek kaydı da bulunmayan
        // klasörleri temizle (o klasörün verisi varsa dokunma).
        try {
          if (serverPaths.length > 0) {
            const ph = serverPaths.map(() => '?').join(',');
            db.prepare(
              `DELETE FROM folders
               WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
                 AND path NOT IN (${ph})
                 AND path NOT IN (
                   SELECT DISTINCT folder_path FROM messages
                   WHERE account_id=(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
                 )`,
            ).run(email, ...serverPaths, email);
          }
        } catch (delErr) {
          console.warn('[mail:folders] bayat klasör temizliği uyarısı:', delErr?.message);
        }
      } catch (e) {
        console.warn('[mail:folders] DB klasör önbelleği güncelleme uyarısı:', e?.message);
      }
      return list.map((f) => ({ path: f.path, name: f.name, flags: f.flags, delimiter: f.delimiter }));
    })();

    _folderSyncInFlight.set(email, task);
    try {
      const res = await withIpcTimeout(task, 110000, 'Klasör listesi');
      _folderListFetchedAt.set((email || '').toLowerCase().trim(), Date.now());
      return res;
    } finally {
      _folderSyncInFlight.delete(email);
    }
}


// Gövde + ek bilgilerini DB'ye yazan tek fonksiyon (body ve şablon yolları ortak kullanır)
function persistBody(email, folder, uid, fetched) {
    saveMessageBody(email, folder, uid, fetched);
    saveAttachments(email, folder, uid, fetched.attachments || []);
}


function isTrashFolder(folderPath) {
    return /trash|çöp|deleted|bin|silinmiş|recycl|ilk kutusu/i.test(folderPath || '');
}

// Özel klasör (çöp/spam/arşiv) çözümlemesi — NOTLAR:
//  - SQLite'un lower()'ı ASCII-only: lower('[Gmail]/Çöp kutusu') -> '[gmail]/Çöp kutusu'
//    (Ç küçülmez), dolayısıyla `lower(path) LIKE '%çöp%'` Türkçe adlarda HİÇ eşleşmez.
//    Unicode-duyarlı `ltr()` kullanılıyor (db.cjs'te kayıtlı).
//  - "Silinmiş Öğeler" (TR Outlook), "Çöp" (TR Yahoo), "Zil/Köp" gibi isimler de eklendi.
//  - ORDER BY id DESC: yeniden adlandırılan/taşınan klasörün BAYAT satırı seçiliyordu.
function findSpecialFolder(email, patterns, fallbacks) {
    try {
      const where = patterns.map(() => '(ltr(path) LIKE ? OR ltr(name) LIKE ?)').join(' OR ');
      const params = [];
      for (const p of patterns) params.push(`%${p}%`, `%${p}%`);
      const row = getDb().prepare(
        `SELECT path FROM folders
         WHERE account_id = (SELECT id FROM accounts WHERE email=? COLLATE NOCASE)
           AND (${where})
         ORDER BY id DESC LIMIT 1`
      ).get(email, ...params);
      if (row?.path) return row.path;
    } catch (e) {
      console.warn('[folders] özel klasör araması uyarısı:', e?.message);
    }
    const acc = getAccountByEmail(email);
    if (acc?.provider === 'google') return fallbacks.google;
    if (acc?.provider === 'microsoft') return fallbacks.microsoft;
    return fallbacks.other;
}

function getTrashFolder(email) {
    return findSpecialFolder(
      email,
      ['çöp', 'trash', 'deleted', 'bin', 'silinmiş', 'recycl'],
      { google: '[Gmail]/Çöp kutusu', microsoft: 'Deleted Items', other: 'Trash' },
    );
}

function getSpamFolder(email) {
    return findSpecialFolder(
      email,
      ['spam', 'junk', 'gereksiz', 'istenmeyen', 'önemsiz'],
      { google: '[Gmail]/Spam', microsoft: 'Junk Email', other: 'Junk' },
    );
}

function getArchiveFolder(email) {
    return findSpecialFolder(
      email,
      ['archive', 'arşiv', 'tüm postalar', 'all mail'],
      { google: '[Gmail]/Tüm Postalar', microsoft: 'Archive', other: 'Archive' },
    );
}


async function emptySpecialFolder({ email, folder, patterns, imapFlag, label }) {
  const acc = getAccountByEmail(email);
  if (!acc) throw new Error('Hesap bulunamadı.');

// 1. Doğru klasörü IMAP'ten doğrula (\Trash / \Junk bayrağı)
  let targetFolder = folder;
  let creds = null;
  try {
    creds = await freshCredentials(acc);
    await imapLock(email, async () =>
      withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
        if (imapFlag) {
          try {
            const detected = await findSpecialFolderByFlag(client, imapFlag);
            if (detected) targetFolder = detected;
          } catch (e) {
            console.warn(`[empty] ${label} bayrağıyla klasör tespiti başarısız:`, e?.message);
          }
        }
        // Tahmin edilen yol gerçekten açılabiliyor mu?
        try {
          await client.mailboxOpen(targetFolder, { readOnly: true });
        } catch (e) {
          // Yol yanlışsa: hiçbir şey silmeden hataya düş (sessiz sahte başarı yok)
          throw new Error(`${label} klasörü sunucuda açılamadı ("${targetFolder}"): ${e?.responseText || e?.message}`);
        }
      }),
    );
  } catch (e) {
    console.error(`[empty-${label}] hata:`, e);
    throw new Error(`${label} klasörü sunucuda açılamadı: ${e?.message || e}. Yerel veriler korundu.`);
  }

// 2. Sunucuda expunge et
  let purgedUids = [];
  try {
    purgedUids = await imapLock(email, async () =>
      withClient({ provider: acc.provider, email: acc.email, ...creds }, async (client) => {
        await client.mailboxOpen(targetFolder, { readOnly: false });

        const found = await client.search({ all: true }, { uid: true });
        if (!Array.isArray(found)) {
          // search() false/undefined döndü -> BAŞARISIZ. Önceden burası boş
          // kutu sanılıp sessizce "başarılı" dönülüyordu.
          throw new Error('Sunucu ileti listesini döndürmedi (arama başarısız veya bağlantı koptu).');
        }
        const uids = found.map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (uids.length === 0) {
          try { await client.mailboxClose(); } catch {}
          return [];
        }

        // UID setini parçala: 20.000 iletiyi tek STORE'da göndermek
        // sunucu tarafında sessizce reddediliyor.
        const CHUNK = 400;
        for (let i = 0; i < uids.length; i += CHUNK) {
          const chunk = uids.slice(i, i + CHUNK);
          const seq = chunk.join(',');
          try {
            await client.messageDelete(seq, { uid: true });
          } catch (e) {
            // messageDelete STORE + EXPUNGE yapar; başarısız olursa bayrak + EXPUNGE
            console.warn(`[empty] ${label} messageDelete başarısız (${e?.message}), bayrak yolu deneniyor`);
            const flagged = await client.messageFlagsAdd(seq, ['\\Deleted'], { uid: true });
            if (flagged === false) {
              throw new Error(`Sunucu Deleted bayrağını kabul etmedi (UID ${chunk[0]}-${chunk[chunk.length - 1]}).`);
            }
            await client.run('UID EXPUNGE');
          }
        }

        // 3. DOĞRULA: hâlâ duran ileti var mı?
        const remaining = await client.search({ all: true }, { uid: true });
        const left = Array.isArray(remaining) ? remaining.length : -1;
        if (left !== 0) {
          throw new Error(
            left < 0
              ? 'Silme sonrası doğrulama yapılamadı (sunucu yanıt vermedi).'
              : `Sunucuda ${left} ileti hâlâ duruyor; silme tamamlanamadı.`,
          );
        }

        try { await client.mailboxClose(); } catch {}
        return uids.map(String);
      }),
    );
  } catch (e) {
    console.error(`[empty-${label}] hata:`, e);
    throw new Error(`${label} sunucuda boşaltılamadı: ${e?.message || e}. Yerel veriler korundu.`);
  }

// 4. IMAP doğrulandı: yerel DB'yi temizle
  const where = '(ltr(folder_path)=ltr(?)' + patterns.map(() => ' OR ltr(folder_path) LIKE ?').join('') + ')';
  const likeParams = patterns.map((p) => `%${p}%`);
  const pathWhere = '(ltr(path)=ltr(?)' + patterns.map(() => ' OR ltr(path) LIKE ?').join('') + ')';

  for (const u of purgedUids) {
    markDeleted(email, targetFolder, u);
  }
  const db = getDb();
  const accId = `(SELECT id FROM accounts WHERE email=? COLLATE NOCASE)`;
  const deleted = db
    .prepare(`DELETE FROM messages WHERE account_id=${accId} AND ${where}`)
    .run(email, targetFolder, ...likeParams);
  try {
    db.prepare(`DELETE FROM attachments WHERE account_id=${accId} AND ${where}`)
      .run(email, targetFolder, ...likeParams);
  } catch {}
  try {
    db.prepare(`UPDATE folders SET unread_count=0 WHERE account_id=${accId} AND ${pathWhere}`)
      .run(email, targetFolder, ...likeParams);
  } catch {}

  console.log(`[empty-${label}] ${email}: sunucuda ${purgedUids.length} ileti silindi, yerelden ${deleted.changes} satır temizlendi.`);
  return { purged: purgedUids.length, removedLocal: deleted.changes, folder: targetFolder };
}

async function findSpecialFolderByFlag(client, flag) {
  try {
    const tree = await client.listTree();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.flags && n.flags.has(flag)) return n.path;
        if (n.folders) {
          const sub = walk(n.folders);
          if (sub) return sub;
        }
      }
      return null;
    };
    return walk(tree?.folders || tree) || null;
  } catch {
    return null;
  }
}

const TRASH_PATTERNS = ['çöp', 'trash', 'deleted', 'bin', 'silinmiş', 'recycl'];


const SPAM_PATTERNS = ['spam', 'junk', 'gereksiz', 'istenmeyen', 'önemsiz'];


function friendlySyncError(provider, err) {
    // imapflow genel mesajların (örn. 'Command failed') asıl nedenini
    // responseText/response alanlarında taşır — önce tam detayı kur
    const raw = (typeof imapErrDetail === 'function' ? imapErrDetail(err) : (err?.message || String(err || '')));
    const low = raw.toLowerCase();
    const isGoogle = (provider || '').toLowerCase().includes('google') || low.includes('gmail');
    if (/invalid_grant|invalid client|unauthorized_client|access_denied|token has been expired or revoked|refresh token/i.test(raw)) {
      return `${raw} — Google/sağlayıcı oturumu reddetti. Çözüm: Ayarlar → Hesaplar'dan bu hesabı silip tekrar ekleyin (açılan Google izin ekranında 'Tüm e-postaları okuma/yönetme' kutusunu işaretlediğinizden emin olun).`;
    }
    if (/imap.*disabled|imap access is disabled|application-specific password|app password|invalid credentials|authentication failed|auth failed|login failed|oauth.*401|alert.*please log in via your web browser/i.test(raw)) {
      return `${raw} — Gmail bu hesaba IMAP erişimini onaylamadı. Lütfen kontrol edin:\n1) Gmail web arayüzünde Ayarlar → 'Tüm ayarları görüntüleyin' → 'Yönlendirme ve POP/IMAP' sekmesinde 'IMAP'i etkinleştir' seçeneğinin açık olduğundan emin olun.\n2) Google girişinde istenen e-posta okuma/yazma izin kutusunu onaylayın.\n3) Okul/kurum hesabıysa yöneticiniz üçüncü taraf IMAP erişimini kapatmış olabilir (bu durumda Ayarlar → Hesaplar → Manuel IMAP seçeneği ile Google Uygulama Şifresi girerek bağlanabilirsiniz).`;
    }
    if (/too many simultaneous connections|too many connections/i.test(raw)) {
      return `${raw} — Gmail eşzamanlı bağlantı limitine takıldı (çok hesap aynı anda). Birkaç saniye bekleyip Eşitle'ye tekrar basın.`;
    }
    if (/zaman aşımına uğradı|timeout|etimedout|econnreset|epipe|socket|network|fetch failed|enotfound/i.test(raw)) {
      return `${raw} — Sunucu bağlantısı zaman aşımına uğradı veya ağ kesildi. İnternet bağlantınızı kontrol edip tekrar deneyin.`;
    }
    if (isGoogle && /no such mailbox|mailbox|folder/i.test(raw)) {
      return `${raw} — Klasör Gmail'de bulunamadı (etiket silinmiş veya adı değişmiş olabilir). Klasör listesini yenileyip tekrar deneyin.`;
    }
    return raw;
}



module.exports = {
  // durum
  _folderSyncMap, _folderSyncInFlight, _folderListFetchedAt, FOLDER_LIST_REFRESH_MS,
  // yardimcilar
  withIpcTimeout, adjustUnread, countUnread, readFolderCache, fetchFoldersFromImap,
  persistBody, isTrashFolder, findSpecialFolder, getTrashFolder, getSpamFolder,
  getArchiveFolder, friendlySyncError, emptySpecialFolder, findSpecialFolderByFlag,
  TRASH_PATTERNS, SPAM_PATTERNS,
};
