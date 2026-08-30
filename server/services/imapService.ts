import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { Account, Email, Attachment } from '../types.js';
import { saveEmail, saveEmailWithStatus, getAccounts, getAccountById, getEmailById, isDeletedLocally, registerServerFolder, pruneMissingServerUids, updateEmailFlags, syncFolderReadFlags, saveEmailsBatch, updateEmailBody, getEmailMaxUid } from './db.js';
import { OAuthService } from './oauthService.js';
import { v4 as uuidv4 } from 'uuid';
import dns from 'dns';
import { promisify } from 'util';
import { APP_VERSION } from '../version.js';

const resolveMxAsync = promisify(dns.resolveMx);

export interface MailboxState {
  uidValidity?: bigint | number;
  highestKnownUid: number;
  uidNext?: number;
  exists?: number;
  lastSyncedAt: number;
}

export class ImapService {
  private static clientPool = new Map<string, { client: ImapFlow; lastUsed: number }>();
  private static mailboxStates = new Map<string, MailboxState>();
  private static mailboxListCache = new Map<string, { mailboxes: any[]; cachedAt: number }>();

  public static async getOrCreateClient(account: Account): Promise<ImapFlow> {
    const pooled = this.clientPool.get(account.id);
    if (pooled && pooled.client && pooled.client.authenticated && pooled.client.usable) {
      pooled.lastUsed = Date.now();
      return pooled.client;
    }

    if (pooled) {
      try {
        await pooled.client.logout().catch(() => {});
      } catch {}
      this.clientPool.delete(account.id);
    }

    const client = await this.connectClient(account);
    this.clientPool.set(account.id, { client, lastUsed: Date.now() });

    client.on('error', () => {
      this.clientPool.delete(account.id);
    });

    client.on('close', () => {
      const cur = this.clientPool.get(account.id);
      if (cur && cur.client === client) {
        this.clientPool.delete(account.id);
      }
    });

    return client;
  }

  public static async closeAccountClient(accountId: string) {
    const pooled = this.clientPool.get(accountId);
    if (pooled) {
      this.clientPool.delete(accountId);
      try {
        await pooled.client.logout().catch(() => {});
      } catch {}
    }
  }

  public static clearAccountCache(accountId: string) {
    this.mailboxListCache.delete(accountId);
    for (const key of this.mailboxStates.keys()) {
      if (key.startsWith(`${accountId}:::`)) {
        this.mailboxStates.delete(key);
      }
    }
    this.closeAccountClient(accountId);
  }

  public static async connectClient(account: Account): Promise<ImapFlow> {
    if (account.authType === 'oauth2') {
      const accessToken = await OAuthService.refreshGoogleToken(account);
      const client = new ImapFlow({
        host: account.imapHost || 'imap.gmail.com',
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: {
          user: account.email,
          accessToken,
        },
        tls: {
          rejectUnauthorized: false,
          servername: account.imapHost || 'imap.gmail.com',
        },
        clientInfo: {
          name: 'Postaci Mail Client',
          version: APP_VERSION,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        logger: false,
        emitLogs: false,
      });
      client.on('error', (err) => {
        console.warn(`[IMAP Socket Error - ${account.email}]:`, err?.message || err);
      });
      await client.connect();
      return client;
    }

    const email = account.email || '';
    const password = account.imapPassword || (account as any).password || '';
    if (!account.imapHost || (!account.imapUser && !email) || !password) {
      throw new Error('IMAP yapılandırma bilgileri eksik (Sunucu, Kullanıcı Adı veya Şifre)');
    }

    const configuredUser = account.imapUser || email;
    const configuredPort = account.imapPort || (account.imapSecure === false ? 143 : 993);
    const configuredSecure = account.imapSecure !== undefined ? account.imapSecure : (configuredPort === 993);

    // 1. Direct Attempt: Always try the exact configured settings first with fast timeout
    try {
      const directClient = new ImapFlow({
        host: account.imapHost,
        port: configuredPort,
        secure: configuredSecure,
        auth: {
          user: configuredUser,
          pass: password,
        },
        tls: {
          rejectUnauthorized: false,
          servername: account.imapHost,
        },
        clientInfo: {
          name: 'Postaci',
          version: APP_VERSION,
          vendor: 'Postaci Mail Client',
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 25000,
        logger: false,
        emitLogs: false,
      });
      directClient.on('error', (err) => {
        console.warn(`[IMAP Direct Socket Error - ${email}]:`, err?.message || err);
      });

      await directClient.connect();
      return directClient;
    } catch (directErr: any) {
      console.warn(`Direct IMAP connect failed for ${email} (${configuredUser}@${account.imapHost}:${configuredPort}), trying fallback:`, directErr.message || directErr);
    }

    // 2. Smart Fast Fallback
    const userCandidates = Array.from(new Set([
      configuredUser,
      email,
      email.includes('@') ? email.split('@')[0] : ''
    ])).filter(Boolean);

    const portCandidates = [
      { port: configuredPort, secure: configuredSecure },
      { port: 993, secure: true },
      { port: 143, secure: false },
    ].filter((v, i, a) => a.findIndex(t => t.port === v.port && t.secure === v.secure) === i);

    let lastError: any = null;

    for (const u of userCandidates) {
      for (const p of portCandidates) {
        if (u === configuredUser && p.port === configuredPort && p.secure === configuredSecure) {
          continue; // Already tried
        }
        try {
          const client = new ImapFlow({
            host: account.imapHost,
            port: p.port,
            secure: p.secure,
            auth: {
              user: u,
              pass: password,
            },
            tls: {
              rejectUnauthorized: false,
              servername: account.imapHost,
            },
            clientInfo: {
              name: 'Postaci',
              version: APP_VERSION,
              vendor: 'Postaci Mail Client',
            },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 20000,
            logger: false,
            emitLogs: false,
          });
          client.on('error', (err) => {
            console.warn(`[IMAP Fallback Socket Error - ${email}]:`, err?.message || err);
          });

          await client.connect();
          return client;
        } catch (err: any) {
          lastError = err;
        }
      }
    }

    throw lastError || new Error(`IMAP sunucusuna (${account.imapHost}) bağlanılamadı.`);
  }

  public static async testConnection(account: Partial<Account>): Promise<{
    success: boolean;
    message: string;
    folders?: string[];
    suggestedImapHost?: string;
    suggestedImapUser?: string;
    suggestedImapPort?: number;
    suggestedImapSecure?: boolean;
  }> {
    if (account.provider === 'demo') {
      return { success: true, message: 'Demo hesabı bağlantısı başarılı!', folders: ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE', 'SPAM'] };
    }

    const email = (account.email || '').trim();
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const domain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';

    const rawHost = (account.imapHost || '').trim();
    const pass = account.imapPassword || '';
    const configuredUser = (account.imapUser || email).trim();

    if (!rawHost || !configuredUser || !pass) {
      return { success: false, message: 'Lütfen tüm IMAP alanlarını doldurun (Sunucu, Port, Kullanıcı, Şifre).' };
    }

    // Clean host string: strip protocols, ports, slashes, whitespace
    const cleanHost = rawHost
      .replace(/^(https?:\/\/|imaps?:\/\/|smtps?:\/\/|ssl:\/\/|tls:\/\/)/i, '')
      .replace(/\/.*$/, '')
      .trim();

    let extractedPort: number | undefined;
    let baseHost = cleanHost;
    if (cleanHost.includes(':')) {
      const parts = cleanHost.split(':');
      baseHost = parts[0];
      const parsedP = parseInt(parts[1], 10);
      if (!isNaN(parsedP)) extractedPort = parsedP;
    }

    const requestedPort = extractedPort || account.imapPort || 993;
    const requestedSecure = account.imapSecure !== undefined ? account.imapSecure : (requestedPort === 143 ? false : true);

    const isGoogle = domain === 'gmail.com' || domain === 'googlemail.com' || baseHost.includes('gmail.com');
    const isMicrosoft = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com'].includes(domain) || baseHost.includes('outlook.com') || baseHost.includes('office365.com');
    const isYahoo = domain.includes('yahoo') || domain.includes('ymail');
    const isApple = domain.includes('icloud.com') || domain.includes('me.com') || domain.includes('mac.com');

    const attemptConnect = async (host: string, port: number, secure: boolean, user: string, timeoutMs = 3500) => {
      const client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: false,
          servername: host,
        },
        logger: false,
        emitLogs: false,
      });
      client.on('error', (err) => {
        // Suppress unhandled error event during test probe
      });

      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          client.close();
          reject(new Error(`ETIMEDOUT: ${host}:${port} bağlantısı ${timeoutMs}ms içinde yanıt vermedi.`));
        }, timeoutMs);
      });

      try {
        await Promise.race([client.connect(), timeoutPromise]);
        if (timer) clearTimeout(timer);
        const mailboxes = await client.list();
        const folders = mailboxes.map(mb => mb.path);
        await client.logout().catch(() => {});
        return { ok: true as const, folders };
      } catch (err: any) {
        if (timer) clearTimeout(timer);
        await client.logout().catch(() => {});
        return { ok: false as const, error: err };
      }
    };

    // 1. PRIMARY FAST ATTEMPT: Test user's exact configured host, port, user
    const primaryRes = await attemptConnect(baseHost, requestedPort, requestedSecure, configuredUser, 3500);
    if (primaryRes.ok) {
      return {
        success: true,
        message: `IMAP (${requestedSecure ? 'SSL/TLS' : 'STARTTLS'}, Port ${requestedPort}, Sunucu: ${baseHost}) başarıyla doğrulandı!`,
        folders: primaryRes.folders,
        suggestedImapHost: baseHost,
        suggestedImapUser: configuredUser,
        suggestedImapPort: requestedPort,
        suggestedImapSecure: requestedSecure,
      };
    }

    let lastErrorMsg = primaryRes.error?.message || String(primaryRes.error);

    // 2. If failure is due to username format, try prefix candidate
    if ((lastErrorMsg.includes('AUTHENTICATION') || lastErrorMsg.includes('Invalid credentials') || lastErrorMsg.includes('535')) && prefix && prefix !== configuredUser) {
      const userRes = await attemptConnect(baseHost, requestedPort, requestedSecure, prefix, 3000);
      if (userRes.ok) {
        return {
          success: true,
          message: `IMAP (${requestedSecure ? 'SSL/TLS' : 'STARTTLS'}, Port ${requestedPort}, Kullanıcı: ${prefix}) başarıyla doğrulandı!`,
          folders: userRes.folders,
          suggestedImapHost: baseHost,
          suggestedImapUser: prefix,
          suggestedImapPort: requestedPort,
          suggestedImapSecure: requestedSecure,
        };
      }
    }

    // 3. If primary port failed (connection refused/timeout), try alternative standard port (993 SSL vs 143 STARTTLS)
    const altPort = requestedPort === 993 ? 143 : 993;
    const altSecure = altPort === 993;
    if (!lastErrorMsg.includes('AUTHENTICATION') && !lastErrorMsg.includes('Invalid credentials')) {
      const portRes = await attemptConnect(baseHost, altPort, altSecure, configuredUser, 2500);
      if (portRes.ok) {
        return {
          success: true,
          message: `IMAP (${altSecure ? 'SSL/TLS' : 'STARTTLS'}, Port ${altPort}, Sunucu: ${baseHost}) başarıyla doğrulandı!`,
          folders: portRes.folders,
          suggestedImapHost: baseHost,
          suggestedImapUser: configuredUser,
          suggestedImapPort: altPort,
          suggestedImapSecure: altSecure,
        };
      }
    }

    // 4. If DNS failed (ENOTFOUND), try top 2 candidate hosts with fast 2500ms timeout
    if (lastErrorMsg.includes('ENOTFOUND') || lastErrorMsg.includes('getaddrinfo')) {
      const candidateHosts: string[] = [];
      if (domain) {
        if (`mail.${domain}` !== baseHost) candidateHosts.push(`mail.${domain}`);
        if (`imap.${domain}` !== baseHost) candidateHosts.push(`imap.${domain}`);
      }

      for (const candHost of candidateHosts) {
        const candRes = await attemptConnect(candHost, 993, true, configuredUser, 2500);
        if (candRes.ok) {
          return {
            success: true,
            message: `IMAP (SSL/TLS, Port 993, Sunucu: ${candHost}) başarıyla doğrulandı!`,
            folders: candRes.folders,
            suggestedImapHost: candHost,
            suggestedImapUser: configuredUser,
            suggestedImapPort: 993,
            suggestedImapSecure: true,
          };
        }
      }
    }

    // User-friendly Turkish explanation
    let helpfulMsg = lastErrorMsg;
    if (isGoogle) {
      helpfulMsg = 'Google (Gmail) güvenliği nedeniyle standart hesap şifrenizi kabul etmez. Lütfen Google Güvenlik sayfasından 16 haneli "Uygulama Şifresi" (App Password) oluşturup buraya yapıştırın veya Google ile Giriş yapın.';
    } else if (isMicrosoft) {
      helpfulMsg = 'Microsoft (Outlook/Hotmail) standart şifreli IMAP girişlerini kapattı. Lütfen Microsoft Hesap Güvenliğinden "Uygulama Parolası" oluşturup giriniz.';
    } else if (isYahoo) {
      helpfulMsg = 'Yahoo Mail standart şifreleri engellemektedir. Lütfen Yahoo Hesap Güvenliğinden "Uygulama Şifresi" oluşturun.';
    } else if (isApple) {
      helpfulMsg = 'Apple iCloud yalnızca "Uygulamaya Özgü Parola" kabul eder. appleid.apple.com adresinden parola oluşturunuz.';
    } else if (lastErrorMsg.includes('AUTHENTICATIONFAILED') || lastErrorMsg.includes('Invalid credentials') || lastErrorMsg.includes('Command failed') || lastErrorMsg.includes('535')) {
      helpfulMsg = 'Kimlik Doğrulama Hatası: Kullanıcı adı veya şifre sunucu tarafından reddedildi. Kurumsal e-posta ise kullanıcı adını tam e-posta (adiniz@alanadi.com) olarak girmeyi deneyin.';
    } else if (lastErrorMsg.includes('ENOTFOUND') || lastErrorMsg.includes('getaddrinfo')) {
      helpfulMsg = `Sunucu Adresi Bulunamadı (DNS / ENOTFOUND): "${baseHost}" adresi internet üzerinde çözümlenemedi. Lütfen e-posta sağlayıcınızın verdiği IMAP sunucu adresini (Örn: mail.alanadiniz.com veya imap.alanadiniz.com) kontrol ediniz.`;
    } else if (lastErrorMsg.includes('ETIMEDOUT')) {
      helpfulMsg = `Bağlantı Zaman Aşımına Uğradı (ETIMEDOUT): "${baseHost}" sunucusuna belirtilen porttan ulaşılamadı. Port (993/143) veya güvenlik duvarı ayarlarını kontrol ediniz.`;
    } else if (lastErrorMsg.includes('ECONNREFUSED')) {
      helpfulMsg = `Bağlantı Reddedildi (ECONNREFUSED): "${baseHost}" sunucusu port üzerinden bağlantıyı reddetti. Lütfen port ve SSL ayarlarını kontrol ediniz.`;
    }

    return { success: false, message: helpfulMsg };
  }

  private static mapMailboxToFolder(mb: { path: string; specialUse?: string; name: string }): { folder: string; isCustom: boolean; cleanName: string } {
    const special = mb.specialUse || '';
    const p = mb.path.toLowerCase();
    const n = mb.name.toLowerCase();

    if (special === '\\Sent' || /sent|gönderilen|gonderilen/i.test(p) || /sent|gönderilen|gonderilen/i.test(n)) {
      return { folder: 'SENT', isCustom: false, cleanName: 'Gönderilenler' };
    }
    if (special === '\\Drafts' || /draft|taslak/i.test(p) || /draft|taslak/i.test(n)) {
      return { folder: 'DRAFTS', isCustom: false, cleanName: 'Taslaklar' };
    }
    if (special === '\\Trash' || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(p) || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(n)) {
      return { folder: 'TRASH', isCustom: false, cleanName: 'Çöp Kutusu' };
    }
    if (special === '\\Junk' || /spam|junk|istenmeyen/i.test(p) || /spam|junk|istenmeyen/i.test(n)) {
      return { folder: 'SPAM', isCustom: false, cleanName: 'İstenmeyen' };
    }
    if (special === '\\Archive' || special === '\\All' || /archive|arşiv|arsiv|all mail/i.test(p) || /archive|arşiv|arsiv|all mail/i.test(n)) {
      return { folder: 'ARCHIVE', isCustom: false, cleanName: 'Arşiv' };
    }
    if (p === 'inbox' || n === 'inbox' || /gelen/i.test(n)) {
      return { folder: 'INBOX', isCustom: false, cleanName: 'Gelen Kutusu' };
    }

    // Custom folder clean display name
    let cleanName = mb.name || mb.path;
    cleanName = cleanName.replace(/^INBOX[./\\]/i, '').replace(/^\[.*?\][./\\]/i, '').trim();
    if (!cleanName) cleanName = mb.path;

    return { folder: cleanName, isCustom: true, cleanName };
  }

  public static async moveMessageOnServer(accountId: string, email: Email, targetFolder: string): Promise<boolean> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return false;

    let client: ImapFlow | null = null;
    try {
      client = await this.connectClient(account);
      const mailboxes = await client.list();

      // Find source mailbox
      const sourcePath = email.mailboxPath || 'INBOX';

      // Find target mailbox
      let targetMailbox = mailboxes.find((mb: any) => {
        const special = (mb.specialUse || '').toLowerCase();
        const p = mb.path.toLowerCase();
        const n = mb.name.toLowerCase();

        if (targetFolder === 'TRASH') {
          return special === '\\trash' || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(p) || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(n);
        }
        if (targetFolder === 'ARCHIVE') {
          return special === '\\archive' || special === '\\all' || /archive|arşiv|arsiv|all mail/i.test(p) || /archive|arşiv|arsiv|all mail/i.test(n);
        }
        if (targetFolder === 'SPAM') {
          return special === '\\junk' || /spam|junk|istenmeyen/i.test(p) || /spam|junk|istenmeyen/i.test(n);
        }
        if (targetFolder === 'INBOX') {
          return p === 'inbox' || n === 'inbox';
        }
        if (targetFolder === 'SENT') {
          return special === '\\sent' || /sent|gönderilen|gonderilen/i.test(p) || /sent|gönderilen|gonderilen/i.test(n);
        }
        return p === targetFolder.toLowerCase() || n === targetFolder.toLowerCase();
      });

      let targetPath = targetMailbox ? targetMailbox.path : (targetFolder === 'TRASH' ? 'Trash' : targetFolder);

      if (!targetMailbox && targetFolder === 'TRASH') {
        try {
          await client.mailboxCreate('Trash');
          targetPath = 'Trash';
        } catch {}
      }

      // Resolve best messageId
      let resolvedMessageId = email.messageId;
      if (!resolvedMessageId && email.id && email.id.startsWith('imap-')) {
        try {
          const parts = email.id.split('-');
          const lastPart = decodeURIComponent(parts.slice(3).join('-'));
          if (lastPart && lastPart.includes('@')) {
            resolvedMessageId = lastPart;
          }
        } catch {}
      }

      const pathsToCheck = [sourcePath];
      if (sourcePath.toUpperCase() !== 'INBOX') {
        pathsToCheck.push('INBOX');
      }

      for (const currentSource of pathsToCheck) {
        try {
          const lock = await client.getMailboxLock(currentSource);
          try {
            let uidToMove: number | null = null;

            // Search by Message-ID if available
            if (resolvedMessageId) {
              const cleanMid = resolvedMessageId.replace(/[<>]/g, '').trim();
              try {
                const searchResults = await client.search({ header: { 'message-id': cleanMid } }, { uid: true });
                if (searchResults && searchResults.length > 0) {
                  uidToMove = searchResults[0];
                } else {
                  const searchResults2 = await client.search({ header: { 'message-id': `<${cleanMid}>` } }, { uid: true });
                  if (searchResults2 && searchResults2.length > 0) {
                    uidToMove = searchResults2[0];
                  }
                }
              } catch {}
            }

            // Search by Subject if not found by Message-ID
            if (!uidToMove && email.subject && email.subject !== '(Konusuz)') {
              try {
                const searchBySubj = await client.search({ header: { subject: email.subject } }, { uid: true });
                if (searchBySubj && searchBySubj.length > 0) {
                  uidToMove = searchBySubj[0];
                }
              } catch {}
            }

            // Fallback to exact original UID if in the same mailbox
            if (!uidToMove && email.imapUid && (currentSource === email.mailboxPath || (!email.mailboxPath && currentSource.toUpperCase() === 'INBOX'))) {
              uidToMove = email.imapUid;
            }

            if (uidToMove) {
              let moved = false;
              let newUid: number | undefined = undefined;
              if (targetPath && targetPath !== currentSource) {
                try {
                  const moveRes = await client.messageMove(String(uidToMove), targetPath, { uid: true });
                  if (moveRes && moveRes.uidMap) {
                    newUid = moveRes.uidMap.get(uidToMove);
                  }
                  moved = true;
                } catch {
                  try {
                    const copyRes = await client.messageCopy(String(uidToMove), targetPath, { uid: true });
                    if (copyRes && copyRes.uidMap) {
                      newUid = copyRes.uidMap.get(uidToMove);
                    }
                    moved = true;
                  } catch {}
                }
              }

              // Update local email record with new folder, mailboxPath and new UID
              if (email.id) {
                try {
                  updateEmailFlags(email.id, {
                    folder: targetFolder,
                    isDeleted: targetFolder === 'TRASH',
                    isArchived: targetFolder === 'ARCHIVE',
                    isSpam: targetFolder === 'SPAM',
                    mailboxPath: targetPath,
                    imapUid: newUid || email.imapUid
                  });
                } catch {}
              }

              // Guarantee deletion from source mailbox
              try {
                await client.messageFlagsAdd(String(uidToMove), ['\\Deleted'], { uid: true });
                await client.messageDelete(String(uidToMove), { uid: true });
              } catch {}
              return true;
            }
          } finally {
            lock.release();
          }
        } catch {}
      }

      return false;
    } catch (err) {
      console.warn(`Error moving message on server for ${account.email}:`, err);
      return false;
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }

  public static async deleteMessageOnServer(accountId: string, email: Email): Promise<boolean> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return false;

    let client: ImapFlow | null = null;
    try {
      client = await this.connectClient(account);
      const mailboxes = await client.list();

      // Find trash mailbox
      const trashMailbox = mailboxes.find((mb: any) => {
        const special = (mb.specialUse || '').toLowerCase();
        const p = mb.path.toLowerCase();
        const n = mb.name.toLowerCase();
        return special === '\\trash' || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(p) || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(n);
      });

      const isTrash = email.folder === 'TRASH' || email.isDeleted;
      const primaryPath = email.mailboxPath || (isTrash && trashMailbox ? trashMailbox.path : 'INBOX');

      // Resolve best messageId
      let resolvedMessageId = email.messageId;
      if (!resolvedMessageId && email.id && email.id.startsWith('imap-')) {
        try {
          const parts = email.id.split('-');
          const lastPart = decodeURIComponent(parts.slice(3).join('-'));
          if (lastPart && lastPart.includes('@')) {
            resolvedMessageId = lastPart;
          }
        } catch {}
      }

      const pathsToCheck: string[] = [];
      if (trashMailbox && !pathsToCheck.includes(trashMailbox.path)) {
        pathsToCheck.push(trashMailbox.path);
      }
      if (primaryPath && !pathsToCheck.includes(primaryPath)) {
        pathsToCheck.push(primaryPath);
      }
      if (!pathsToCheck.includes('INBOX')) {
        pathsToCheck.push('INBOX');
      }

      let deletedAnywhere = false;

      for (const mPath of pathsToCheck) {
        try {
          const lock = await client.getMailboxLock(mPath);
          try {
            let uidsToDelete: number[] = [];

            // 1. Search by Message-ID (exact header)
            if (resolvedMessageId) {
              const cleanMid = resolvedMessageId.replace(/[<>]/g, '').trim();
              try {
                const searchResults = await client.search({ header: { 'message-id': cleanMid } }, { uid: true });
                if (searchResults && searchResults.length > 0) {
                  uidsToDelete.push(...searchResults);
                } else {
                  const searchResults2 = await client.search({ header: { 'message-id': `<${cleanMid}>` } }, { uid: true });
                  if (searchResults2 && searchResults2.length > 0) {
                    uidsToDelete.push(...searchResults2);
                  }
                }
              } catch {}
            }

            // 2. Search by Subject if not found by Message-ID
            if (uidsToDelete.length === 0 && email.subject && email.subject !== '(Konusuz)') {
              try {
                const searchBySubj = await client.search({ header: { subject: email.subject } }, { uid: true });
                if (searchBySubj && searchBySubj.length > 0) {
                  uidsToDelete.push(...searchBySubj);
                }
              } catch {}
            }

            // 3. Fallback: Search all messages in this mailbox if small and match envelope
            if (uidsToDelete.length === 0 && client.mailbox && client.mailbox.exists > 0 && client.mailbox.exists <= 50) {
              try {
                const msgs = client.fetch('1:*', { envelope: true, uid: true });
                for await (const m of msgs) {
                  const mid = m.envelope?.messageId?.replace(/[<>]/g, '').trim();
                  const cleanTarget = resolvedMessageId ? resolvedMessageId.replace(/[<>]/g, '').trim() : '';
                  if (cleanTarget && mid === cleanTarget) {
                    uidsToDelete.push(m.uid);
                  } else if (email.subject && m.envelope?.subject === email.subject) {
                    uidsToDelete.push(m.uid);
                  }
                }
              } catch {}
            }

            // 4. Exact original UID if in the exact matching mailbox
            if (uidsToDelete.length === 0 && email.imapUid && (mPath === email.mailboxPath || (!email.mailboxPath && mPath.toUpperCase() === 'INBOX'))) {
              uidsToDelete.push(email.imapUid);
            }

            if (uidsToDelete.length > 0) {
              const uniqueUids = Array.from(new Set(uidsToDelete));
              for (const uid of uniqueUids) {
                try {
                  await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
                  await client.messageDelete(String(uid), { uid: true });
                  deletedAnywhere = true;
                } catch {}
              }
            }
          } finally {
            lock.release();
          }
        } catch {}
      }

      return deletedAnywhere;
    } catch (err) {
      console.warn(`Could not delete message on server for account ${account.email}:`, err);
      return false;
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }

  public static async updateFlagsOnServer(accountId: string, email: Email, flags: { isRead?: boolean; isStarred?: boolean }): Promise<boolean> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return false;

    let client: ImapFlow | null = null;
    try {
      client = await this.connectClient(account);
      const mailboxPath = email.mailboxPath || 'INBOX';
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        let uidToUpdate: number | null = email.imapUid || null;
        if (!uidToUpdate && email.messageId) {
          const cleanMid = email.messageId.replace(/[<>]/g, '').trim();
          try {
            const searchResults = await client.search({ header: { 'message-id': cleanMid } }, { uid: true });
            if (searchResults && searchResults.length > 0) {
              uidToUpdate = searchResults[0];
            } else {
              const searchResults2 = await client.search({ header: { 'message-id': `<${cleanMid}>` } }, { uid: true });
              if (searchResults2 && searchResults2.length > 0) {
                uidToUpdate = searchResults2[0];
              }
            }
          } catch {}
        }

        if (uidToUpdate) {
          if (flags.isRead !== undefined) {
            if (flags.isRead) {
              await client.messageFlagsAdd(String(uidToUpdate), ['\\Seen'], { uid: true });
            } else {
              await client.messageFlagsRemove(String(uidToUpdate), ['\\Seen'], { uid: true });
            }
          }
          if (flags.isStarred !== undefined) {
            if (flags.isStarred) {
              await client.messageFlagsAdd(String(uidToUpdate), ['\\Flagged'], { uid: true });
            } else {
              await client.messageFlagsRemove(String(uidToUpdate), ['\\Flagged'], { uid: true });
            }
          }
          return true;
        }
        return false;
      } finally {
        lock.release();
      }
    } catch (err) {
      console.warn(`Could not update flags on server for account ${account.email}:`, err);
      return false;
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }

  public static async emptyTrashOnServer(accountId?: string): Promise<boolean> {
    const targetAccounts = (!accountId || accountId === 'all')
      ? getAccounts().filter(a => a.provider !== 'demo')
      : [getAccountById(accountId)].filter(Boolean) as Account[];

    if (targetAccounts.length === 0) return false;

    let anyEmptied = false;
    for (const account of targetAccounts) {
      let client: ImapFlow | null = null;
      try {
        client = await this.connectClient(account);
        const mailboxes = await client.list();

        // Find trash mailbox
        const trashMailbox = mailboxes.find((mb: any) => {
          const special = (mb.specialUse || '').toLowerCase();
          const p = mb.path.toLowerCase();
          const n = mb.name.toLowerCase();
          return special === '\\trash' || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(p) || /trash|çöp|cop|deleted|silinmiş|silinmis/i.test(n);
        });

        if (!trashMailbox) continue;

        const lock = await client.getMailboxLock(trashMailbox.path);
        try {
          if (client.mailbox && client.mailbox.exists > 0) {
            const uids = await client.search({ all: true }, { uid: true });
            if (Array.isArray(uids) && uids.length > 0) {
              for (const uid of uids) {
                try {
                  await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
                  await client.messageDelete(String(uid), { uid: true });
                } catch {}
              }
              anyEmptied = true;
            }
          }
        } finally {
          lock.release();
        }
      } catch (err) {
        console.warn(`Could not empty trash on server for account ${account.email}:`, err);
      } finally {
        if (client) await client.logout().catch(() => {});
      }
    }

    return anyEmptied;
  }

  public static async resolveServerMailboxPath(client: ImapFlow, accountId: string, folderNameOrPath: string): Promise<string> {
    const p = folderNameOrPath.toUpperCase();
    if (p === 'INBOX') return 'INBOX';

    // Check cached or fetched mailboxes
    let mailboxes = this.mailboxListCache.get(accountId)?.mailboxes;
    if (!mailboxes || mailboxes.length === 0) {
      try {
        mailboxes = await client.list();
        this.mailboxListCache.set(accountId, { mailboxes, cachedAt: Date.now() });
      } catch {
        return folderNameOrPath;
      }
    }

    // Direct match by path or name
    const exact = mailboxes.find(m => m.path.toLowerCase() === folderNameOrPath.toLowerCase() || m.name.toLowerCase() === folderNameOrPath.toLowerCase());
    if (exact) return exact.path;

    // Semantic match
    const targetFolder = folderNameOrPath.toUpperCase();
    for (const mb of mailboxes) {
      const mapped = this.mapMailboxToFolder(mb);
      if (mapped.folder.toUpperCase() === targetFolder) {
        return mb.path;
      }
    }

    return folderNameOrPath;
  }

  public static async syncAccount(accountId: string, options?: { onlyInbox?: boolean }): Promise<{ syncedCount: number }> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return { syncedCount: 0 };

    if (this.syncingAccounts.has(accountId)) {
      return { syncedCount: 0 };
    }
    this.syncingAccounts.add(accountId);

    let syncedCount = 0;

    try {
      const client = await this.getOrCreateClient(account);

      const onlyInbox = options?.onlyInbox ?? false;
      const isFullSync = !onlyInbox;

      // 1. Mailbox list caching (cache for 3 minutes on fast sync, refresh on full sync)
      let mailboxes: any[] = [];
      const cachedList = this.mailboxListCache.get(account.id);
      if (cachedList && Date.now() - cachedList.cachedAt < 180000 && !isFullSync) {
        mailboxes = cachedList.mailboxes;
      } else {
        mailboxes = await client.list();
        this.mailboxListCache.set(account.id, { mailboxes, cachedAt: Date.now() });

        // Register all mailboxes in database for UI folders sidebar
        for (const mb of mailboxes) {
          const { folder: targetFolder, isCustom, cleanName } = this.mapMailboxToFolder(mb);
          if (isCustom) {
            registerServerFolder({
              id: `folder-${account.id}-${mb.path}`,
              accountId: account.id,
              path: mb.path,
              name: cleanName,
              folderKey: targetFolder,
              delimiter: mb.delimiter,
              specialUse: mb.specialUse
            });
          }
        }
      }

      // Prioritize core standard mailboxes (INBOX first, then Sent, Trash, Drafts, Junk, Spam)
      const isCore = (mb: any) => {
        const p = mb.path.toUpperCase();
        const s = (mb.specialUse || '').toUpperCase();
        return p === 'INBOX' || s === '\\INBOX' || s === '\\SENT' || s === '\\TRASH' || s === '\\DRAFTS' || s === '\\JUNK' ||
          /sent|trash|çöp|draft|taslak|junk|spam/i.test(mb.path);
      };

      const sortedMailboxes = onlyInbox
        ? mailboxes.filter(m => m.path.toUpperCase() === 'INBOX' || (m.specialUse || '').toUpperCase() === '\\INBOX')
        : [
            ...mailboxes.filter(m => m.path.toUpperCase() === 'INBOX' || (m.specialUse || '').toUpperCase() === '\\INBOX'),
            ...mailboxes.filter(m => m.path.toUpperCase() !== 'INBOX' && (m.specialUse || '').toUpperCase() !== '\\INBOX' && isCore(m))
          ];

      if (sortedMailboxes.length === 0 && mailboxes.length > 0) {
        sortedMailboxes.push(mailboxes[0]);
      }

      for (const mb of sortedMailboxes) {
        const { folder: targetFolder, isCustom } = this.mapMailboxToFolder(mb);
        if (mb.flags && mb.flags.has('\\Noselect')) continue;

        try {
          const lock = await Promise.race([
            client.getMailboxLock(mb.path),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`Mailbox lock timeout on ${mb.path}`)), 8000))
          ]);
          try {
            const stateKey = `${account.id}:::${mb.path}`;
            let state = this.mailboxStates.get(stateKey);

            const mbObj: any = client.mailbox;
            const currentValidity = mbObj ? mbObj.uidValidity : undefined;
            const currentUidNext = mbObj ? (mbObj.uidNext || 0) : 0;
            const currentExists = mbObj ? (mbObj.exists || 0) : 0;

            if (!state) {
              const maxUid = getEmailMaxUid(account.id, mb.path);
              state = {
                uidValidity: currentValidity,
                highestKnownUid: maxUid,
                uidNext: currentUidNext,
                exists: currentExists,
                lastSyncedAt: Date.now()
              };
              this.mailboxStates.set(stateKey, state);
            }

            const isValidityChanged = state.uidValidity && currentValidity && String(state.uidValidity) !== String(currentValidity);

            // Fast Incremental Check: Only skip if not full sync, validity is same, exists count is same, uidNext hasn't increased, and already has local emails
            if (!isFullSync && !isValidityChanged && state.highestKnownUid > 0 && currentUidNext > 0 && currentUidNext <= state.highestKnownUid + 1 && currentExists === state.exists && (Date.now() - state.lastSyncedAt < 45000)) {
              // Nothing changed on server! Finish quickly
              continue;
            }

            // Determine UIDs to fetch
            let targetUidsToFetch: number[] = [];
            let minUid = 1;
            let allUids: number[] = [];

            // Incremental fetch: if only a few new emails arrived since last highest UID
            if (!isFullSync && !isValidityChanged && state.highestKnownUid > 0 && currentUidNext > state.highestKnownUid + 1) {
              try {
                const newUids = await client.search({ uid: `${state.highestKnownUid + 1}:*` }, { uid: true });
                if (Array.isArray(newUids) && newUids.length > 0) {
                  targetUidsToFetch = newUids.sort((a, b) => a - b);
                  minUid = targetUidsToFetch[0];
                }
              } catch {}
            }

            // Fallback to universal standard search if incremental didn't apply or on full sync
            if (targetUidsToFetch.length === 0) {
              try {
                const searchResult = await client.search({ all: true }, { uid: true });
                if (Array.isArray(searchResult) && searchResult.length > 0) {
                  allUids = searchResult;
                } else {
                  const searchResultSeq = await client.search({ seq: '1:*' }, { uid: true });
                  if (Array.isArray(searchResultSeq)) allUids = searchResultSeq;
                }
              } catch (searchErr) {
                console.warn(`UID search on mailbox ${mb.path} failed:`, searchErr);
              }

              let fetchLimit = 300;
              if (mb.path.toUpperCase() === 'INBOX' || targetFolder === 'INBOX') {
                fetchLimit = 500;
              } else if (targetFolder === 'SENT') {
                fetchLimit = 200;
              } else if (targetFolder === 'TRASH' || targetFolder === 'DRAFTS' || targetFolder === 'SPAM') {
                fetchLimit = 100;
              }

              const recentUids = allUids.slice(-fetchLimit);
              targetUidsToFetch = recentUids.sort((a, b) => a - b);
              minUid = targetUidsToFetch.length > 0 ? targetUidsToFetch[0] : (allUids.length > 0 ? allUids[0] : 1);

              // Prune messages locally that were deleted or moved away on remote server
              if (allUids.length > 0) {
                pruneMissingServerUids(account.id, mb.path, allUids, minUid, targetFolder);
              } else if (currentExists === 0) {
                pruneMissingServerUids(account.id, mb.path, [], 1, targetFolder);
              }
            }

            // Update state
            if (targetUidsToFetch.length > 0) {
              const maxFetched = Math.max(...targetUidsToFetch);
              state.highestKnownUid = Math.max(state.highestKnownUid, maxFetched);
            }
            state.uidValidity = currentValidity;
            state.uidNext = currentUidNext;
            state.exists = currentExists;
            state.lastSyncedAt = Date.now();

            // TIER 1: Lightning-fast Envelope & Metadata Fetch in safe chunks (50 UIDs per chunk to prevent Gmail throttling)
            const envelopeEmails: Email[] = [];
            const uidsToPreloadBody: number[] = [];

            if (targetUidsToFetch.length > 0) {
              const CHUNK_SIZE = 50;
              for (let c = 0; c < targetUidsToFetch.length; c += CHUNK_SIZE) {
                const uidChunk = targetUidsToFetch.slice(c, c + CHUNK_SIZE);
                try {
                  const messages = client.fetch(uidChunk, {
                    envelope: true,
                    flags: true,
                    bodyStructure: true,
                    internalDate: true,
                    uid: true,
                  }, { uid: true });

                  for await (const message of messages) {
                    try {
                      // Skip messages flagged as \Deleted on server
                      if (message.flags && (message.flags.has('\\Deleted') || message.flags.has('\\deleted'))) {
                        continue;
                      }

                      const env = message.envelope;
                      const rawMid = env?.messageId || undefined;
                      const emailId = rawMid
                        ? `imap-${account.id}-${encodeURIComponent(rawMid)}`
                        : `imap-${account.id}-${mb.path}-${message.uid || uuidv4()}`;

                      if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, rawMid, account.id, message.uid, mb.path)) {
                        continue;
                      }

                      const fromName = env?.from?.[0]?.name || env?.from?.[0]?.address || 'Bilinmeyen Gönderici';
                      const fromEmail = env?.from?.[0]?.address || 'unknown@example.com';
                      const subject = env?.subject || '(Konusuz)';
                      const rawDate = env?.date || message.internalDate || new Date();
                      const date = rawDate instanceof Date ? rawDate.toISOString() : new Date(rawDate).toISOString();
                      const snippet = subject.substring(0, 150);

                      const to = (env?.to || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));
                      const cc = (env?.cc || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

                      // Extract attachment info from bodyStructure without downloading attachment payloads
                      const attachments: Attachment[] = [];
                      if (message.bodyStructure) {
                        const extractAttachments = (struct: any) => {
                          if (!struct) return;
                          if (struct.disposition === 'attachment' || (struct.parameters && struct.parameters.name)) {
                            attachments.push({
                              id: uuidv4(),
                              filename: struct.parameters?.name || struct.dispositionParameters?.filename || 'ek_dosya',
                              contentType: struct.type ? `${struct.type}/${struct.subtype || 'octet-stream'}` : 'application/octet-stream',
                              size: struct.size || 0,
                              isInline: struct.disposition === 'inline'
                            });
                          }
                          if (Array.isArray(struct.childNodes)) {
                            for (const child of struct.childNodes) extractAttachments(child);
                          }
                        };
                        extractAttachments(message.bodyStructure);
                      }

                      const email: Email = {
                        id: emailId,
                        accountId: account.id,
                        threadId: rawMid ? `thread-${rawMid}` : `thread-${emailId}`,
                        messageId: rawMid,
                        inReplyTo: env?.inReplyTo || undefined,
                        fromName,
                        fromEmail,
                        to,
                        cc,
                        bcc: [],
                        subject,
                        bodyText: snippet,
                        bodyHtml: `<p>${snippet}</p>`,
                        snippet,
                        date,
                        isRead: message.flags ? message.flags.has('\\Seen') : (targetFolder === 'SENT'),
                        isStarred: message.flags ? message.flags.has('\\Flagged') : false,
                        isArchived: targetFolder === 'ARCHIVE',
                        isDeleted: targetFolder === 'TRASH',
                        isDraft: targetFolder === 'DRAFTS',
                        isSpam: targetFolder === 'SPAM',
                        folder: targetFolder,
                        labels: isCustom ? [targetFolder] : [targetFolder === 'INBOX' ? 'Gelen Kutusu' : targetFolder],
                        priority: 'normal',
                        attachments,
                        imapUid: message.uid,
                        mailboxPath: mb.path,
                        hasFullBody: false,
                        aiSummary: null,
                        aiSmartReplies: null
                      };

                      envelopeEmails.push(email);
                    } catch (itemErr) {
                      console.warn('Failed to process message envelope:', itemErr);
                    }
                  }
                } catch (chunkErr) {
                  console.warn(`Failed to fetch chunk for ${account.email} on ${mb.path}:`, chunkErr);
                }
              }

              // High-speed bulk insertion in single SQLite transaction
              if (envelopeEmails.length > 0) {
                const { savedCount, newEmails } = saveEmailsBatch(envelopeEmails, true);
                syncedCount += savedCount;

                // Notify frontend immediately ONLY if new emails arrived!
                if (this.broadcastCb && newEmails.length > 0) {
                  this.broadcastCb('emails_synced', { accountId: account.id, folder: targetFolder, newCount: newEmails.length });
                  for (const nm of newEmails) {
                    if (targetFolder === 'INBOX' && !nm.isRead) {
                      this.broadcastCb('new_email', nm);
                    }
                  }
                }

                // Collect top 2 newest unseen emails to preload bodies in background (keeps CPU/memory near zero)
                if (targetFolder === 'INBOX') {
                  const unreadRecent = envelopeEmails
                    .filter(e => !e.isRead && e.imapUid)
                    .sort((a, b) => (b.imapUid || 0) - (a.imapUid || 0))
                    .slice(0, 2);
                  for (const em of unreadRecent) {
                    if (em.imapUid) uidsToPreloadBody.push(em.imapUid);
                  }
                }
              }
            }

              // TIER 2: Fast Pre-load of top 2 latest unseen email bodies
              if (uidsToPreloadBody.length > 0) {
                try {
                  const fullMessages = client.fetch(uidsToPreloadBody, {
                    source: true,
                    uid: true
                  }, { uid: true });

                  for await (const fm of fullMessages) {
                    if (fm.source && fm.uid) {
                      try {
                        const parsed = await simpleParser(fm.source);
                        const bText = parsed.text || '';
                        const bHtml = parsed.html || `<p>${bText}</p>`;
                        const bSnippet = (bText || parsed.subject || '').substring(0, 150).replace(/\s+/g, ' ');
                        
                        const parsedAttachments: Attachment[] = (parsed.attachments || []).map(att => ({
                          id: uuidv4(),
                          filename: att.filename || 'ek_dosya',
                          contentType: att.contentType,
                          size: att.size,
                          isInline: att.related,
                          contentId: att.cid,
                          contentBase64: att.content ? att.content.toString('base64') : undefined
                        }));

                        const targetEmail = envelopeEmails.find(e => e.imapUid === fm.uid);
                        if (targetEmail) {
                          updateEmailBody(targetEmail.id, {
                            bodyText: bText,
                            bodyHtml: bHtml,
                            snippet: bSnippet,
                            attachments: parsedAttachments,
                            hasFullBody: true
                          });
                        }
                      } catch (pErr) {
                        console.warn('Preload body parse error:', pErr);
                      }
                    }
                  }
                } catch (preloadErr) {
                  console.warn('Preload full body fetch failed:', preloadErr);
                }
              }
          } finally {
            lock.release();
          }
        } catch (mbErr) {
          console.warn(`Could not sync mailbox ${mb.path}:`, mbErr);
        }
      }
    } catch (err: any) {
      console.error(`IMAP Sync error for account ${account.email}:`, err);
      let userMsg = err.message || String(err);
      if (userMsg.includes('AUTHENTICATIONFAILED') || userMsg.includes('Command failed')) {
        userMsg = `"${account.email}" hesabı için kimlik doğrulama başarısız. Lütfen şifrenizi veya Uygulama Şifrenizi güncelleyin.`;
      }
      throw new Error(userMsg);
    } finally {
      this.syncingAccounts.delete(accountId);
    }

    return { syncedCount };
  }

  public static async fetchFullEmailBody(accountId: string, mailboxPath: string, imapUid: number, emailId: string): Promise<Email | null> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return null;

    try {
      const client = await this.getOrCreateClient(account);
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        const message = await client.fetchOne(imapUid, {
          source: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
        }, { uid: true });

        if (!message || !message.source) return null;

        const parsed = await simpleParser(message.source);
        const bodyText = parsed.text || '';
        const bodyHtml = parsed.html || `<p>${bodyText}</p>`;
        const snippet = (bodyText || parsed.subject || '').substring(0, 150).replace(/\s+/g, ' ');

        const attachments: Attachment[] = (parsed.attachments || []).map(att => ({
          id: uuidv4(),
          filename: att.filename || 'ek_dosya',
          contentType: att.contentType,
          size: att.size,
          isInline: att.related,
          contentId: att.cid,
          contentBase64: att.content ? att.content.toString('base64') : undefined
        }));

        updateEmailBody(emailId, {
          bodyText,
          bodyHtml,
          snippet,
          attachments,
          hasFullBody: true
        });

        return getEmailById(emailId) || null;
      } finally {
        lock.release();
      }
    } catch (err) {
      console.warn(`Could not fetch full body on demand for email ${emailId}:`, err);
      return null;
    }
  }

  public static async syncMailbox(accountId: string, mailboxPath: string): Promise<{ syncedCount: number }> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return { syncedCount: 0 };

    let syncedCount = 0;

    try {
      const client = await this.getOrCreateClient(account);
      const resolvedPath = await this.resolveServerMailboxPath(client, account.id, mailboxPath);
      const lock = await Promise.race([
        client.getMailboxLock(resolvedPath),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`Mailbox lock timeout on ${resolvedPath}`)), 8000))
      ]);
      try {
        let uids: number[] = [];
        try {
          const searchResult = await client.search({ all: true }, { uid: true });
          if (Array.isArray(searchResult) && searchResult.length > 0) {
            uids = searchResult;
          } else {
            const searchResult2 = await client.search({ seq: '1:*' }, { uid: true });
            if (Array.isArray(searchResult2)) uids = searchResult2;
          }
        } catch {}

        const { folder: targetFolder, isCustom } = this.mapMailboxToFolder({ path: resolvedPath, name: resolvedPath });

        const latestUids = uids.slice(-100);
        const minUid = latestUids[0] || 1;
        if (latestUids.length > 0) {
          pruneMissingServerUids(account.id, resolvedPath, latestUids, minUid, targetFolder);
        } else {
          pruneMissingServerUids(account.id, resolvedPath, [], 1, targetFolder);
        }

        const envelopeEmails: Email[] = [];
        if (latestUids.length > 0) {
          const CHUNK_SIZE = 50;
          for (let c = 0; c < latestUids.length; c += CHUNK_SIZE) {
            const chunk = latestUids.slice(c, c + CHUNK_SIZE);
            try {
              const messages = client.fetch(chunk, {
                envelope: true,
                flags: true,
                bodyStructure: true,
                internalDate: true,
                uid: true,
              }, { uid: true });

              for await (const message of messages) {
                try {
                  // Skip messages flagged as \Deleted on server
                  if (message.flags && (message.flags.has('\\Deleted') || message.flags.has('\\deleted'))) {
                    continue;
                  }

                  const env = message.envelope;
                  const rawMid = env?.messageId || undefined;
                  const emailId = rawMid
                    ? `imap-${account.id}-${encodeURIComponent(rawMid)}`
                    : `imap-${account.id}-${resolvedPath}-${message.uid || uuidv4()}`;

                  if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, rawMid, account.id, message.uid, resolvedPath)) {
                    continue;
                  }

                  const fromName = env?.from?.[0]?.name || env?.from?.[0]?.address || 'Bilinmeyen Gönderici';
                  const fromEmail = env?.from?.[0]?.address || 'unknown@example.com';
                  const subject = env?.subject || '(Konusuz)';
                  const rawDate = env?.date || message.internalDate || new Date();
                  const date = rawDate instanceof Date ? rawDate.toISOString() : new Date(rawDate).toISOString();
                  const snippet = subject.substring(0, 150);

                  const to = (env?.to || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));
                  const cc = (env?.cc || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

                  const attachments: Attachment[] = [];
                  if (message.bodyStructure) {
                    const extractAttachments = (struct: any) => {
                      if (!struct) return;
                      if (struct.disposition === 'attachment' || (struct.parameters && struct.parameters.name)) {
                        attachments.push({
                          id: uuidv4(),
                          filename: struct.parameters?.name || struct.dispositionParameters?.filename || 'ek_dosya',
                          contentType: struct.type ? `${struct.type}/${struct.subtype || 'octet-stream'}` : 'application/octet-stream',
                          size: struct.size || 0,
                          isInline: struct.disposition === 'inline'
                        });
                      }
                      if (Array.isArray(struct.childNodes)) {
                        for (const child of struct.childNodes) extractAttachments(child);
                      }
                    };
                    extractAttachments(message.bodyStructure);
                  }

                  const email: Email = {
                    id: emailId,
                    accountId: account.id,
                    threadId: rawMid ? `thread-${rawMid}` : `thread-${emailId}`,
                    messageId: rawMid,
                    inReplyTo: env?.inReplyTo || undefined,
                    fromName,
                    fromEmail,
                    to,
                    cc,
                    bcc: [],
                    subject,
                    bodyText: snippet,
                    bodyHtml: `<p>${snippet}</p>`,
                    snippet,
                    date,
                    isRead: message.flags ? message.flags.has('\\Seen') : (targetFolder === 'SENT'),
                    isStarred: message.flags ? message.flags.has('\\Flagged') : false,
                    isArchived: targetFolder === 'ARCHIVE',
                    isDeleted: targetFolder === 'TRASH',
                    isDraft: targetFolder === 'DRAFTS',
                    isSpam: targetFolder === 'SPAM',
                    folder: targetFolder,
                    labels: isCustom ? [targetFolder] : [targetFolder === 'INBOX' ? 'Gelen Kutusu' : targetFolder],
                    priority: 'normal',
                    attachments,
                    imapUid: message.uid,
                    mailboxPath: resolvedPath,
                    hasFullBody: false,
                    aiSummary: null,
                    aiSmartReplies: null
                  };

                  envelopeEmails.push(email);
                } catch (itemErr) {
                  console.warn('Failed to process custom folder message:', itemErr);
                }
              }
            } catch (chunkErr) {
              console.warn(`Failed to fetch chunk on ${resolvedPath}:`, chunkErr);
            }
          }
        }

        if (envelopeEmails.length > 0) {
          const { savedCount, newEmails } = saveEmailsBatch(envelopeEmails, true);
          syncedCount = savedCount;
          if (this.broadcastCb && newEmails.length > 0) {
            this.broadcastCb('emails_synced', { accountId: account.id, folder: targetFolder, mailboxPath: resolvedPath });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.warn(`Could not sync mailbox ${mailboxPath}:`, err);
    }

    return { syncedCount };
  }

  private static syncingAccounts = new Set<string>();
  private static autoSyncTimer: NodeJS.Timeout | null = null;
  private static fullSyncTimer: NodeJS.Timeout | null = null;
  private static broadcastCb: ((event: string, data: any) => void) | null = null;

  public static startAutoSyncEngine(broadcast: (event: string, data: any) => void) {
    this.broadcastCb = broadcast;
    if (this.autoSyncTimer) return;

    // Run initial fast INBOX sync after 2 seconds
    setTimeout(() => {
      this.runBackgroundSyncCycle(true);
    }, 2000);

    // Run first full sync after 10 seconds
    setTimeout(() => {
      this.runBackgroundSyncCycle(false);
    }, 10000);

    // Fast 30-second continuous sync cycle (INBOX only - lightning fast & low memory)
    this.autoSyncTimer = setInterval(() => {
      this.runBackgroundSyncCycle(true);
    }, 30000);

    // 3-minute periodic full sync across all folders
    this.fullSyncTimer = setInterval(() => {
      this.runBackgroundSyncCycle(false);
    }, 180000);
  }

  public static async runBackgroundSyncCycle(onlyInbox = true) {
    try {
      const isSyncable = (a: Account) => {
        if (a.provider === 'demo') return false;
        if (a.authType === 'oauth2') {
          return Boolean(a.oauthRefreshToken || a.oauthAccessToken);
        }
        return Boolean(a.imapHost && (a.imapPassword || (a as any).password));
      };

      const accounts = getAccounts().filter(isSyncable);
      if (accounts.length === 0) return;

      await Promise.allSettled(
        accounts.map(async acc => {
          if (this.syncingAccounts.has(acc.id)) return;
          try {
            const result = await this.syncAccount(acc.id, { onlyInbox });
            if (this.broadcastCb && result.syncedCount > 0) {
              this.broadcastCb('emails_synced', { accountId: acc.id, ...result });
            }
          } catch (err) {
            console.warn(`Background sync error for account ${acc.email}:`, err);
          }
        })
      );
    } catch {}
  }
}
