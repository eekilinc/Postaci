import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite } from './secrets.js';
import { dataDir } from './storagePaths.js';

interface RecordEntry { hash: string; state: 'pending' | 'sent' | 'uncertain'; resultId?: string; at: number }
export class DeliveryGuard<T extends { id: string }> {
  private records: Record<string, RecordEntry>;
  private pending = new Map<string, Promise<T>>();
  constructor(private file: string, private findResult: (id: string) => T | undefined) {
    this.records = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }
  async run(key: string, payload: unknown, send: () => Promise<T>): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new Error('Geçersiz gönderim kimliği.');
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const old = this.records[key];
    if (old && old.hash !== hash) throw new Error('Bu gönderim kimliği farklı içerikle kullanılmış.');
    if (this.pending.has(key)) return this.pending.get(key)!;
    if (old?.state === 'sent') {
      const result = this.findResult(old.resultId!);
      if (result) return result;
      throw new Error('Bu ileti daha önce gönderilmiş. Yeniden gönderilmedi.');
    }
    if (old) throw new Error('Önceki gönderimin sonucu belirsiz. Tekrar göndermeden önce Gönderilenler klasörünü kontrol edin.');
    this.records[key] = { hash, state: 'pending', at: Date.now() };
    atomicWrite(this.file, JSON.stringify(this.records));
    const operation = (async () => {
      try {
        const result = await send();
        this.records[key] = { hash, state: 'sent', resultId: result.id, at: Date.now() };
        atomicWrite(this.file, JSON.stringify(this.records));
        return result;
      } catch (err) {
        this.records[key].state = 'uncertain';
        atomicWrite(this.file, JSON.stringify(this.records));
        throw err;
      } finally { this.pending.delete(key); }
    })();
    this.pending.set(key, operation);
    return operation;
  }
}
export const deliveryJournalPath = path.join(dataDir, 'delivery-journal.json');
