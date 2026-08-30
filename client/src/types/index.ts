export interface EmailAddress {
  name: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentBase64?: string;
  url?: string;
  isInline?: boolean;
  contentId?: string;
}

export interface MeetingInvite {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  organizer: EmailAddress;
  attendees?: { name?: string; email: string; status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION' }[];
  status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION';
  icsRaw?: string;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  provider: 'demo' | 'custom' | 'gmail' | 'outlook' | 'yahoo' | 'icloud';
  authType?: 'password' | 'oauth2';
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: number;
  oauthClientId?: string;
  oauthClientSecret?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  color: string;
  avatar?: string;
  isDefault: boolean;
  signature?: string;
  syncInterval: number;
  lastSyncedAt?: string;
  unreadCount?: number;
}

export interface Email {
  id: string;
  accountId: string;
  threadId: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  fromName: string;
  fromEmail: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isDraft: boolean;
  isSpam: boolean;
  folder: string;
  labels: string[];
  isPinned?: boolean;
  snoozedUntil?: string | null;
  imapUid?: number;
  mailboxPath?: string;
  hasFullBody?: boolean;
  priority: 'high' | 'normal' | 'low';
  attachments: Attachment[];
  meetingInvite?: MeetingInvite | null;
  aiSummary?: string | null;
  aiSmartReplies?: string[] | null;
  aiCategory?: string | null;
  account?: {
    name: string;
    email: string;
    color: string;
  };
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  company?: string;
  role?: string;
  phone?: string;
  notes?: string;
  isStarred: boolean;
  lastContactedAt?: string;
}

export interface CalendarEvent {
  id: string;
  uid?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  color: string;
  accountId?: string;
  organizer?: EmailAddress;
  attendees?: EmailAddress[];
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  emailId?: string;
}

export interface FolderStat {
  folder: string;
  displayName: string;
  icon: string;
  count: number;
  unreadCount: number;
}

export type ViewLayout = 'split-3-column' | 'split-2-column' | 'split-horizontal';
export type MainTab = 'mail' | 'calendar' | 'contacts' | 'settings';

export type Theme =
  | 'dark'
  | 'oled'
  | 'midnight'
  | 'cyberpunk'
  | 'nord'
  | 'light'
  | 'warm-paper'
  | 'rose-gold';

export type AccentColor =
  | 'blue'
  | 'emerald'
  | 'purple'
  | 'crimson'
  | 'amber'
  | 'cyan'
  | 'indigo';

export type Density = 'compact' | 'comfortable' | 'spacious';

export interface DesktopSettings {
  minimizeToTrayOnClose: boolean;
  minimizeToTrayOnMinimize: boolean;
  autoStartOnBoot: boolean;
  startMinimized: boolean;
}
