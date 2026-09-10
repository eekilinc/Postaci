// src/components/Avatar.tsx — Mailbird 3.0 esintili pastel renkli, 2 harfli akıllı avatar
import { memo } from 'react';
import { MailIcon } from './icons';

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Mailbird 3.0 tarzı yumuşak pastel renk paleti (açık ve koyu modda kusursuz kontrast)
const PALETTES = [
  { bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200' },
  { bg: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/70 dark:text-cyan-200' },
  { bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200' },
  { bg: 'bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-200' },
  { bg: 'bg-lime-100 text-lime-950 dark:bg-lime-950/70 dark:text-lime-200' },
  { bg: 'bg-purple-100 text-purple-900 dark:bg-purple-950/70 dark:text-purple-200' },
  { bg: 'bg-teal-100 text-teal-900 dark:bg-teal-950/70 dark:text-teal-200' },
  { bg: 'bg-violet-100 text-violet-900 dark:bg-violet-950/70 dark:text-violet-200' },
  { bg: 'bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-200' },
  { bg: 'bg-yellow-100 text-yellow-950 dark:bg-yellow-950/70 dark:text-yellow-200' },
  { bg: 'bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200' },
  { bg: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950/70 dark:text-fuchsia-200' },
];

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-14 w-14 text-base',
};

function getInitials(name?: string | null, email?: string | null): string {
  const clean = (name || '').trim();
  if (clean) {
    // Tırnak işaretlerini ve açılı ayraçları temizle
    const unquoted = clean.replace(/["'<>]/g, '').trim();
    const parts = unquoted.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
  }

  const em = (email || '').trim().toLowerCase();
  if (em) {
    const userPart = em.split('@')[0].replace(/[^a-z0-9]/gi, '');
    if (userPart.length >= 2) return userPart.substring(0, 2).toUpperCase();
    if (userPart.length === 1) return userPart[0].toUpperCase();
  }

  return '';
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const Avatar = memo(function Avatar({
  name,
  email,
  size = 'md',
  className = '',
}: AvatarProps) {
  const keyStr = (name || email || 'postaci').toLowerCase().trim();
  const palette = PALETTES[hashString(keyStr) % PALETTES.length];
  const initials = getInitials(name, email);
  const sizeClasses = SIZES[size] || SIZES.md;

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold border border-black/5 dark:border-white/10 select-none transition-all shadow-2xs ${palette.bg} ${sizeClasses} ${className}`}
      title={name || email || ''}
    >
      {initials ? (
        <span className="tracking-tight">{initials}</span>
      ) : (
        <MailIcon size={size === 'xs' ? 10 : size === 'sm' ? 12 : size === 'lg' ? 18 : size === 'xl' ? 22 : 14} />
      )}
    </div>
  );
});
