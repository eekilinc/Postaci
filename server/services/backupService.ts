import { exportData, restoreData } from './db.js';
import { encryptBackup, decryptBackup } from './secrets.js';
import { getPreferences, savePreferences } from './preferences.js';
import { filterPreferences } from '../../shared/preferences.js';

export class BackupService {
  public static createBackup(passphrase: string, preferences?: unknown) {
    const payload = {
      app: 'Postacı', version: 2, timestamp: new Date().toISOString(),
      ...exportData(), preferences: { ...getPreferences(), ...filterPreferences(preferences) },
    };
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 32 * 1024 * 1024) throw new Error('Tam yedek 32 MB içerik sınırını aşıyor. Bu sürüm büyük arşivleri tek dosyada dışa aktarmıyor.');
    return encryptBackup(payload, passphrase);
  }
  public static restoreBackup(input: any, mode: string = 'merge', passphrase = '') {
    if (mode !== 'merge') throw new Error('Yalnızca mevcut verileri koruyan birleştirme desteklenir.');
    const payload = input?.format === 'postaci-encrypted' ? decryptBackup(input, passphrase) : input;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.accounts)) throw new Error('Geçersiz yedek dosyası.');
    if (payload.version !== undefined && ![2, '1.0.0'].includes(payload.version)) throw new Error('Bu yedek sürümü desteklenmiyor.');
    const result = restoreData(payload);
    const preferences = savePreferences(payload.preferences || {});
    return { success: true, ...result, preferences, message: result.restoredAccounts + ' hesap ve ' + result.restoredEmails + ' ileti; kişiler, takvim ve klasörlerle birlikte geri yüklendi.' };
  }
}
