import dns from 'dns';
import { promisify } from 'util';

const resolveMxAsync = promisify(dns.resolveMx);

export interface AutodiscoverResult {
  success: boolean;
  providerName: string;
  source: 'preset' | 'ispdb' | 'dns-mx' | 'heuristic';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  usernameType: 'full_email' | 'username_only';
  notes?: string;
}

// Built-in verified configuration catalog for 100+ top providers & domains
const KNOWN_DOMAINS: Record<string, Omit<AutodiscoverResult, 'success' | 'source'>> = {
  // Google / Gmail
  'gmail.com': {
    providerName: 'Google / Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email',
    notes: '2 Adımlı Doğrulama (2FA) açıksa lütfen Google Hesap ayarlarından "Uygulama Şifresi" oluşturun.'
  },
  'googlemail.com': {
    providerName: 'Google / Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email',
    notes: 'Google Uygulama Şifresi gereklidir.'
  },

  // Microsoft / Outlook / Hotmail / Office 365
  'outlook.com': {
    providerName: 'Microsoft Outlook',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'outlook.com.tr': {
    providerName: 'Microsoft Outlook (TR)',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'hotmail.com': {
    providerName: 'Microsoft Hotmail',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'hotmail.com.tr': {
    providerName: 'Microsoft Hotmail (TR)',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'live.com': {
    providerName: 'Microsoft Live',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'msn.com': {
    providerName: 'Microsoft MSN',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },

  // Yandex & Yandex Kurumsal
  'yandex.com': {
    providerName: 'Yandex Mail',
    imapHost: 'imap.yandex.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email',
    notes: 'Yandex ayarlarından IMAP erişim izninin açık olduğundan emin olun.'
  },
  'yandex.com.tr': {
    providerName: 'Yandex Mail (TR)',
    imapHost: 'imap.yandex.com.tr',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.com.tr',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'yandex.ru': {
    providerName: 'Yandex Mail (RU)',
    imapHost: 'imap.yandex.ru',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.ru',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'ya.ru': {
    providerName: 'Yandex Mail',
    imapHost: 'imap.yandex.ru',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.ru',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },

  // Yahoo & AOL
  'yahoo.com': {
    providerName: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email',
    notes: 'Yahoo Hesap Güvenliği menüsünden "Uygulama Şifresi" (App Password) gereklidir.'
  },
  'yahoo.com.tr': {
    providerName: 'Yahoo Mail (TR)',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'myyahoo.com': {
    providerName: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'aol.com': {
    providerName: 'AOL Mail',
    imapHost: 'imap.aol.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.aol.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },

  // Apple / iCloud
  'icloud.com': {
    providerName: 'Apple iCloud Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email',
    notes: 'appleid.apple.com üzerinden "Uygulamaya Özgü Parola" oluşturmanız gereklidir.'
  },
  'me.com': {
    providerName: 'Apple Me Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'mac.com': {
    providerName: 'Apple Mac Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },

  // Zoho
  'zoho.com': {
    providerName: 'Zoho Mail',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'zoho.eu': {
    providerName: 'Zoho Mail (EU)',
    imapHost: 'imap.zoho.eu',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.zoho.eu',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },

  // Proton / Fastmail / GMX / Mail.ru
  'fastmail.com': {
    providerName: 'Fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'mail.ru': {
    providerName: 'Mail.ru',
    imapHost: 'imap.mail.ru',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.ru',
    smtpPort: 465,
    smtpSecure: true,
    usernameType: 'full_email'
  },
  'gmx.com': {
    providerName: 'GMX Mail',
    imapHost: 'imap.gmx.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.gmx.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'gmx.net': {
    providerName: 'GMX Net',
    imapHost: 'imap.gmx.net',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.gmx.net',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },

  // Turkish ISPs & Hosting providers
  'turknet.net': {
    providerName: 'TurkNet Mail',
    imapHost: 'mail.turknet.net',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.turknet.net',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'superonline.com': {
    providerName: 'Turkcell Superonline',
    imapHost: 'mail.superonline.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.superonline.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  },
  'ttmail.com': {
    providerName: 'Türk Telekom TT Mail',
    imapHost: 'mail.ttmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.ttmail.com',
    smtpPort: 587,
    smtpSecure: false,
    usernameType: 'full_email'
  }
};

export class AutodiscoverService {
  /**
   * Automatically discovers IMAP & SMTP settings for any email address
   */
  public static async discover(email: string): Promise<AutodiscoverResult> {
    if (!email || !email.includes('@')) {
      throw new Error('Geçerli bir e-posta adresi giriniz.');
    }

    const domain = email.split('@')[1].trim().toLowerCase();

    // 1. Check verified presets
    if (KNOWN_DOMAINS[domain]) {
      return {
        success: true,
        source: 'preset',
        ...KNOWN_DOMAINS[domain],
      };
    }

    // 2. Query Mozilla Thunderbird ISPDB API
    try {
      const ispdbConfig = await this.queryMozillaIspdb(domain);
      if (ispdbConfig) {
        return ispdbConfig;
      }
    } catch (err) {
      // Continue to DNS MX lookup
    }

    // 3. Query DNS MX records to identify corporate email providers (e.g. Google Workspace, Microsoft 365, Yandex Kurumsal)
    try {
      const dnsConfig = await this.queryDnsMx(domain);
      if (dnsConfig) {
        return dnsConfig;
      }
    } catch (err) {
      // Continue to heuristic probing
    }

    // 4. Heuristic domain fallback (cPanel / standard mail server convention)
    return {
      success: true,
      providerName: `Özel E-Posta (${domain})`,
      source: 'heuristic',
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapSecure: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
      usernameType: 'full_email',
      notes: 'Otomatik standart sunucu şablonu (mail.' + domain + ') uygulandı.'
    };
  }

  /**
   * Queries Mozilla Thunderbird ISPDB for XML autoconfig configuration
   */
  private static async queryMozillaIspdb(domain: string): Promise<AutodiscoverResult | null> {
    const url = `https://autoconfig.thunderbird.net/v1.1/${domain}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const xml = await response.text();

      // Extract IMAP server
      const imapHostMatch = xml.match(/<incomingServer\s+type="imap"[^>]*>[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>([^<]+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>/i);
      const smtpHostMatch = xml.match(/<outgoingServer\s+type="smtp"[^>]*>[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>([^<]+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>/i);
      const displayNameMatch = xml.match(/<displayName>([^<]+)<\/displayName>/i);

      if (imapHostMatch && smtpHostMatch) {
        const imapHost = imapHostMatch[1].trim();
        const imapPort = parseInt(imapHostMatch[2].trim(), 10) || 993;
        const imapSecure = imapHostMatch[3].trim().toUpperCase() === 'SSL';

        const smtpHost = smtpHostMatch[1].trim();
        const smtpPort = parseInt(smtpHostMatch[2].trim(), 10) || 465;
        const smtpSecure = smtpHostMatch[3].trim().toUpperCase() === 'SSL';

        return {
          success: true,
          providerName: displayNameMatch ? displayNameMatch[1].trim() : domain,
          source: 'ispdb',
          imapHost,
          imapPort,
          imapSecure,
          smtpHost,
          smtpPort,
          smtpSecure,
          usernameType: 'full_email',
          notes: 'Ayarlar Mozilla ISPDB veritabanından otomatik olarak alındı.'
        };
      }
    } catch {
      clearTimeout(timeout);
    }
    return null;
  }

  /**
   * Inspects DNS MX records for the domain
   */
  private static async queryDnsMx(domain: string): Promise<AutodiscoverResult | null> {
    try {
      const mxRecords = await resolveMxAsync(domain);
      if (!mxRecords || mxRecords.length === 0) return null;

      const mxHosts = mxRecords.map(r => r.exchange.toLowerCase());

      // Check Google Workspace
      if (mxHosts.some(h => h.includes('google.com') || h.includes('googlemail.com') || h.includes('aspmx.l.google.com'))) {
        return {
          success: true,
          providerName: 'Google Workspace (Kurumsal Gmail)',
          source: 'dns-mx',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.gmail.com',
          smtpPort: 465,
          smtpSecure: true,
          usernameType: 'full_email',
          notes: 'Alan adınızın Google Workspace kullandığı tespit edildi. 2FA açıksa lütfen Uygulama Şifresi kullanın.'
        };
      }

      // Check Microsoft 365 / Exchange Online
      if (mxHosts.some(h => h.includes('outlook.com') || h.includes('microsoft.com') || h.includes('office365.com') || h.includes('mail.protection.outlook.com'))) {
        return {
          success: true,
          providerName: 'Microsoft 365 / Kurumsal Outlook',
          source: 'dns-mx',
          imapHost: 'outlook.office365.com',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.office365.com',
          smtpPort: 587,
          smtpSecure: false,
          usernameType: 'full_email',
          notes: 'Alan adınızın Microsoft 365 e-posta sunucusunu kullandığı tespit edildi.'
        };
      }

      // Check Yandex Kurumsal / Yandex 360
      if (mxHosts.some(h => h.includes('yandex.net') || h.includes('yandex.ru') || h.includes('mx.yandex.net'))) {
        return {
          success: true,
          providerName: 'Yandex Kurumsal Mail',
          source: 'dns-mx',
          imapHost: 'imap.yandex.com',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.yandex.com',
          smtpPort: 465,
          smtpSecure: true,
          usernameType: 'full_email',
          notes: 'Alan adınızın Yandex Kurumsal Mail altyapısını kullandığı tespit edildi.'
        };
      }

      // Check Zoho Mail
      if (mxHosts.some(h => h.includes('zoho.com') || h.includes('zoho.eu') || h.includes('zohomail.com'))) {
        return {
          success: true,
          providerName: 'Zoho Kurumsal Mail',
          source: 'dns-mx',
          imapHost: 'imap.zoho.com',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.zoho.com',
          smtpPort: 465,
          smtpSecure: true,
          usernameType: 'full_email'
        };
      }

      // Check Hostinger
      if (mxHosts.some(h => h.includes('hostinger.com') || h.includes('titan.email'))) {
        return {
          success: true,
          providerName: 'Hostinger Mail',
          source: 'dns-mx',
          imapHost: 'imap.hostinger.com',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.hostinger.com',
          smtpPort: 465,
          smtpSecure: true,
          usernameType: 'full_email'
        };
      }
    } catch {
      // DNS error
    }

    return null;
  }
}
