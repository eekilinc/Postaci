import { getAccounts, createAccount, updateAccount, getEmails, getFolderStats, getServerFolders, jsonDbPath } from './db.js';
import fs from 'fs';
import path from 'path';

export interface FullBackupPayload {
  version: string;
  timestamp: string;
  app: string;
  accounts: any[];
  customFolders?: any[];
  preferences?: Record<string, any>;
  stats?: any[];
}

export class BackupService {
  public static createBackup(): FullBackupPayload {
    const accounts = getAccounts();
    const customFolders = getServerFolders();
    const stats = getFolderStats();

    // Read stored preferences from JSON store if exists
    let preferences: any = {};
    try {
      if (fs.existsSync(jsonDbPath)) {
        const raw = JSON.parse(fs.readFileSync(jsonDbPath, 'utf-8'));
        preferences = raw.settings || {};
      }
    } catch {}

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      app: 'Postacı',
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        email: a.email,
        provider: a.provider,
        imapHost: a.imapHost,
        imapPort: a.imapPort,
        imapUser: a.imapUser,
        imapPassword: a.imapPassword,
        imapSecure: a.imapSecure,
        smtpHost: a.smtpHost,
        smtpPort: a.smtpPort,
        smtpUser: a.smtpUser,
        smtpPassword: a.smtpPassword,
        smtpSecure: a.smtpSecure,
        isDefault: a.isDefault,
        color: a.color,
        signature: a.signature,
        syncInterval: a.syncInterval
      })),
      customFolders,
      preferences,
      stats
    };
  }

  public static restoreBackup(payload: FullBackupPayload, mode: 'merge' | 'replace' = 'merge'): {
    success: boolean;
    restoredAccounts: number;
    message: string;
  } {
    if (!payload || !Array.isArray(payload.accounts)) {
      throw new Error('Geçersiz yedek dosyası formatı.');
    }

    let restoredAccounts = 0;
    const existingAccounts = getAccounts();

    for (const acc of payload.accounts) {
      if (!acc.email) continue;
      
      const exists = existingAccounts.find(e => e.id === acc.id || e.email.toLowerCase() === acc.email.toLowerCase());
      if (exists && mode === 'merge') {
        updateAccount(exists.id, acc);
      } else {
        createAccount(acc);
      }
      restoredAccounts++;
    }

    return {
      success: true,
      restoredAccounts,
      message: `${restoredAccounts} e-posta hesabı ve sistem ayarları başarıyla geri yüklendi.`
    };
  }
}
