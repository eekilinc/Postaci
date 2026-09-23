// src/utils/folders.ts — Klasör rolleri, tekilleştirme ve görsel organizasyon
import type { Folder } from '../types';

export type SystemRole = 'inbox' | 'starred' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive';

export interface ProcessedFolder extends Folder {
  displayName: string;
  icon: string;
  role: SystemRole | 'custom';
  order: number;
}

export const ROLE_INFO: Record<SystemRole, { name: string; icon: string; order: number }> = {
  inbox: { name: 'Gelen Kutusu', icon: '📥', order: 1 },
  starred: { name: 'Yıldızlı', icon: '⭐', order: 2 },
  sent: { name: 'Gönderilenler', icon: '📤', order: 3 },
  drafts: { name: 'Taslaklar', icon: '📝', order: 4 },
  trash: { name: 'Çöp Kutusu', icon: '🗑️', order: 5 },
  junk: { name: 'Spam', icon: '⚠️', order: 6 },
  archive: { name: 'Tüm Postalar', icon: '📦', order: 7 },
};

export const ROLE_NAMES: Record<'tr' | 'en', Record<SystemRole, string>> = {
  tr: {
    inbox: 'Gelen Kutusu',
    starred: 'Yıldızlı',
    sent: 'Gönderilenler',
    drafts: 'Taslaklar',
    trash: 'Çöp Kutusu',
    junk: 'Spam',
    archive: 'Tüm Postalar',
  },
  en: {
    inbox: 'Inbox',
    starred: 'Starred',
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash',
    junk: 'Spam',
    archive: 'All Mail',
  },
};

export function getRoleName(role: SystemRole, lang: 'tr' | 'en' = 'tr'): string {
  return ROLE_NAMES[lang]?.[role] || ROLE_NAMES.tr[role];
}

/**
 * Bir klasörün özel bir sistem rolüne (Gelen, Giden, Taslak, Çöp vb.) ait olup olmadığını tespit eder.
 */
export function getFolderRole(f: { path: string; name?: string; flags?: string[] }): SystemRole | 'custom' {
  const p = (f.path || '').toLowerCase();
  const n = (f.name || '').toLowerCase();
  const flags = (f.flags || []).map((fl) => fl.toLowerCase());

  // 1. Gelen Kutusu
  if (flags.includes('\\inbox') || p === 'inbox' || n === 'inbox' || n === 'gelen kutusu' || n === 'gelen') {
    return 'inbox';
  }

  // 2. Yıldızlı
  if (
    flags.includes('\\flagged') ||
    p.includes('starred') ||
    p.includes('yıldızlı') ||
    n.includes('yıldızlı') ||
    n.includes('starred')
  ) {
    return 'starred';
  }

  // 3. Gönderilenler
  if (
    flags.includes('\\sent') ||
    /^(\[gmail\]\/)?(sent|sent items|sent messages|gönderilenler|gönderilmiş postalar|gönderilen öğeler|gönderilmiş)$/i.test(n) ||
    /^\[gmail\]\/(sent mail|gönderilmiş postalar)$/i.test(p) ||
    /^(inbox\.)?sent/i.test(p) ||
    /^sent$/i.test(p)
  ) {
    return 'sent';
  }

  // 4. Taslaklar
  if (
    flags.includes('\\drafts') ||
    /^(\[gmail\]\/)?(drafts|taslaklar|draft|taslak)$/i.test(n) ||
    /^\[gmail\]\/(drafts|taslaklar)$/i.test(p) ||
    /^(inbox\.)?drafts/i.test(p) ||
    /^drafts$/i.test(p) ||
    /^taslaklar$/i.test(p)
  ) {
    return 'drafts';
  }

  // 5. Çöp Kutusu
  if (
    flags.includes('\\trash') ||
    /^(\[gmail\]\/)?(trash|çöp kutusu|çöp|deleted items|deleted messages|silinmiş öğeler|silinmiş)$/i.test(n) ||
    /^\[gmail\]\/(trash|çöp kutusu)$/i.test(p) ||
    /^(inbox\.)?trash/i.test(p) ||
    /^trash$/i.test(p)
  ) {
    return 'trash';
  }

  // 6. Spam / Junk
  if (
    flags.includes('\\junk') ||
    /^(\[gmail\]\/)?(junk|spam|gereksiz|junk email|bulk mail|istenmeyen)$/i.test(n) ||
    /^\[gmail\]\/spam$/i.test(p) ||
    /^(inbox\.)?(junk|spam)/i.test(p) ||
    /^junk$/i.test(p) ||
    /^spam$/i.test(p)
  ) {
    return 'junk';
  }

  // 7. Arşiv / Tüm Postalar
  if (
    flags.includes('\\archive') ||
    flags.includes('\\all') ||
    /^(\[gmail\]\/)?(archive|all mail|tüm postalar|arşiv|all)$/i.test(n) ||
    /^\[gmail\]\/tüm postalar$/i.test(p) ||
    /^archive$/i.test(p)
  ) {
    return 'archive';
  }

  return 'custom';
}

/**
 * Klasör listesini tekilleştirir, sistem ve özel klasörler olarak ikiye ayırır.
 * Aynı role sahip birden fazla klasör varsa (örn. hem "Drafts" hem "Taslaklar", veya hem "Junk" hem "Spam")
 * en uygun tekil kanonik klasörü seçer ve çift görünen takma adları temizler.
 */
export function organizeAndDeduplicateFolders(
  rawFolders: Folder[],
  _activeFolder?: string | null,
  isGoogleAccount?: boolean,
  lang: 'tr' | 'en' = 'tr'
): {
  systemFolders: ProcessedFolder[];
  customFolders: ProcessedFolder[];
  allDisplayFolders: ProcessedFolder[];
} {
  // Salt konteyner veya seçilemez klasörleri ([Gmail], \Noselect) filtrele
  const validFolders = (rawFolders || []).filter((f) => {
    if (!f.path) return false;
    const p = f.path.trim();
    if (p === '[Gmail]' || p === '[GMAIL]') return false;
    const flags = (f.flags || []).map((x) => x.toLowerCase());
    if (flags.includes('\\noselect')) return false;
    return true;
  });

  // Rollere göre grupla
  const roleGroups = new Map<SystemRole, Folder[]>();
  const customList: Folder[] = [];

  for (const f of validFolders) {
    const role = getFolderRole(f);
    if (role === 'custom') {
      customList.push(f);
    } else {
      if (!roleGroups.has(role)) roleGroups.set(role, []);
      roleGroups.get(role)!.push(f);
    }
  }

  const systemFolders: ProcessedFolder[] = [];
  const systemRoles: SystemRole[] = ['inbox', 'starred', 'sent', 'drafts', 'trash', 'junk', 'archive'];

  for (const role of systemRoles) {
    const candidates = roleGroups.get(role);
    if (!candidates || candidates.length === 0) continue;

    // Adaylar arasında en uygun kanonik klasörü seç
    const scored = candidates.map((c) => {
      let score = 0;
      const p = c.path.toLowerCase();
      const n = (c.name || '').toLowerCase();
      const flags = (c.flags || []).map((x) => x.toLowerCase());

      // 1. Özel IMAP bayrağı taşıyorsa
      if (role === 'inbox' && flags.includes('\\inbox')) score += 50;
      if (role === 'starred' && flags.includes('\\flagged')) score += 50;
      if (role === 'sent' && flags.includes('\\sent')) score += 50;
      if (role === 'drafts' && flags.includes('\\drafts')) score += 50;
      if (role === 'trash' && flags.includes('\\trash')) score += 50;
      if (role === 'junk' && flags.includes('\\junk')) score += 50;
      if (role === 'archive' && (flags.includes('\\archive') || flags.includes('\\all'))) score += 50;

      // 2. Gmail hesabıysa [Gmail]/ önekine öncelik ver
      if (isGoogleAccount && c.path.startsWith('[Gmail]/')) score += 40;

      // 3. Standart sunucu adlandırma tercihleri
      if (role === 'drafts') {
        if (p === 'drafts' || n === 'drafts') score += 30;
        else if (p === 'taslaklar' || n === 'taslaklar') score += 20;
      } else if (role === 'sent') {
        if (c.path === 'Sent' || n === 'sent') score += 30;
        else if (c.path === 'SENT') score += 25;
        else if (n.includes('gönder')) score += 20;
      } else if (role === 'junk') {
        if (p === 'spam' || n === 'spam') score += 30;
        else if (p === 'junk' || n === 'junk') score += 25;
      } else if (role === 'trash') {
        if (p === 'trash' || n === 'trash') score += 30;
        else if (n.includes('çöp')) score += 20;
      }

      return { folder: c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0].folder;
    const info = ROLE_INFO[role];

    systemFolders.push({
      ...winner,
      displayName: getRoleName(role, lang),
      icon: info.icon,
      role,
      order: info.order,
    });
  }

  // Taslaklar klasörü hiç yoksa ve hesapta klasörler varsa sanal taslak klasörü ekle
  if (validFolders.length > 0 && !systemFolders.some((f) => f.role === 'drafts')) {
    const draftPath = isGoogleAccount ? '[Gmail]/Taslaklar' : 'Drafts';
    systemFolders.push({
      name: 'Taslaklar',
      path: draftPath,
      flags: ['\\Drafts'],
      displayName: getRoleName('drafts', lang),
      icon: ROLE_INFO.drafts.icon,
      role: 'drafts',
      order: ROLE_INFO.drafts.order,
    });
  }

  // Sistem klasörlerini standart sıraya göre diz
  systemFolders.sort((a, b) => a.order - b.order);

  // Özel klasörleri işle
  const processedCustom: ProcessedFolder[] = customList.map((cf) => {
    const rawName = cf.name || cf.path;
    const cleanName = rawName.replace(/^\[Gmail\]\//i, '').replace(/^INBOX\./i, '') || cf.path;
    return {
      ...cf,
      displayName: cleanName,
      icon: '📁',
      role: 'custom',
      order: 10,
    };
  });

  // Özel klasörleri alfabetik sırala
  processedCustom.sort((a, b) => a.displayName.localeCompare(b.displayName, lang));

  return {
    systemFolders,
    customFolders: processedCustom,
    allDisplayFolders: [...systemFolders, ...processedCustom],
  };
}
