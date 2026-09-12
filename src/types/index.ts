// src/types/index.ts — Postacı paylaşılan tip tanımları

export type Account = {
  id: number;
  provider: string;
  email: string;
  display_name: string | null;
  auth_type?: string;
  imap_host?: string;
  imap_port?: number;
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: number;
};

export type Msg = {
  uid: string;
  subject: string | null;
  from_addr: string | null;
  to_addr: string | null;
  date: string | null;
  snippet: string | null;
  is_read: number;
  starred?: number;
  has_att?: number;
  account_email?: string;
  account_provider?: string;
  folder_path?: string;
};

export type Folder = {
  path: string;
  name: string;
  displayName?: string;
  flags: string[];
  unread_count?: number;
};

export type Attachment = {
  idx: number;
  filename: string;
  content_type: string | null;
  size: number;
};

export type ComposeFile = {
  filename: string;
  contentType: string;
  dataBase64: string;
  size: number;
};

export type BodyResult = {
  html: string | null;
  text: string | null;
} | null;

export type AccentKey = 'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'rose' | 'slate';
export type ThemeKey = 'light' | 'dark' | 'system';
export type FilterKey = 'all' | 'unread' | 'starred' | 'attachment';

export type AccountSignature = {
  enabled: boolean;
  text: string;
  isHtml?: boolean;
  html?: string;
};

export type ContactItem = {
  id?: number;
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  is_manual?: number;
  updated_at?: string;
};

export type ListDensity = 'compact' | 'normal' | 'relaxed';
export type SnippetLines = 0 | 1 | 2;
export type MarkReadTiming = 'instant' | 'delay_3s' | 'delay_5s' | 'manual';
export type DateFormatPreference = 'smart' | 'relative' | 'absolute';

export type QuickSnippet = {
  id: string;
  title: string;
  body: string;
};
