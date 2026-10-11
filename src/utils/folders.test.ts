// src/utils/folders.test.ts — klasör rol eşleme + tekilleştirme birim testleri
import { describe, expect, it } from 'vitest';
import { getFolderRole, organizeAndDeduplicateFolders } from './folders';
import type { Folder } from '../types';

function f(path: string, name?: string, flags: string[] = []): Folder {
  return { path, name: name ?? path, flags };
}

describe('getFolderRole', () => {
  it('INBOX varyantlarını inbox sayar', () => {
    expect(getFolderRole(f('INBOX'))).toBe('inbox');
    expect(getFolderRole(f('INBOX', 'Gelen Kutusu'))).toBe('inbox');
    expect(getFolderRole(f('INBOX', 'INBOX', ['\\Inbox']))).toBe('inbox');
  });

  it('Gmail sistem klasörlerini doğru role koyar', () => {
    expect(getFolderRole(f('[Gmail]/Sent Mail', '[Gmail]/Sent Mail', ['\\Sent']))).toBe('sent');
    expect(getFolderRole(f('[Gmail]/Taslaklar', '[Gmail]/Taslaklar', ['\\Drafts']))).toBe('drafts');
    expect(getFolderRole(f('[Gmail]/Çöp kutusu', '[Gmail]/Çöp kutusu', ['\\Trash']))).toBe('trash');
    expect(getFolderRole(f('[Gmail]/Spam', '[Gmail]/Spam', ['\\Junk']))).toBe('junk');
    expect(getFolderRole(f('[Gmail]/Tüm Postalar', '[Gmail]/Tüm Postalar', ['\\All']))).toBe('archive');
    expect(getFolderRole(f('[Gmail]/Starred', '[Gmail]/Starred', ['\\Flagged']))).toBe('starred');
  });

  it('İngilizce Gmail adlarını da tanır', () => {
    expect(getFolderRole(f('[Gmail]/Drafts', '[Gmail]/Drafts', ['\\Drafts']))).toBe('drafts');
    expect(getFolderRole(f('[Gmail]/Trash', '[Gmail]/Trash', ['\\Trash']))).toBe('trash');
    expect(getFolderRole(f('[Gmail]/All Mail', '[Gmail]/All Mail', ['\\All']))).toBe('archive');
  });

  it('özel etiketleri custom sayar', () => {
    expect(getFolderRole(f('Faturalar', 'Faturalar', []))).toBe('custom');
    expect(getFolderRole(f('INBOX.Eski', 'Eski', []))).toBe('custom');
  });
});

describe('organizeAndDeduplicateFolders', () => {
  it('[Gmail] konteynerini ve Noselect klasörleri eler', () => {
    const out = organizeAndDeduplicateFolders(
      [f('[Gmail]', '[Gmail]', []), f('[Gmail]/Kök', '[Gmail]/Kök', ['\\Noselect']), f('INBOX')],
      'INBOX',
      true,
      'tr',
    );
    expect(out.allDisplayFolders.some((x) => x.path === '[Gmail]')).toBe(false);
    expect(out.allDisplayFolders.some((x) => x.path === '[Gmail]/Kök')).toBe(false);
    expect(out.systemFolders.some((x) => x.role === 'inbox')).toBe(true);
  });

  it('yinelenen taslak adlarını tekler (Drafts + Taslaklar)', () => {
    const out = organizeAndDeduplicateFolders(
      [f('INBOX'), f('[Gmail]/Drafts', '[Gmail]/Drafts', ['\\Drafts']), f('[Gmail]/Taslaklar', '[Gmail]/Taslaklar', ['\\Drafts'])],
      'INBOX',
      true,
      'tr',
    );
    expect(out.systemFolders.filter((x) => x.role === 'drafts')).toHaveLength(1);
  });

  it('taslak yoksa sanal taslak satırı ekler', () => {
    const out = organizeAndDeduplicateFolders([f('INBOX')], 'INBOX', true, 'tr');
    const drafts = out.systemFolders.find((x) => x.role === 'drafts');
    expect(drafts).toBeDefined();
    expect(drafts?.path).toBe('[Gmail]/Taslaklar');
  });

  it('sistem klasörlerini standart sırada dizer (inbox önce)', () => {
    const out = organizeAndDeduplicateFolders(
      [f('[Gmail]/Spam', '[Gmail]/Spam', ['\\Junk']), f('INBOX'), f('[Gmail]/Taslaklar', '[Gmail]/Taslaklar', ['\\Drafts'])],
      'INBOX',
      true,
      'tr',
    );
    const roles = out.systemFolders.map((x) => x.role);
    expect(roles[0]).toBe('inbox');
    expect(roles).toContain('drafts');
    expect(roles).toContain('junk');
  });

  // ── KULLANICI VAKASI (v1.0.65 sonrası teşhis): "rozet 1 diyor, klasörü
  // açıyorum, eşleşiyor ve 0" ─────────────────────────────────────────────
  // Kurumsal sunucular aynı role iki klasör döndürebilir (ör. boş "Spam" +
  // asıl iletiyi tutan "Junk E-mail"). Eski puanlamada isim bonusu (+30)
  // okunmamış-içerik bonusundan (+15) büyük olduğundan BOŞ klasör kazanıyordu;
  // rozet ise TOPLAMI gösteriyordu. Sonuç: rozet 1, tıklama boş klasörü açıyor,
  // asıl iletiyi tutan klasör nav'da görünmez — ileti kayıp.
  it('iki junk klasöründe İÇERİĞİ OLAN kazanır (boş isim-favorisi değil)', () => {
    const out = organizeAndDeduplicateFolders(
      [
        f('INBOX'),
        { path: 'Spam', name: 'Spam', flags: [], unread_count: 0 },
        { path: 'Junk E-mail', name: 'Junk E-mail', flags: [], unread_count: 1 },
      ] as Folder[],
      'INBOX',
      false,
      'tr',
    );
    const junk = out.systemFolders.find((x) => x.role === 'junk');
    expect(junk?.path).toBe('Junk E-mail');
    expect(junk?.unread_count).toBe(1);
  });

  it('bayraklı ama BOŞ junk yerine bayraksız ama DOLU junk kazanır', () => {
    const out = organizeAndDeduplicateFolders(
      [
        f('INBOX'),
        { path: 'Spam', name: 'Spam', flags: ['\\Junk'], unread_count: 0 },
        { path: 'Junk E-mail', name: 'Junk E-mail', flags: [], unread_count: 1 },
      ] as Folder[],
      'INBOX',
      false,
      'tr',
    );
    const junk = out.systemFolders.find((x) => x.role === 'junk');
    // \Junk bayrağı güçlü bir sinyaldir ama İÇERİK ondan da üstündür:
    // iletiyi tutmayan klasörü öne çıkarmak e-postayı görünmez yapar.
    expect(junk?.path).toBe('Junk E-mail');
  });

  it('rozet kazananın KENDİ sayısını gösterir, adayların toplamını değil', () => {
    const out = organizeAndDeduplicateFolders(
      [
        f('INBOX'),
        { path: 'Spam', name: 'Spam', flags: [], unread_count: 3 },
        { path: 'Junk E-mail', name: 'Junk E-mail', flags: [], unread_count: 2 },
      ] as Folder[],
      'INBOX',
      false,
      'tr',
    );
    const junk = out.systemFolders.find((x) => x.role === 'junk');
    expect(junk?.path).toBe('Spam'); // isim bonusu + içerik bonusuyla kazanır
    // Rozet 5 (toplam) DEĞİL, 3: tıklanınca açılan klasörün gerçeği.
    // Toplam göstermek "rozet 5 ama klasörde 3" yanılsaması yaratıyordu.
    expect(junk?.unread_count).toBe(3);
  });

  it('tek junk klasöründe rozet aynen korunur (regresyon)', () => {
    const out = organizeAndDeduplicateFolders(
      [f('INBOX'), { path: 'Spam', name: 'Spam', flags: ['\\Junk'], unread_count: 7 } as Folder],
      'INBOX',
      false,
      'tr',
    );
    expect(out.systemFolders.find((x) => x.role === 'junk')?.unread_count).toBe(7);
  });
});
