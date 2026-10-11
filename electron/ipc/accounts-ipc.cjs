// electron/ipc/accounts-ipc.cjs - alan isleyicileri (ipc.cjs'ten bolundu).
// Bu dosyayi elle degistirmek yerine: yeni kanal eklerken ayni alana
// yazip `npm test` calistirin - ipc.test.ts kanal sozlesmesini,
// ipc-static.test.ts import/kullanim tutarligini dogrular.

const { ipcMain } = require('electron');
const { getDb, listAccounts, getAccountById, getAccountByEmail, updateAccount, deleteAccount, addAccount } = require('../db.cjs');
const { emailFromIdToken, fetchProfileEmail, createTransporter, verifyImap, listFolders, withClient, isAuthFailed } = require('../mail.cjs');
const { enc, dec, withAuthRetry } = require('../token-auth.cjs');
const { startOAuthFlow } = require('../auth.cjs');
const { friendlySyncError } = require('../ipc-helpers.cjs');

function register(_deps) {

ipcMain.handle('accounts:list', () => listAccounts());

ipcMain.handle('auth:start', async (_evt, provider) => {
  const tokens = await startOAuthFlow(provider);
  // E-posta: önce id_token'dan (her zaman elimizde), olmazsa profil API'sinden.
  let profile = emailFromIdToken(tokens.id_token);
  if (!profile.email) {
    profile = await fetchProfileEmail(provider, tokens.access_token).catch(() => ({ email: null, name: null }));
  }
  if (!profile.email) {
    throw new Error('E-posta adresi profilden alınamadı. Lütfen sağlayıcı izinlerini onaylayarak tekrar deneyin.');
  }
  const expiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  const saved = {
    provider,
    email: profile.email,
    displayName: profile.name,
    refreshTokenEnc: enc(tokens.refresh_token),
    accessTokenEnc: enc(tokens.access_token),
    tokenExpiry: expiry,
  };
  addAccount(saved);

  // IMAP bağlantısını test et ve klasörleri önceden çek (kullanıcıyı ana ekranda bekletmemek için)
  try {
    console.log(`[auth:start] ${profile.email} (${provider}) için IMAP bağlantısı doğrulanıyor...`);
    const folders = await listFolders({
      provider,
      email: profile.email,
      accessToken: tokens.access_token,
    });
    if (folders && folders.length > 0) {
      const db = getDb();
      const upsert = db.prepare(`
        INSERT INTO folders (account_id, name, path, flags, unread_count)
        VALUES ((SELECT id FROM accounts WHERE email=? COLLATE NOCASE), ?, ?, ?, 0)
        ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, flags=excluded.flags
      `);
      for (const f of folders) {
        upsert.run(profile.email, f.name || f.path, f.path, JSON.stringify(f.flags || []));
      }
      console.log(`[auth:start] ${profile.email} için ${folders.length} klasör başarıyla önbelleğe alındı.`);
    }
  } catch (testErr) {
    console.warn(`[auth:start] ${profile.email} IMAP ilk bağlantı uyarısı:`, testErr?.message || testErr);
    if (isAuthFailed(testErr)) {
      // Hatalı/erişilemeyen hesabın veritabanında hayalet kayıt bırakmasını önle
      try {
        const added = getAccountByEmail(profile.email);
        if (added?.id) deleteAccount(added.id);
      } catch {}
      throw new Error(
        `Giriş yapıldı fakat ${provider === 'google' ? 'Gmail' : provider} IMAP erişimini reddetti.\n\n` +
        (provider === 'google'
          ? 'Lütfen giriş yaparken "Tüm e-postalarınızı okuma/yönetme" kutusunu işaretlediğinizden ve Gmail Ayarları → Yönlendirme ve POP/IMAP sekmesinde "IMAP\'i etkinleştir" seçeneğinin açık olduğundan emin olun.'
          : friendlySyncError(provider, testErr))
      );
    }
  }

  return saved;
});

ipcMain.handle('accounts:add', (_evt, acc) => addAccount(acc));

ipcMain.handle('accounts:get', async (_evt, id) => {
  const acc = getAccountById(id);
  if (!acc) return null;
  const { password_enc: _p, access_token_enc: _a, refresh_token_enc: _r, ...safe } = acc;
  return safe;
});

ipcMain.handle('accounts:update', async (_evt, id, updates) => {
  const acc = getAccountById(id);
  if (!acc) throw new Error('Hesap bulunamadı.');
  const dbUpdates = {
    displayName: updates.displayName,
    imapHost: updates.imapHost,
    imapPort: updates.imapPort,
    smtpHost: updates.smtpHost,
    smtpPort: updates.smtpPort,
    smtpSecure: updates.smtpSecure,
  };
  if (updates.password && updates.password.trim()) {
    dbUpdates.passwordEnc = enc(updates.password.trim());
  }
  updateAccount(id, dbUpdates);
  return true;
});

ipcMain.handle('accounts:delete', async (_evt, id) => {
  deleteAccount(id);
  return true;
});

// Bağlantı Testi — mevcut kaydedilmiş veya formda düzenlenen hesap kimlik bilgilerini doğrular
ipcMain.handle('accounts:test-connection', async (_evt, { accountId, ...overrides }) => {
  const acc = getAccountById(accountId);
  if (!acc) throw new Error('Hesap bulunamadı.');

  const result = { imap: null, smtp: null };

  try {
    if (acc.auth_type === 'password') {
      let password = (overrides && overrides.password && overrides.password.trim()) ? overrides.password.trim() : null;
      if (!password && acc.password_enc) {
        password = dec(acc.password_enc);
      }
      if (!password) {
        const fullAcc = getAccountByEmail(acc.email);
        if (fullAcc?.password_enc) {
          password = dec(fullAcc.password_enc);
        }
      }
      if (!password) {
        throw new Error('Kayıtlı şifre bulunamadı. Lütfen şifre alanına şifrenizi girerek tekrar test edin.');
      }

      const imapHost = (overrides && overrides.imapHost) ? overrides.imapHost.trim() : acc.imap_host;
      const imapPort = (overrides && overrides.imapPort) ? Number(overrides.imapPort) : Number(acc.imap_port || 993);
      const smtpHost = (overrides && overrides.smtpHost) ? overrides.smtpHost.trim() : acc.smtp_host;
      const smtpPort = (overrides && overrides.smtpPort) ? Number(overrides.smtpPort) : Number(acc.smtp_port || 465);
      const smtpSecure = (overrides && overrides.smtpSecure !== undefined)
        ? Boolean(overrides.smtpSecure)
        : (acc.smtp_secure !== 0);

      // IMAP Testi
      try {
        await verifyImap({ host: imapHost, port: imapPort, email: acc.email, password });
        result.imap = { ok: true };
      } catch (imapErr) {
        result.imap = { ok: false, error: imapErr.message || String(imapErr) };
      }

      // SMTP Testi
      if (smtpHost && smtpPort) {
        try {
          const transporter = createTransporter({
            provider: acc.provider,
            email: acc.email,
            password,
            smtpHost,
            smtpPort,
            smtpSecure,
          });
          await transporter.verify();
          result.smtp = { ok: true };
        } catch (smtpErr) {
          result.smtp = { ok: false, error: smtpErr.message || String(smtpErr) };
        }
      } else {
        result.smtp = { ok: false, error: 'SMTP sunucusu veya portu belirtilmemiş.' };
      }
    } else {
      // OAuth hesap — IMAP bağlantısını withClient ile test et (ölü tokenda otomatik yenileme dahil)
      await withAuthRetry(acc, async (creds) => {
        if (!creds.accessToken) throw new Error('OAuth erişim anahtarı alınamadı.');
        await withClient({ provider: acc.provider, email: acc.email, accessToken: creds.accessToken }, async (client) => {
          await client.mailboxOpen('INBOX', { readOnly: true });
        });
      });
      result.imap = { ok: true };
      result.smtp = { ok: true, note: 'OAuth bağlantısı IMAP ile doğrulandı.' };
    }
  } catch (err) {
    result.imap = result.imap || { ok: false, error: friendlySyncError(acc.provider, err) };
  }

  return result;
});

ipcMain.handle('accounts:add-manual', async (_evt, { email, password, imap, smtp }) => {
  if (!email || !password) throw new Error('E-posta ve şifre gerekli.');
  // Kaydetmeden önce bağlantıyı doğrula (anında hata bildirimi)
  await verifyImap({ host: imap.host, port: imap.port, email, password });
  return addAccount({
    provider: 'imap',
    email,
    authType: 'password',
    imapHost: imap.host,
    imapPort: imap.port,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    smtpSecure: smtp.secure,
    passwordEnc: enc(password),
  });
});

}

module.exports = { register };
