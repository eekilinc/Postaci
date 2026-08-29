import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { Account, Email, Attachment } from '../types.js';
import { saveEmail, saveEmailWithStatus, getAccounts, getAccountById, isDeletedLocally, registerServerFolder, pruneMissingServerUids, updateEmailFlags, syncFolderReadFlags } from './db.js';
import { OAuthService } from './oauthService.js';
import { v4 as uuidv4 } from 'uuid';
import dns from 'dns';
import { promisify } from 'util';

const resolveMxAsync = promisify(dns.resolveMx);

export class ImapService {
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
          version: '1.1.4',
        },
        logger: false,
        emitLogs: false,
      });
      await client.connect();
      return client;
    }

    if (!account.imapHost || (!account.imapUser && !account.email) || !account.imapPassword) {
      throw new Error('IMAP yapılandırma bilgileri eksik (Sunucu, Kullanıcı Adı veya Şifre)');
    }

    const email = account.email || '';
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const configuredUser = account.imapUser || email;
    const configuredPort = account.imapPort || (account.imapSecure === false ? 143 : 993);
    const configuredSecure = account.imapSecure !== undefined ? account.imapSecure : (configuredPort === 993);

    const userCandidates = [
      configuredUser,
      ...(email && email !== configuredUser ? [email] : []),
      ...(prefix && prefix !== configuredUser && prefix !== email ? [prefix] : [])
    ];

    const portCandidates = [
      { port: configuredPort, secure: configuredSecure },
      { port: 993, secure: true },
      { port: 143, secure: false },
    ];

    const uniquePorts = portCandidates.filter((v, i, a) => a.findIndex(t => t.port === v.port && t.secure === v.secure) === i);

    let lastError: any = null;

    for (const u of userCandidates) {
      for (const p of uniquePorts) {
        try {
          const client = new ImapFlow({
            host: account.imapHost,
            port: p.port,
            secure: p.secure,
            auth: {
              user: u,
              pass: account.imapPassword,
            },
            tls: {
              rejectUnauthorized: false,
              servername: account.imapHost,
            },
            clientInfo: {
              name: 'Postaci',
              version: '1.1.4',
              vendor: 'Postaci Mail Client',
            },
            logger: false,
            emitLogs: false,
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

  public static async syncAccount(accountId: string): Promise<{ syncedCount: number }> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return { syncedCount: 0 };

    let client: ImapFlow | null = null;
    let syncedCount = 0;

    try {
      client = await this.connectClient(account);

      // Fetch all mailboxes from server
      const mailboxes = await client.list();

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

      // Prioritize core standard mailboxes (INBOX, Sent, Trash, Drafts, Junk, Spam)
      const isCore = (mb: any) => {
        const p = mb.path.toUpperCase();
        const s = (mb.specialUse || '').toUpperCase();
        return p === 'INBOX' || s === '\\INBOX' || s === '\\SENT' || s === '\\TRASH' || s === '\\DRAFTS' || s === '\\JUNK' ||
          /sent|trash|çöp|draft|taslak|junk|spam/i.test(mb.path);
      };

      const sortedMailboxes = [
        ...mailboxes.filter(m => m.path.toUpperCase() === 'INBOX'),
        ...mailboxes.filter(m => m.path.toUpperCase() !== 'INBOX' && isCore(m))
      ];

      for (const mb of sortedMailboxes) {
        const { folder: targetFolder, isCustom, cleanName } = this.mapMailboxToFolder(mb);

        // Skip non-selectable containers for fetching messages
        if (mb.flags && mb.flags.has('\\Noselect')) continue;

        try {
          const lock = await client.getMailboxLock(mb.path);
          try {
            // 1. Search for all UNSEEN (unread) message UIDs in this mailbox
            let unseenUids: number[] = [];
            try {
              const unseenSearchResult = await client.search({ seen: false }, { uid: true });
              if (Array.isArray(unseenSearchResult)) {
                unseenUids = unseenSearchResult;
              }
            } catch (unseenErr) {
              console.warn(`Unseen search on mailbox ${mb.path} failed:`, unseenErr);
            }

            // 2. Search for all message UIDs in this mailbox
            let allUids: number[] = [];
            try {
              const searchResult = await client.search({ all: true }, { uid: true });
              if (Array.isArray(searchResult)) {
                allUids = searchResult;
              }
            } catch (searchErr) {
              console.warn(`UID search on mailbox ${mb.path} failed:`, searchErr);
            }

            let fetchLimit = 300;
            if (mb.path.toUpperCase() === 'INBOX' || targetFolder === 'INBOX') {
              fetchLimit = 1000;
            } else if (targetFolder === 'SENT') {
              fetchLimit = 300;
            } else if (targetFolder === 'TRASH' || targetFolder === 'DRAFTS' || targetFolder === 'SPAM') {
              fetchLimit = 150;
            }

            // Target UIDs = recent messages + ALL unseen messages everywhere in the mailbox
            const recentUids = allUids.slice(-fetchLimit);
            const targetUidsToFetch = Array.from(new Set([...recentUids, ...unseenUids])).sort((a, b) => a - b);
            const minUid = targetUidsToFetch.length > 0 ? targetUidsToFetch[0] : (allUids.length > 0 ? allUids[0] : 1);

            // Prune messages locally that were deleted or moved away on remote webmail
            if (allUids.length > 0) {
              pruneMissingServerUids(account.id, mb.path, allUids, minUid, targetFolder);
            } else {
              const totalExists = client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
                ? (client.mailbox as any).exists
                : 0;
              if (totalExists === 0) {
                pruneMissingServerUids(account.id, mb.path, [], 1, targetFolder);
              }
            }

            // Fetch messages by UID (including ALL unseen + recent messages)
            if (targetUidsToFetch.length > 0) {
              const messages = client.fetch(targetUidsToFetch, {
                envelope: true,
                flags: true,
                bodyStructure: true,
                source: true,
                uid: true,
              }, { uid: true });

              for await (const message of messages) {
                try {
                  const env = message.envelope;
                  const rawMid = env?.messageId || undefined;
                  const emailId = rawMid
                    ? `imap-${account.id}-${encodeURIComponent(rawMid)}`
                    : `imap-${account.id}-${mb.path}-${message.uid || uuidv4()}`;

                  if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, rawMid, account.id, message.uid, mb.path)) {
                    continue;
                  }

                  let parsed: ParsedMail | null = null;
                  if (message.source) {
                    try {
                      parsed = await simpleParser(message.source);
                    } catch (pErr) {
                      console.warn('Mailparser error on UID fetch, falling back to envelope:', pErr);
                    }
                  }

                  const messageId = parsed?.messageId || rawMid || undefined;
                  if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, messageId, account.id, message.uid, mb.path)) {
                    continue;
                  }

                  const attachments: Attachment[] = (parsed?.attachments || []).map(att => ({
                    id: uuidv4(),
                    filename: att.filename || 'ek_dosya',
                    contentType: att.contentType,
                    size: att.size,
                    isInline: att.related,
                    contentId: att.cid,
                    contentBase64: att.content ? att.content.toString('base64') : undefined
                  }));

                  const fromName = parsed?.from?.value[0]?.name || parsed?.from?.text || env?.from?.[0]?.name || 'Bilinmeyen Gönderici';
                  const fromEmail = parsed?.from?.value[0]?.address || env?.from?.[0]?.address || 'unknown@example.com';
                  const subject = parsed?.subject || env?.subject || '(Konusuz)';
                  const bodyText = parsed?.text || '';
                  const bodyHtml = parsed?.html || `<p>${bodyText || subject || ''}</p>`;
                  const snippet = (bodyText || subject).substring(0, 150).replace(/\s+/g, ' ');
                  const date = (parsed?.date || env?.date || new Date()).toISOString();

                  const to = parsed?.to
                    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((t: any) => (t.value || []).map((v: any) => ({ name: v.name || '', email: v.address || '' })))
                    : (env?.to || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

                  const cc = parsed?.cc
                    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((t: any) => (t.value || []).map((v: any) => ({ name: v.name || '', email: v.address || '' })))
                    : (env?.cc || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

                  const email: Email = {
                    id: emailId,
                    accountId: account.id,
                    threadId: messageId ? `thread-${messageId}` : `thread-${emailId}`,
                    messageId,
                    inReplyTo: parsed?.inReplyTo || env?.inReplyTo || undefined,
                    references: Array.isArray(parsed?.references) ? parsed.references.join(' ') : (parsed?.references || undefined),
                    fromName,
                    fromEmail,
                    to,
                    cc,
                    bcc: [],
                    subject,
                    bodyText,
                    bodyHtml,
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
                    aiSummary: null,
                    aiSmartReplies: null
                  };

                  const { email: savedEmail, isNew } = saveEmailWithStatus(email, true);
                  if (isNew && targetFolder === 'INBOX' && !savedEmail.isRead && this.broadcastCb) {
                    this.broadcastCb('new_email', savedEmail);
                  }
                  syncedCount++;
                } catch (itemErr) {
                  console.warn('Failed to process message:', itemErr);
                }
              }
            }

            // Synchronize read/unread flags between local SQLite and remote server
            if (allUids.length > 0) {
              syncFolderReadFlags(account.id, targetFolder, unseenUids, allUids, minUid);
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
      if (client) await client.logout().catch(() => {});
    }

    return { syncedCount };
  }

  public static async syncMailbox(accountId: string, mailboxPath: string): Promise<{ syncedCount: number }> {
    const account = getAccountById(accountId);
    if (!account || account.provider === 'demo') return { syncedCount: 0 };

    let client: ImapFlow | null = null;
    let syncedCount = 0;

    try {
      client = await this.connectClient(account);
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        let uids: number[] = [];
        try {
          const searchResult = await client.search({ all: true }, { uid: true });
          if (Array.isArray(searchResult)) uids = searchResult;
        } catch {}

        const { folder: targetFolder, isCustom } = this.mapMailboxToFolder({ path: mailboxPath, name: mailboxPath });

        const latestUids = uids.slice(-50);
        const minUid = latestUids[0] || 1;
        if (latestUids.length > 0) {
          pruneMissingServerUids(account.id, mailboxPath, latestUids, minUid, targetFolder);
        } else {
          pruneMissingServerUids(account.id, mailboxPath, [], 1, targetFolder);
        }

        const messages = latestUids.length > 0
          ? client.fetch(latestUids, {
              envelope: true,
              flags: true,
              bodyStructure: true,
              source: true,
              uid: true,
            }, { uid: true })
          : [];

        for await (const message of messages) {
          try {
            const env = message.envelope;
            const rawMid = env?.messageId || undefined;
            const emailId = rawMid
              ? `imap-${account.id}-${encodeURIComponent(rawMid)}`
              : `imap-${account.id}-${mailboxPath}-${message.uid || uuidv4()}`;

            if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, rawMid, account.id, message.uid, mailboxPath)) {
              continue;
            }

            let parsed: ParsedMail | null = null;
            if (message.source) {
              try { parsed = await simpleParser(message.source); } catch {}
            }

            const messageId = parsed?.messageId || rawMid || undefined;
            if (targetFolder !== 'TRASH' && isDeletedLocally(emailId, messageId, account.id, message.uid, mailboxPath)) {
              continue;
            }

            const attachments: Attachment[] = (parsed?.attachments || []).map(att => ({
              id: uuidv4(),
              filename: att.filename || 'ek_dosya',
              contentType: att.contentType,
              size: att.size,
              isInline: att.related,
              contentId: att.cid,
              contentBase64: att.content ? att.content.toString('base64') : undefined
            }));

            const fromName = parsed?.from?.value[0]?.name || parsed?.from?.text || env?.from?.[0]?.name || 'Bilinmeyen Gönderici';
            const fromEmail = parsed?.from?.value[0]?.address || env?.from?.[0]?.address || 'unknown@example.com';
            const subject = parsed?.subject || env?.subject || '(Konusuz)';
            const bodyText = parsed?.text || '';
            const bodyHtml = parsed?.html || `<p>${bodyText || subject || ''}</p>`;
            const snippet = (bodyText || subject).substring(0, 150).replace(/\s+/g, ' ');
            const date = (parsed?.date || env?.date || new Date()).toISOString();

            const to = parsed?.to
              ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((t: any) => (t.value || []).map((v: any) => ({ name: v.name || '', email: v.address || '' })))
              : (env?.to || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

            const cc = parsed?.cc
              ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((t: any) => (t.value || []).map((v: any) => ({ name: v.name || '', email: v.address || '' })))
              : (env?.cc || []).map((t: any) => ({ name: t.name || '', email: t.address || '' }));

            const email: Email = {
              id: emailId,
              accountId: account.id,
              threadId: messageId ? `thread-${messageId}` : `thread-${emailId}`,
              messageId,
              inReplyTo: parsed?.inReplyTo || env?.inReplyTo || undefined,
              references: Array.isArray(parsed?.references) ? parsed.references.join(' ') : (parsed?.references || undefined),
              fromName,
              fromEmail,
              to,
              cc,
              bcc: [],
              subject,
              bodyText,
              bodyHtml,
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
              mailboxPath,
              aiSummary: null,
              aiSmartReplies: null
            };

            const { email: savedEmail, isNew } = saveEmailWithStatus(email, true);
            if (isNew && targetFolder === 'INBOX' && !savedEmail.isRead && this.broadcastCb) {
              this.broadcastCb('new_email', savedEmail);
            }
            syncedCount++;
          } catch (itemErr) {
            console.warn('Failed to process custom folder message:', itemErr);
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.warn(`Could not sync mailbox ${mailboxPath}:`, err);
    } finally {
      if (client) await client.logout().catch(() => {});
    }

    return { syncedCount };
  }

  private static syncingAccounts = new Set<string>();
  private static autoSyncTimer: NodeJS.Timeout | null = null;
  private static broadcastCb: ((event: string, data: any) => void) | null = null;

  public static startAutoSyncEngine(broadcast: (event: string, data: any) => void) {
    this.broadcastCb = broadcast;
    if (this.autoSyncTimer) return;

    // Run initial sync after 2 seconds
    setTimeout(() => {
      this.runBackgroundSyncCycle();
    }, 2000);

    // Fast 15-second continuous sync cycle
    this.autoSyncTimer = setInterval(() => {
      this.runBackgroundSyncCycle();
    }, 15000);
  }

  public static async runBackgroundSyncCycle() {
    try {
      const accounts = getAccounts().filter(a => a.provider !== 'demo' && a.imapHost && a.imapPassword);
      for (const acc of accounts) {
        if (this.syncingAccounts.has(acc.id)) continue;
        this.syncingAccounts.add(acc.id);
        (async () => {
          try {
            const result = await this.syncAccount(acc.id);
            if (this.broadcastCb) {
              this.broadcastCb('emails_synced', { accountId: acc.id, ...result });
            }
          } catch {
            // silent background sync
          } finally {
            this.syncingAccounts.delete(acc.id);
          }
        })();
      }
    } catch {}
  }
}
