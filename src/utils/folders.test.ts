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
});
