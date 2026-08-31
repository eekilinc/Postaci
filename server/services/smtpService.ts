import nodemailer from 'nodemailer';
import { Account, Email, Attachment, EmailAddress } from '../types.js';
import { getAccountById, getAccounts, saveEmail } from './db.js';
import { OAuthService } from './oauthService.js';
import { v4 as uuidv4 } from 'uuid';
import dns from 'dns';
import { promisify } from 'util';

const resolveMxAsync = promisify(dns.resolveMx);

export interface SendMailParams {
  accountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments?: Attachment[];
  priority?: 'normal' | 'high';
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export class SmtpService {
  private static async createTransporter(account: Partial<Account>, overridePort?: number, overrideSecure?: boolean, overrideUser?: string): Promise<nodemailer.Transporter> {
    if (account.authType === 'oauth2' || account.oauthRefreshToken || account.oauthAccessToken) {
      const fullAcc = account as Account;
      const accessToken = await OAuthService.refreshGoogleToken(fullAcc);
      const creds = OAuthService.getCredentials();
      const clientId = fullAcc.oauthClientId || creds.googleClientId;
      const clientSecret = fullAcc.oauthClientSecret || creds.googleClientSecret;

      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: fullAcc.email,
          clientId,
          clientSecret,
          refreshToken: fullAcc.oauthRefreshToken,
          accessToken,
        },
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        }
      });
    }

    const port = overridePort !== undefined ? overridePort : (account.smtpPort || (account.smtpSecure ? 465 : 587));
    // CRITICAL: Direct SSL/TLS is strictly for port 465. Port 587 and 25 must use STARTTLS (secure: false).
    const isDirectSsl = overrideSecure !== undefined 
      ? overrideSecure 
      : (port === 465);

    return nodemailer.createTransport({
      host: account.smtpHost || (account.provider === 'gmail' ? 'smtp.gmail.com' : account.imapHost),
      port,
      secure: isDirectSsl,
      auth: {
        user: overrideUser || account.smtpUser || account.imapUser || account.email!,
        pass: account.smtpPassword || account.imapPassword || '',
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
    });
  }

  public static async testConnection(account: Partial<Account>): Promise<{
    success: boolean;
    message: string;
    suggestedSmtpHost?: string;
    suggestedSmtpUser?: string;
    suggestedSmtpPort?: number;
    suggestedSmtpSecure?: boolean;
  }> {
    if (account.provider === 'demo') {
      return { success: true, message: 'Demo SMTP bağlantısı başarılı!' };
    }

    const email = (account.email || '').trim();
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const domain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';

    const rawHost = (account.smtpHost || account.imapHost || '').trim();
    const password = account.smtpPassword || account.imapPassword || '';
    const user = (account.smtpUser || account.imapUser || email).trim();

    if (!rawHost || !user || !password) {
      return { success: false, message: 'Lütfen SMTP sunucu adresi ve hesap şifresi alanlarını doldurun.' };
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

    const requestedPort = extractedPort || account.smtpPort || (account.smtpSecure ? 465 : 587);
    const requestedSecure = requestedPort === 465;

    const attemptVerify = async (host: string, port: number, secure: boolean, u: string, timeoutMs = 3500) => {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: u,
          pass: password,
        },
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs + 1000,
      });

      try {
        await transporter.verify();
        return { ok: true as const };
      } catch (err: any) {
        return { ok: false as const, error: err };
      }
    };

    // 1. PRIMARY FAST ATTEMPT: User's exact configured host, port and user
    const primaryRes = await attemptVerify(baseHost, requestedPort, requestedSecure, user, 3500);
    if (primaryRes.ok) {
      return {
        success: true,
        message: `SMTP (${requestedSecure ? 'SSL' : 'STARTTLS'}, Port ${requestedPort}, Sunucu: ${baseHost}) başarıyla doğrulandı!`,
        suggestedSmtpHost: baseHost,
        suggestedSmtpUser: user,
        suggestedSmtpPort: requestedPort,
        suggestedSmtpSecure: requestedSecure,
      };
    }

    let lastErrorMsg = primaryRes.error?.message || String(primaryRes.error);

    // 2. If failure is authentication, try prefix user if different
    if ((lastErrorMsg.includes('Invalid login') || lastErrorMsg.includes('535') || lastErrorMsg.includes('BadCredentials')) && prefix && prefix !== user) {
      const userRes = await attemptVerify(baseHost, requestedPort, requestedSecure, prefix, 3000);
      if (userRes.ok) {
        return {
          success: true,
          message: `SMTP (${requestedSecure ? 'SSL' : 'STARTTLS'}, Port ${requestedPort}, Kullanıcı: ${prefix}) başarıyla doğrulandı!`,
          suggestedSmtpHost: baseHost,
          suggestedSmtpUser: prefix,
          suggestedSmtpPort: requestedPort,
          suggestedSmtpSecure: requestedSecure,
        };
      }
    }

    // 3. If port/connect failed, try alternative port (587 STARTTLS vs 465 SSL)
    const altPort = requestedPort === 587 ? 465 : 587;
    const altSecure = altPort === 465;
    if (!lastErrorMsg.includes('Invalid login') && !lastErrorMsg.includes('535')) {
      const portRes = await attemptVerify(baseHost, altPort, altSecure, user, 2500);
      if (portRes.ok) {
        return {
          success: true,
          message: `SMTP (${altSecure ? 'SSL' : 'STARTTLS'}, Port ${altPort}, Sunucu: ${baseHost}) başarıyla doğrulandı!`,
          suggestedSmtpHost: baseHost,
          suggestedSmtpUser: user,
          suggestedSmtpPort: altPort,
          suggestedSmtpSecure: altSecure,
        };
      }
    }

    // 4. If DNS failed (ENOTFOUND), try top 2 candidates with 2500ms timeout
    if (lastErrorMsg.includes('ENOTFOUND') || lastErrorMsg.includes('getaddrinfo')) {
      const candidateHosts: string[] = [];
      if (domain) {
        if (`smtp.${domain}` !== baseHost) candidateHosts.push(`smtp.${domain}`);
        if (`mail.${domain}` !== baseHost) candidateHosts.push(`mail.${domain}`);
      }

      for (const candHost of candidateHosts) {
        const candRes = await attemptVerify(candHost, 587, false, user, 2500);
        if (candRes.ok) {
          return {
            success: true,
            message: `SMTP (STARTTLS, Port 587, Sunucu: ${candHost}) başarıyla doğrulandı!`,
            suggestedSmtpHost: candHost,
            suggestedSmtpUser: user,
            suggestedSmtpPort: 587,
            suggestedSmtpSecure: false,
          };
        }
      }
    }

    let msg = lastErrorMsg;
    if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted') || msg.includes('535') || msg.includes('BadCredentials')) {
      msg = 'SMTP Kimlik Doğrulama Başarısız: Kullanıcı adı veya şifre sunucu tarafından reddedildi. Google / Yahoo / Apple için Uygulama Şifresi kullanınız.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      msg = `SMTP Sunucu Adresi Bulunamadı (DNS / ENOTFOUND): "${baseHost}" adresi internet üzerinde çözümlenemedi. Lütfen e-posta sağlayıcınızın verdiği giden posta sunucu adresini (Örn: smtp.alanadiniz.com veya mail.alanadiniz.com) kontrol ediniz.`;
    } else if (msg.includes('ETIMEDOUT')) {
      msg = `SMTP Sunucusuna Bağlantı Zaman Aşımına Uğradı (ETIMEDOUT): "${baseHost}" sunucusuna belirtilen porttan ulaşılamadı. Port (587 / 465) ayarlarını kontrol ediniz.`;
    } else if (msg.includes('ECONNREFUSED')) {
      msg = `SMTP Sunucusu Bağlantıyı Reddetti (ECONNREFUSED): "${baseHost}" sunucusu belirtilen porttan bağlantı kabul etmiyor.`;
    }

    return { success: false, message: msg };
  }

  public static async sendMail(params: SendMailParams): Promise<Email> {
    let account = params.accountId ? getAccountById(params.accountId) : undefined;
    if (!account) {
      const allAccounts = getAccounts();
      account = allAccounts.find(a => a.isDefault) || allAccounts[0];
    }
    if (!account) {
      throw new Error('Gönderici hesabı bulunamadı. Lütfen Ayarlar bölümünden bir e-posta hesabı ekleyin.');
    }

    const emailId = `sent-${uuidv4()}`;
    const threadId = params.threadId || `thread-${emailId}`;
    const now = new Date().toISOString();

    const host = account.smtpHost || (account.provider === 'gmail' ? 'smtp.gmail.com' : account.imapHost);
    const password = account.smtpPassword || account.imapPassword;
    const email = account.email || '';
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const user = account.smtpUser || account.imapUser || email;

    // If it's a real account (OAuth2 or standard SMTP), send via Nodemailer
    if (account.provider !== 'demo') {
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${account.name}" <${account.email}>`,
        to: params.to.map(t => (t.name ? `"${t.name}" <${t.email}>` : t.email)).join(', '),
        cc: params.cc?.map(c => (c.name ? `"${c.name}" <${c.email}>` : c.email)).join(', '),
        bcc: params.bcc?.map(b => (b.name ? `"${b.name}" <${b.email}>` : b.email)).join(', '),
        subject: params.subject,
        text: params.bodyText,
        html: params.bodyHtml,
        priority: params.priority === 'high' ? 'high' : 'normal',
        inReplyTo: params.inReplyTo,
        references: params.references,
        attachments: params.attachments?.map(att => ({
          filename: att.filename,
          content: att.contentBase64 ? Buffer.from(att.contentBase64, 'base64') : undefined,
          contentType: att.contentType,
        })),
      };

      if (account.authType === 'oauth2' || account.oauthRefreshToken || account.oauthAccessToken) {
        // Direct OAuth2 Sending (e.g. Gmail OAuth2)
        try {
          const transporter = await this.createTransporter(account);
          await transporter.sendMail(mailOptions);
        } catch (oauthErr: any) {
          console.error('Gmail OAuth2 SMTP send failed:', oauthErr);
          throw new Error(`Gmail ile e-posta gönderilemedi: ${oauthErr.message || 'OAuth yetkilendirme hatası'}`);
        }
      } else if (host && user && password) {
        const accountWithFallback: Partial<Account> = {
          ...account,
          smtpHost: host,
          smtpUser: user,
          smtpPassword: password,
        };

        const primaryPort = account.smtpPort || (account.smtpSecure ? 465 : 587);
        const primarySecure = primaryPort === 465;

        const userCandidates = [
          user,
          ...(email && email !== user ? [email] : []),
          ...(prefix && prefix !== user && prefix !== email ? [prefix] : [])
        ];

        const portCandidates = [
          { port: primaryPort, secure: primarySecure },
          { port: 587, secure: false },
          { port: 465, secure: true },
          { port: 25, secure: false },
        ];

        const uniquePorts = portCandidates.filter((v, i, a) => a.findIndex(t => t.port === v.port && t.secure === v.secure) === i);

        let sendSucceeded = false;
        let lastSendErr: any = null;

        for (const u of userCandidates) {
          if (sendSucceeded) break;
          for (const p of uniquePorts) {
            try {
              const transporter = await this.createTransporter(accountWithFallback, p.port, p.secure, u);
              await transporter.sendMail(mailOptions);
              sendSucceeded = true;
              break;
            } catch (err: any) {
              lastSendErr = err;
              console.warn(`SMTP send attempt on Port ${p.port} (${p.secure ? 'SSL' : 'STARTTLS'}) with user ${u} failed:`, err.message);
            }
          }
        }

        if (!sendSucceeded && lastSendErr) {
          console.error('SMTP Send completely failed after all fallbacks:', lastSendErr);
          let msg = lastSendErr.message || String(lastSendErr);
          if (msg.includes('535') || msg.includes('Invalid login') || msg.includes('BadCredentials')) {
            msg = 'SMTP Gönderim Hatası: Kullanıcı adı veya şifre reddedildi. Lütfen Uygulama Şifresi kullanın.';
          }
          throw new Error(msg);
        }
      } else {
        throw new Error('Gönderici hesabında SMTP sunucu adresi veya şifre eksik.');
      }
    }

    // Save to local SENT folder in SQLite
    const sentEmail: Email = {
      id: emailId,
      accountId: account.id,
      threadId,
      fromName: account.name,
      fromEmail: account.email,
      to: params.to,
      cc: params.cc || [],
      bcc: params.bcc || [],
      subject: params.subject,
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml,
      snippet: params.bodyText.substring(0, 150).replace(/\s+/g, ' '),
      date: now,
      isRead: true,
      isStarred: false,
      isArchived: false,
      isDeleted: false,
      isDraft: false,
      isSpam: false,
      folder: 'SENT',
      labels: ['Gönderilen'],
      priority: params.priority || 'normal',
      attachments: params.attachments || [],
      aiSummary: null,
      aiSmartReplies: null
    };

    return saveEmail(sentEmail);
  }
}
