// electron/mail.cjs - IMAP senkronizasyon + SMTP gönderim (imapflow + nodemailer)
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const { loadConfig } = require('./auth.cjs');

const IMAP = {
  google: { host: 'imap.gmail.com', port: 993 },
  microsoft: { host: 'outlook.office365.com', port: 993 },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
};

const TOKEN_URL = {
  google: 'https://oauth2.googleapis.com/token',
  microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  yahoo: 'https://api.login.yahoo.com/oauth2/get_token',
};

async function refreshAccessToken(provider, refreshToken) {
  const config = loadConfig()[provider] || {};
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  // Microsoft için IMAP ve SMTP kapsamlarını açıkça belirt
  if (provider === 'microsoft') {
    body.set('scope', 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send');
  }
  // Yahoo yenilemede de aynı redirect_uri'yi ister (sabit https).
  if (provider === 'yahoo') body.set('redirect_uri', 'https://127.0.0.1:55433/callback');
  const res = await fetch(TOKEN_URL[provider], {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Token yenilenemedi (${provider}, ${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

function emailFromIdToken(idToken) {
  try {
    if (!idToken) return { email: null, name: null };
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return { email: payload.preferred_username || payload.email || null, name: payload.name || null };
  } catch {
    return { email: null, name: null };
  }
}

async function fetchProfileEmail(provider, accessToken) {
  if (provider === 'google') {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('Google profili alınamadı.');
    const j = await r.json();
    return { email: j.email, name: j.name };
  }
  if (provider === 'microsoft') {
    const r = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('Microsoft profili alınamadı.');
    const j = await r.json();
    return { email: j.mail || j.userPrincipalName, name: j.displayName };
  }
  if (provider === 'yahoo') {
    const r = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('Yahoo profili alınamadı.');
    const j = await r.json();
    return { email: j.email || null, name: j.name || null };
  }
  return { email: null, name: null };
}

function addrToString(addr) {
  // imapflow: doğrudan dizi [{name, address}]; bazı kaynaklarda {value:[...]}
  const list = Array.isArray(addr) ? addr : addr?.value;
  if (!list) return '';
  return list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ');
}

// Aktif IMAP istemci havuzu (email -> { client, credHash, idleTimer })
// Sürekli connect/logout yapmak yerine bağlantıyı canlı tutar;
// özellikle Hotmail / Microsoft / Exchange sunucularında hızlı oturum aç/kapa kaynaklı
// 'User is authenticated but not connected' kısıtlamalarını ve gecikmelerini tamamen çözer.
const _activeClients = new Map();

function closeClient(client) {
  if (!client) return;
  try {
    if (client.usable) {
      client.logout().catch(() => {
        try { client.close(); } catch {}
      });
    } else {
      client.close();
    }
  } catch {
    try { client.close(); } catch {}
  }
}

function invalidateClient(email) {
  const key = (email || '').toLowerCase();
  const entry = _activeClients.get(key);
  if (entry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    _activeClients.delete(key);
    closeClient(entry.client);
  }
}

function releaseClient(email) {
  const key = (email || '').toLowerCase();
  const entry = _activeClients.get(key);
  if (!entry) return;

  if (entry.idleTimer) clearTimeout(entry.idleTimer);

  // 3 dakika boyunca hesaptan yeni istek gelmezse bağlantıyı nazikçe kapat (özellikle Exchange oturumunun canlı kalması için)
  entry.idleTimer = setTimeout(() => {
    const cur = _activeClients.get(key);
    if (cur && cur.client === entry.client) {
      _activeClients.delete(key);
      closeClient(entry.client);
    }
  }, 180000);
}

async function getOrCreateClient(creds) {
  const { provider, email, accessToken, password, imapHost, imapPort } = creds;
  const key = (email || '').toLowerCase().trim();
  const credHash = `${provider}:${accessToken || ''}:${password || ''}:${imapHost || ''}:${imapPort || ''}`;

  const existing = _activeClients.get(key);
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    // Eğer şu an bir bağlantı kurulma aşamasındaysa, ikinci bir bağlantı açmak yerine
    // bu bağlantının tamamlanmasını bekle (Microsoft eşzamanlı bağlantı kilidini önler)
    if (existing.connectingPromise) {
      const client = await existing.connectingPromise;
      if (client && client.usable) {
        return { client, isReused: true };
      }
    }
    // Bağlantı kullanılabilir durumdaysa ve kimlik bilgileri değişmemişse tekrar kullan
    if (existing.client && existing.client.usable && existing.credHash === credHash) {
      return { client: existing.client, isReused: true };
    }
    _activeClients.delete(key);
    closeClient(existing.client);
  }

  // Yeni bağlantı aç — eşzamanlı çağrıları tek bir bağlantıda birleştir
  let connectingResolve;
  const connectingPromise = new Promise((res) => { connectingResolve = res; });

  _activeClients.set(key, {
    client: null,
    connectingPromise,
    credHash,
    idleTimer: null,
  });

  try {
    const client = await openClient(creds);
    const entry = _activeClients.get(key);
    if (entry) {
      entry.client = client;
      entry.connectingPromise = null;
    }
    connectingResolve(client);

    client.on('close', () => {
      const cur = _activeClients.get(key);
      if (cur && cur.client === client) {
        if (cur.idleTimer) clearTimeout(cur.idleTimer);
        _activeClients.delete(key);
      }
    });

    return { client, isReused: false };
  } catch (err) {
    _activeClients.delete(key);
    connectingResolve(null);
    throw err;
  }
}

async function withClient(creds, fn) {
  let { client, isReused } = await getOrCreateClient(creds);
  try {
    const result = await fn(client);
    releaseClient(creds.email);
    return result;
  } catch (err) {
    const errText = `${err?.message || ''} ${err?.responseText || ''} ${err?.response || ''}`.toLowerCase();
    const isConnErr = !client.usable ||
      /connection|socket|econnreset|etimedout|epipe|closed|not connected|unusable|command failed|wrong_version_number/i.test(errText);

    if (isConnErr) {
      invalidateClient(creds.email);
      // Havuzdaki eski bir bağlantı sunucu tarafından sessizce düşürüldüyse,
      // temiz yeni bir bağlantıyla 1 kez otomatik dene
      if (isReused) {
        console.log(`[imap] Havuzdaki bağlantı zaman aşımına uğramış (${creds.email}), yeni bağlantıyla deneniyor...`);
        try {
          const fresh = await getOrCreateClient(creds);
          client = fresh.client;
          const result = await fn(client);
          releaseClient(creds.email);
          return result;
        } catch (retryErr) {
          invalidateClient(creds.email);
          throw retryErr;
        }
      }
    } else {
      releaseClient(creds.email);
    }
    throw err;
  }
}

async function openClient({ provider, email, accessToken, password, imapHost, imapPort }, attempt = 1) {
  const srv = (imapHost && imapPort)
    ? { host: imapHost, port: imapPort }
    : IMAP[provider];
  if (!srv) throw new Error(`IMAP sunucusu tanımsız: ${provider}`);
  const auth = accessToken ? { user: email, accessToken } : { user: email, pass: password };
  if (!accessToken && !password) throw new Error('Kimlik bilgisi yok, hesabı yeniden bağlayın.');
  const client = new ImapFlow({
    host: srv.host,
    port: srv.port,
    secure: srv.port === 993,
    logger: false,
    auth,
    disableAutoIdle: true,
  });
  // Soket hataları (örn. ECONNRESET) 'error' olayına düşer; dinleyicisiz
  // EventEmitter ana süreci çökertir ("A JavaScript error occurred").
  client.on('error', (e) => console.error('[imap] bağlantı hatası:', e?.message || e));
  try {
    await client.connect();
    return client;
  } catch (err) {
    try {
      client.close();
    } catch {}
    const msg = `${err?.message || ''} ${err?.responseText || ''} ${err?.response || ''}`;
    if (
      attempt <= 5 &&
      (msg.includes('User is authenticated but not connected') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Command failed'))
    ) {
      // Exchange backend oturum açılış gecikmesi (15-22 sn) için progresif aralıklar (3s, 5s, 8s, 10s)
      const waitMs = attempt === 1 ? 3000 : attempt === 2 ? 5000 : attempt === 3 ? 8000 : 10000;
      console.log(`[imap] Geçici bağlantı uyarısı (${err?.responseText || err?.message}), ${attempt}. deneme (${waitMs}ms) bekleniyor...`);
      await new Promise((r) => setTimeout(r, waitMs));
      return openClient({ provider, email, accessToken, password, imapHost, imapPort }, attempt + 1);
    }
    throw err;
  }
}

async function fetchBody({ provider, email, accessToken, password, imapHost, imapPort, folderPath = 'INBOX', uid }) {
  // İletinin tamamını indirip mailparser ile ayrıştır: parça numaralarıyla uğraşmaz,
  // base64/quoted-printable ve karakter setlerini doğru çözer.
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    const lock = await client.getMailboxLock(folderPath, { readOnly: true });
    try {
      // source:true ile ham RFC822 iletisi doğrudan alınır (parça anahtarı yok)
      const meta = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!meta?.source) throw new Error('Ham ileti alınamadı.');
      const parsed = await simpleParser(meta.source);
      const html = typeof parsed.html === 'string' && parsed.html ? parsed.html : parsed.textAsHtml || null;
      const refs = parsed.references
        ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
        : [];
      const attachments = (parsed.attachments || []).map((a, i) => ({
        index: i,
        filename: a.filename || `ek-${i + 1}.bin`,
        contentType: a.contentType || 'application/octet-stream',
        size: a.size || (a.content ? a.content.length : 0),
      }));
      return { html, text: parsed.text || null, messageId: parsed.messageId || null, references: refs, attachments };
    } finally {
      lock.release();
    }
  });
}

async function markSeen({ provider, email, accessToken, password, imapHost, imapPort, folderPath = 'INBOX', uid }) {
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
    return true;
  });
}

async function markUnseen({ provider, email, accessToken, password, imapHost, imapPort, folderPath = 'INBOX', uid }) {
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
    return true;
  });
}

async function syncFolder({ provider, email, accessToken, password, imapHost, imapPort, folderPath = 'INBOX', db, limit = 50, beforeUid = null, skipUid = null }) {
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    if (folderPath === '[Gmail]' || folderPath.toUpperCase() === '[GMAIL]') {
      return { total: 0, synced: 0, failed: 0, newMessages: [] };
    }
    // Google olmayan bir hesapta [Gmail]/... klasörü açılamaz (örneğin hesap değiştirilirken eski aktif klasör kalmışsa)
    if (provider !== 'google' && folderPath.toLowerCase().startsWith('[gmail')) {
      console.warn(`[sync] ${provider} (${email}) hesabında Gmail klasörü '${folderPath}' açılamaz, atlanıyor.`);
      return { total: 0, synced: 0, failed: 0, newMessages: [] };
    }
    let mb;
    try {
      mb = await client.mailboxOpen(folderPath, { readOnly: true });
    } catch (mbErr) {
      const respStr = typeof mbErr?.response === 'object' ? JSON.stringify(mbErr.response) : String(mbErr?.response || '');
      const errText = `${mbErr?.responseText || ''} ${respStr} ${mbErr?.message || ''}`.toLowerCase();
      const fpLower = folderPath.toLowerCase();
      const isNotFound = /doesn't exist|nonexistent|unknown mailbox|not exist|bulunamadı|no such mailbox|invalid mailbox/i.test(errText);
      const isSpecialFolder = /draft|taslak|trash|çöp|cop|bin|junk|spam|deleted/i.test(fpLower) || fpLower.includes('[gmail]');
      if (isNotFound || isSpecialFolder) {
        console.warn(`[sync] Klasör '${folderPath}' sunucuda bulunamadı veya açılamadı (${mbErr?.responseText || respStr || mbErr?.message}), yerel veriler korunuyor.`);
        return { total: 0, synced: 0, failed: 0, newMessages: [] };
      }
      throw mbErr;
    }
    let total = mb?.exists ?? client.mailbox?.exists ?? 0;
    let unread = 0;
    try {
      const status = await client.status(folderPath, { messages: true, recent: true, unseen: true });
      if (status && typeof status.messages === 'number') total = status.messages;
      if (status && typeof status.unseen === 'number') unread = status.unseen;
    } catch {
      // mailboxOpen zaten exists sayısını sağlıyor
    }

    const upsertFolder = db.prepare(
      `INSERT INTO folders (account_id, name, path, unread_count)
       VALUES ((SELECT id FROM accounts WHERE email=?), ?, ?, ?)
       ON CONFLICT(account_id, path) DO UPDATE SET unread_count=excluded.unread_count`,
    );
    upsertFolder.run(email, folderPath === 'INBOX' ? 'Gelen Kutusu' : folderPath, folderPath, unread);

    const checkExists = db.prepare(
      `SELECT 1 FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`,
    );

    const upsertMsg = db.prepare(
      `INSERT INTO messages (account_id, folder_path, uid, subject, from_addr, to_addr, date, snippet, is_read)
       VALUES ((SELECT id FROM accounts WHERE email=?), ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, folder_path, uid) DO UPDATE SET
         subject=excluded.subject, from_addr=excluded.from_addr, to_addr=excluded.to_addr,
         date=excluded.date, is_read=excluded.is_read`,
    );

    // UID ile çalış: önce UID listesi, son N tanesini (veya beforeUid öncesindekileri) çek
    const allUids = (await client.search({ all: true }, { uid: true })) || [];

    // Sunucudan silinmiş veya taşınmış mesajları yerel SQLite veritabanından temizle
    if (!beforeUid && allUids) {
      try {
        const localRows = db.prepare(
          `SELECT uid FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=?`
        ).all(email, folderPath);

        const serverUidSet = new Set(allUids.map(String));
        const deleteLocal = db.prepare(
          `DELETE FROM messages WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND uid=?`
        );
        const deleteAtt = db.prepare(
          `DELETE FROM attachments WHERE account_id=(SELECT id FROM accounts WHERE email=?) AND folder_path=? AND msg_uid=?`
        );

        for (const row of localRows) {
          // Yerel taslaklar ('draft-...') veya henüz giden iletiler ('local-...') silinmemeli
          if (String(row.uid).startsWith('draft-') || String(row.uid).startsWith('local-')) {
            continue;
          }
          if (!serverUidSet.has(String(row.uid))) {
            deleteLocal.run(email, folderPath, String(row.uid));
            try { deleteAtt.run(email, folderPath, String(row.uid)); } catch {}
          }
        }
      } catch (pruneErr) {
        console.warn(`[sync] yerel silinenleri temizleme uyarısı:`, pruneErr?.message || pruneErr);
      }
    }

    let candidateUids = allUids;
    if (beforeUid) {
      const beforeNum = Number(beforeUid);
      if (!Number.isNaN(beforeNum)) {
        candidateUids = allUids.filter((u) => Number(u) < beforeNum);
      }
    }
    const target = candidateUids.slice(-limit);
    let synced = 0;
    let failed = 0;
    const newMessages = [];
    if (target.length > 0) {
      for await (const msg of client.fetch(target.join(','), { envelope: true, flags: true }, { uid: true })) {
        try {
          // Yakın zamanda silinen mesajları yeniden ekleme
          if (skipUid && skipUid(msg.uid)) continue;

          const env = msg.envelope || {};
          const isSeen = !!(msg.flags && msg.flags.has('\\Seen'));
          const isNew = !checkExists.get(email, folderPath, String(msg.uid));

          upsertMsg.run(
            email,
            folderPath,
            String(msg.uid),
            env.subject || '(konusuz)',
            addrToString(env.from),
            addrToString(env.to),
            env.date ? new Date(env.date).toISOString() : null,
            '',
            isSeen ? 1 : 0,
          );
          synced++;

          if (isNew && !isSeen) {
            newMessages.push({
              uid: String(msg.uid),
              subject: env.subject || '(konusuz)',
              from: addrToString(env.from),
              date: env.date ? new Date(env.date).toISOString() : null,
            });
          }
        } catch {
          failed++;
        }
      }
    }
    console.log(`[sync] ${email} [${folderPath}]: kutuda=${total} hedef=${target.length} çekilen=${synced} yeni=${newMessages.length} hatalı=${failed}`);
    return { total, synced, failed, newMessages };
  });
}

async function syncInbox({ provider, email, accessToken, password, imapHost, imapPort, db, limit = 30 }) {
  return syncFolder({ provider, email, accessToken, password, imapHost, imapPort, folderPath: 'INBOX', db, limit });
}

function createTransporter({ provider, email, accessToken, password, smtpHost, smtpPort, smtpSecure }) {
  if (password && smtpHost && smtpPort) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: !!smtpSecure,
      auth: { user: email, pass: password },
    });
  }
  if (provider === 'google') {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { type: 'OAuth2', user: email, accessToken },
    });
  }
  if (provider === 'microsoft') {
    return nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { type: 'OAuth2', user: email, accessToken },
    });
  }
  return nodemailer.createTransport({
    host: 'smtp.mail.yahoo.com',
    port: 465,
    secure: true,
    auth: { type: 'OAuth2', user: email, accessToken },
  });
}

// Ek indirme: ileti yeniden ayrıştırılıp istenen indisteki ek döndürülür.
// Büyük eklerde sunucu bağlantıyı düşürebilir (ECONNRESET): bir kez yeniden dener.
async function fetchAttachment(args, attempt = 1) {
  const { provider, email, accessToken, password, imapHost, imapPort, folderPath = 'INBOX', uid, index } = args;
  try {
    return await withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
      const lock = await client.getMailboxLock(folderPath, { readOnly: true });
      try {
        const meta = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!meta?.source) throw new Error('Ham ileti alınamadı.');
        const parsed = await simpleParser(meta.source);
        const att = (parsed.attachments || [])[Number(index)];
        if (!att) throw new Error('Ek bulunamadı.');
        return {
          filename: att.filename || `ek-${Number(index) + 1}.bin`,
          contentType: att.contentType || 'application/octet-stream',
          content: att.content,
        };
      } finally {
        lock.release();
      }
    });
  } catch (e) {
    // Geçici bağlantı kopmalarında (ECONNRESET vb.) bir kez yeniden dene
    const transient = /ECONNRESET|ETIMEDOUT|EPIPE|socket|timeout|Timeout/i.test(e?.message || '');
    if (transient && attempt < 2) {
      console.log(`[attach] uid=${uid} tekrar deneniyor (${e?.message})`);
      return fetchAttachment(args, attempt + 1);
    }
    throw e;
  }
}
async function buildRaw({ from, to, cc, subject, text, html, inReplyTo, references, attachments }) {
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await stream.sendMail({
    from,
    to,
    cc: cc?.length ? cc : undefined,
    subject,
    text,
    html: html || undefined,
    inReplyTo,
    references,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.dataBase64, 'base64'),
      contentType: a.contentType || 'application/octet-stream',
    })),
  });
  return info.message; // Buffer
}

async function sendRaw(transporter, raw, envelope) {
  // raw ile gönderimde alıcılar zarftan okunamaz; envelope açıkça verilmeli.
  return transporter.sendMail({ envelope, raw });
}

async function findTrashPath(client) {
  // \Trash bayrağını taşıyan klasörü bul (Gmail: [Gmail]/Trash, Outlook: Deleted Items, vb.)
  try {
    const tree = await client.listTree();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.flags && n.flags.has('\\Trash')) return n.path;
        if (n.folders) {
          const sub = walk(n.folders);
          if (sub) return sub;
        }
      }
      return null;
    };
    const found = walk(tree?.folders || tree);
    if (found) return found;
  } catch { /* yoksay, aday listeye düş */ }
  return null;
}

async function findSentPath(client) {
  try {
    const tree = await client.listTree();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.flags && n.flags.has('\\Sent')) return n.path;
        const sub = walk(n.folders);
        if (sub) return sub;
      }
      return null;
    };
    const found = walk(tree?.folders || tree);
    if (found) return found;
  } catch { /* yoksay, aday listeye düş */ }
  return null;
}

async function findArchivePath(client) {
  try {
    const tree = await client.listTree();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.flags && (n.flags.has('\\Archive') || n.flags.has('\\All'))) return n.path;
        if (n.folders) {
          const sub = walk(n.folders);
          if (sub) return sub;
        }
      }
      return null;
    };
    const found = walk(tree?.folders || tree);
    if (found) return found;
  } catch { /* yoksay */ }
  return null;
}

async function appendToSent({ provider, email, accessToken, password, imapHost, imapPort, raw }) {
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    const detected = await findSentPath(client);
    const candidates = [detected, 'Sent', 'Sent Items', '[Gmail]/Sent Mail', 'INBOX.Sent', 'Gönderilmiş'].filter(Boolean);
    for (const path of new Set(candidates)) {
      try {
        await client.append(path, raw, ['\\Seen']);
        return path;
      } catch { /* sonraki aday */ }
    }
    return null;
  });
}
async function verifyImap({ host, port, email, password }) {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    logger: false,
    auth: { user: email, pass: password },
  });
  await client.connect();
  try {
    await client.mailboxOpen('INBOX', { readOnly: true });
    return true;
  } finally {
    await client.logout();
  }
}

async function listFolders({ provider, email, accessToken, password, imapHost, imapPort }) {
  // IMAP sunucusundaki tüm klasörleri listeler (özel bayraklarla: Sent/Trash/Drafts/Junk)
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    const tree = await client.listTree();
    const flatten = (rootNodes) => {
      const out = [];
      const walk = (nodes) => {
        for (const n of nodes || []) {
          const flags = n.flags ? [...n.flags] : [];
          if (n.specialUse && !flags.includes(n.specialUse)) {
            flags.push(n.specialUse);
          }
          out.push({
            path: n.path,
            name: n.name || n.path,
            flags,
            delimiter: n.delimiter || '/',
          });
          if (n.folders) walk(n.folders);
        }
      };
      walk(rootNodes?.folders || rootNodes);
      return out;
    };
    return flatten(tree);
  });
}

// email -> detected trash folder path önbelleği (her silme işleminde listTree() çalıştırmamak için)
const _trashPathCache = new Map();

async function moveToTrash({ provider, email, accessToken, password, imapHost, imapPort, folderPath, uid, subject, messageId }) {
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum) || uidNum <= 0) {
    console.warn('[moveToTrash] gecersiz uid:', uid);
    return false;
  }

  const isLikelyTrash = /trash|çöp|deleted|bin/i.test(folderPath);

  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    await client.mailboxOpen(folderPath, { readOnly: false });

    const isAlreadyInTrash = isLikelyTrash || (client.mailbox?.flags && client.mailbox.flags.has('\\Trash'));

    if (isAlreadyInTrash) {
      console.log(`[delete] uid=${uidNum} zaten çöp kutusunda (${folderPath}), sunucudan kalıcı olarak expunge ediliyor...`);
      let targetUid = uidNum;

      let found = false;
      try {
        const check = await client.search({ uid: String(uidNum) }, { uid: true });
        if (check && check.length > 0) found = true;
      } catch {}

      if (!found && (messageId || subject)) {
        console.warn(`[delete] uid=${uidNum} çöp kutusunda doğrudan bulunamadı, alternatif arama yapılıyor...`);
        try {
          if (messageId) {
            const mHits = await client.search({ header: { 'message-id': messageId } }, { uid: true }) || [];
            if (mHits.length > 0) {
              targetUid = mHits[0];
              found = true;
            }
          }
          if (!found && subject && subject !== '(konusuz)') {
            const sHits = await client.search({ header: { 'subject': subject } }, { uid: true }) || [];
            if (sHits.length > 0) {
              targetUid = sHits[0];
              found = true;
            }
          }
        } catch (searchErr) {
          console.warn(`[delete] alternatif arama hatası:`, searchErr?.message);
        }
      }

      console.log(`[delete] IMAP üzerinden expunge edilecek UID: ${targetUid}`);
      try {
        await client.messageFlagsAdd(String(targetUid), ['\\Deleted'], { uid: true });
        await client.messageDelete(String(targetUid), { uid: true });
      } catch (delErr) {
        console.warn(`[delete] messageDelete uyarısı (${delErr.message}), alternatif EXPUNGE deneniyor...`);
        try { await client.run('EXPUNGE'); } catch {}
      }
      try { await client.mailboxClose(); } catch {}
      console.log(`[delete] uid=${targetUid} (istenen=${uidNum}) sunucudan kalıcı olarak silindi (basari).`);
      return { success: true, permanent: true, realUid: String(targetUid) };
    }

    let detected = _trashPathCache.get(email);
    if (!detected) {
      detected = await findTrashPath(client);
      if (detected) _trashPathCache.set(email, detected);
    }

    const candidates = [];
    if (detected) candidates.push(detected);
    if (provider === 'google') {
      candidates.push('[Gmail]/Çöp kutusu', '[Gmail]/Trash', '[Gmail]/Bin');
    } else if (provider === 'microsoft') {
      candidates.push('Deleted Items', 'Deleted Messages', 'Trash');
    } else {
      candidates.push('Trash', 'INBOX.Trash', 'Deleted Items', 'Deleted Messages');
    }

    for (const dest of new Set(candidates)) {
      if (dest.toLowerCase() === folderPath.toLowerCase()) continue;
      try {
        const moveRes = await client.messageMove(String(uidNum), dest, { uid: true });
        _trashPathCache.set(email, dest);
        let destUid = null;
        if (moveRes && moveRes.uidMap && typeof moveRes.uidMap.get === 'function') {
          destUid = moveRes.uidMap.get(uidNum);
        }
        console.log(`[moveToTrash] uid=${uidNum} → "${dest}" (basari, destUid=${destUid})`);
        return { success: true, permanent: false, dest, destUid: destUid ? String(destUid) : null };
      } catch (e) {
        console.warn(`[moveToTrash] "${dest}" denendi, hata: ${e.message}`);
      }
    }

    console.warn(`[moveToTrash] Çöp klasörüne taşınamadı, doğrudan siliniyor: uid=${uidNum}`);
    await client.messageFlagsAdd(String(uidNum), ['\\Deleted'], { uid: true });
    await client.messageDelete(String(uidNum), { uid: true });
    try { await client.mailboxClose(); } catch {}
    return { success: true, permanent: true };
  }).catch((e) => {
    console.error('[moveToTrash] hata:', e.message);
    return false;
  });
}

async function batchMoveToTrash({ provider, email, accessToken, password, imapHost, imapPort, folderPath, uids }) {
  if (!Array.isArray(uids) || uids.length === 0) return { success: true, count: 0 };
  const validUids = uids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (validUids.length === 0) return { success: false, count: 0 };

  const isLikelyTrash = /trash|çöp|deleted|bin/i.test(folderPath);
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    await client.mailboxOpen(folderPath, { readOnly: false });
    const isAlreadyInTrash = isLikelyTrash || (client.mailbox?.flags && client.mailbox.flags.has('\\Trash'));
    const range = validUids.join(',');

    if (isAlreadyInTrash) {
      try {
        await client.messageFlagsAdd(range, ['\\Deleted'], { uid: true });
        await client.messageDelete(range, { uid: true });
      } catch {
        try { await client.run('EXPUNGE'); } catch {}
      }
      try { await client.mailboxClose(); } catch {}
      console.log(`[batchMoveToTrash] ${validUids.length} ileti sunucudan kalıcı olarak silindi.`);
      return { success: true, permanent: true, count: validUids.length };
    }

    let detected = _trashPathCache.get(email);
    if (!detected) {
      detected = await findTrashPath(client);
      if (detected) _trashPathCache.set(email, detected);
    }

    const candidates = [];
    if (detected) candidates.push(detected);
    if (provider === 'google') {
      candidates.push('[Gmail]/Çöp kutusu', '[Gmail]/Trash', '[Gmail]/Bin');
    } else if (provider === 'microsoft') {
      candidates.push('Deleted Items', 'Deleted Messages', 'Trash');
    } else {
      candidates.push('Trash', 'INBOX.Trash', 'Deleted Items', 'Deleted Messages');
    }

    for (const dest of new Set(candidates)) {
      if (dest.toLowerCase() === folderPath.toLowerCase()) continue;
      try {
        const moveRes = await client.messageMove(range, dest, { uid: true });
        _trashPathCache.set(email, dest);
        const uidMap = {};
        if (moveRes && moveRes.uidMap && typeof moveRes.uidMap.forEach === 'function') {
          moveRes.uidMap.forEach((newUid, oldUid) => {
            uidMap[String(oldUid)] = String(newUid);
          });
        }
        console.log(`[batchMoveToTrash] ${validUids.length} ileti → "${dest}" taşındı.`);
        return { success: true, permanent: false, dest, count: validUids.length, uidMap };
      } catch (e) {
        console.warn(`[batchMoveToTrash] "${dest}" denendi, hata: ${e.message}`);
      }
    }

    await client.messageFlagsAdd(range, ['\\Deleted'], { uid: true });
    await client.messageDelete(range, { uid: true });
    try { await client.mailboxClose(); } catch {}
    return { success: true, permanent: true, count: validUids.length };
  }).catch((e) => {
    console.error('[batchMoveToTrash] hata:', e.message);
    return { success: false, error: e.message };
  });
}

async function batchMarkSeen({ provider, email, accessToken, password, imapHost, imapPort, folderPath, uids, isSeen = true }) {
  if (!Array.isArray(uids) || uids.length === 0) return true;
  const range = uids.map(String).join(',');
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    await client.mailboxOpen(folderPath, { readOnly: false });
    if (isSeen) {
      await client.messageFlagsAdd(range, ['\\Seen'], { uid: true });
    } else {
      await client.messageFlagsRemove(range, ['\\Seen'], { uid: true });
    }
    return true;
  });
}

async function batchToggleFlag({ provider, email, accessToken, password, imapHost, imapPort, folderPath, uids, isFlagged = true }) {
  if (!Array.isArray(uids) || uids.length === 0) return true;
  const range = uids.map(String).join(',');
  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    await client.mailboxOpen(folderPath, { readOnly: false });
    if (isFlagged) {
      await client.messageFlagsAdd(range, ['\\Flagged'], { uid: true });
    } else {
      await client.messageFlagsRemove(range, ['\\Flagged'], { uid: true });
    }
    return true;
  });
}

async function moveToFolder({ provider, email, accessToken, password, imapHost, imapPort, fromFolder, toFolder, uid }) {
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum) || uidNum <= 0) {
    console.warn('[moveToFolder] gecersiz uid:', uid);
    return false;
  }
  if (!fromFolder || !toFolder || fromFolder.toLowerCase() === toFolder.toLowerCase()) {
    return true;
  }

  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    try {
      await client.mailboxOpen(fromFolder, { readOnly: false });
      const moveRes = await client.messageMove(String(uidNum), toFolder, { uid: true });
      let destUid = null;
      if (moveRes && moveRes.uidMap && typeof moveRes.uidMap.get === 'function') {
        destUid = moveRes.uidMap.get(uidNum);
      }
      try { await client.mailboxClose(); } catch {}
      return { success: true, fromFolder, toFolder, destUid: destUid ? String(destUid) : null };
    } catch (e) {
      console.error(`[moveToFolder] hata (${fromFolder} -> ${toFolder}):`, e.message);
      return false;
    }
  });
}

async function batchMoveToFolder({ provider, email, accessToken, password, imapHost, imapPort, fromFolder, toFolder, uids }) {
  if (!Array.isArray(uids) || uids.length === 0) return { success: true, count: 0 };
  const validUids = uids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (validUids.length === 0) return { success: true, count: 0 };
  if (!fromFolder || !toFolder || fromFolder.toLowerCase() === toFolder.toLowerCase()) {
    return { success: true, count: validUids.length };
  }

  return withClient({ provider, email, accessToken, password, imapHost, imapPort }, async (client) => {
    try {
      await client.mailboxOpen(fromFolder, { readOnly: false });
      const range = validUids.join(',');
      const moveRes = await client.messageMove(range, toFolder, { uid: true });
      const uidMap = {};
      if (moveRes && moveRes.uidMap && typeof moveRes.uidMap.forEach === 'function') {
        moveRes.uidMap.forEach((newUid, oldUid) => {
          uidMap[String(oldUid)] = String(newUid);
        });
      }
      try { await client.mailboxClose(); } catch {}
      return { success: true, count: validUids.length, fromFolder, toFolder, uidMap };
    } catch (e) {
      console.error(`[batchMoveToFolder] hata (${fromFolder} -> ${toFolder}):`, e.message);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { refreshAccessToken, emailFromIdToken, fetchProfileEmail, syncInbox, syncFolder, fetchBody, fetchAttachment, markSeen, markUnseen, createTransporter, buildRaw, sendRaw, appendToSent, verifyImap, listFolders, moveToTrash, batchMoveToTrash, batchMarkSeen, batchToggleFlag, findArchivePath, moveToFolder, batchMoveToFolder, openClient, withClient, invalidateClient };
