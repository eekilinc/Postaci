// src/query/mailKeys.ts — sorgu anahtarı fabrikası
// Anahtarlar hiyerarşik: ['mail'] -> ['mail','folders', email] gibi.
// invalidateQueries({ queryKey: mailKeys.all }) her şeyi tazeler.
export const mailKeys = {
  all: ['mail'] as const,
  folders: (email: string | null) =>
    ['mail', 'folders', email ?? 'none'] as const,
  counts: (email: string | null, folder: string) =>
    ['mail', 'counts', email ?? 'none', folder] as const,
  unread: () => ['mail', 'unread'] as const,
  messageList: (t: {
    email: string | null;
    folder: string;
    unified: boolean;
  }) =>
    [
      'mail',
      'list',
      t.unified ? 'unified' : (t.email ?? 'none'),
      t.unified ? 'all' : t.folder,
    ] as const,
  messageCount: (t: {
    email: string | null;
    folder: string;
    unified: boolean;
  }) =>
    [
      'mail',
      'count',
      t.unified ? 'unified' : (t.email ?? 'none'),
      t.unified ? 'all' : t.folder,
    ] as const,
};
