export * from '../../../shared/mail';

export type SortOption = 'newest' | 'oldest' | 'from-asc' | 'from-desc' | 'subject-asc' | 'unread-first' | 'starred-first';

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
