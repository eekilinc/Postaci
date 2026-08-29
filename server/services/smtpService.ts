import nodemailer from 'nodemailer';
import { Account, Email, Attachment, EmailAddress } from '../types.js';
import { getAccountById, saveEmail } from './db.js';
import { v4 as uuidv4 } from 'uuid';

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
  private static createTransporter(account: Partial<Account>, overridePort?: number, overrideSecure?: boolean, overrideUser?: string): nodemailer.Transporter {
    const port = overridePort !== undefined ? overridePort : (account.smtpPort || (account.smtpSecure ? 465 : 587));
    // CRITICAL: Direct SSL/TLS is strictly for port 465. Port 587 and 25 must use STARTTLS (secure: false).
    const isDirectSsl = overrideSecure !== undefined 
      ? overrideSecure 
      : (port === 465);

    if (account.authType === 'oauth2') {
      return nodemailer.createTransport({
        host: account.smtpHost || 'smtp.gmail.com',
        port,
        secure: isDirectSsl,
        auth: {
          type: 'OAuth2',
          user: account.email,
          clientId: account.oauthClientId,
          clientSecret: account.oauthClientSecret,
          refreshToken: account.oauthRefreshToken,
          accessToken: account.oauthAccessToken,
        },
        tls: {
          rejectUnauthorized: false,
          servername: account.smtpHost || 'smtp.gmail.com',
          minVersion: 'TLSv1.2'
        },
      });
    }

    const username = overrideUser || account.smtpUser || account.imapUser || account.email!;
    const password = account.smtpPassword || account.imapPassword || '';

    return nodemailer.createTransport({
      host: account.smtpHost,
      port,
      secure: isDirectSsl, // true for 465 (SMTPS), false for 587/25 (STARTTLS)
      requireTLS: !isDirectSsl && port === 587,
      auth: {
        user: username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
        servername: account.smtpHost,
        minVersion: 'TLSv1.2'
      },
    });
  }

  public static async testConnection(account: Partial<Account>): Promise<{ success: boolean; message: string }> {
    if (account.provider === 'demo') {
      return { success: true, message: 'Demo SMTP bağlantısı başarılı!' };
    }

    const host = account.smtpHost || account.imapHost;
    const password = account.smtpPassword || account.imapPassword;
    const email = account.email || '';
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const user = account.smtpUser || account.imapUser || email;

    if (!host || !user || !password) {
      return { success: false, message: 'Lütfen SMTP sunucu adresi ve hesap şifresi alanlarını doldurun.' };
    }

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

    let lastErrorMsg = '';

    for (const u of userCandidates) {
      for (const p of uniquePorts) {
        try {
          const transporter = this.createTransporter(accountWithFallback, p.port, p.secure, u);
          await transporter.verify();
          return {
            success: true,
            message: `SMTP (${p.secure ? 'SSL' : 'STARTTLS'}, Port ${p.port}, Kullanıcı: ${u}) başarıyla doğrulandı!`
          };
        } catch (err: any) {
          lastErrorMsg = err.message || String(err);
        }
      }
    }

    let msg = lastErrorMsg;
    if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted') || msg.includes('535') || msg.includes('BadCredentials')) {
      msg = 'SMTP Kimlik Doğrulama Başarısız: Kullanıcı adı veya şifre sunucu tarafından reddedildi. Google / Yahoo / Apple için Uygulama Şifresi kullanınız.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      msg = `SMTP sunucu adresi (${host}) bulunamadı.`;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      msg = `SMTP sunucusuna (${host}) bağlanılamadı. Port veya güvenlik ayarını kontrol edin.`;
    }
    return { success: false, message: msg };
  }

  public static async sendMail(params: SendMailParams): Promise<Email> {
    const account = getAccountById(params.accountId);
    if (!account) {
      throw new Error('Gönderici hesabı bulunamadı.');
    }

    const emailId = `sent-${uuidv4()}`;
    const threadId = params.threadId || `thread-${emailId}`;
    const now = new Date().toISOString();

    const host = account.smtpHost || account.imapHost;
    const password = account.smtpPassword || account.imapPassword;
    const email = account.email || '';
    const prefix = email.includes('@') ? email.split('@')[0] : '';
    const user = account.smtpUser || account.imapUser || email;

    // If it's a real SMTP account, send via Nodemailer
    if (account.provider !== 'demo' && host && user && password) {
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
            const transporter = this.createTransporter(accountWithFallback, p.port, p.secure, u);
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
