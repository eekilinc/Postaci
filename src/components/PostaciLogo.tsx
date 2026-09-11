// src/components/PostaciLogo.tsx — Postacı resmi minimalist vektörel logo bileşeni
// Hem açık (light) hem koyu (dark) temada kusursuz kontrast ve 60 FPS performans
import { memo, useId } from 'react';

export interface PostaciLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'squircle' | 'glyph';
  className?: string;
  withText?: boolean;
  showBadge?: boolean;
  badgeText?: string;
}

const SIZES = {
  xs: { box: 'h-4 w-4', text: 'text-xs', badge: 'text-[8px] px-1 py-0.2' },
  sm: { box: 'h-6 w-6', text: 'text-sm', badge: 'text-[9px] px-1.5 py-0.2' },
  md: { box: 'h-8 w-8', text: 'text-base', badge: 'text-[10px] px-1.5 py-0.5' },
  lg: { box: 'h-12 w-12', text: 'text-lg', badge: 'text-[11px] px-2 py-0.5' },
  xl: { box: 'h-16 w-16', text: 'text-xl', badge: 'text-xs px-2.5 py-0.5' },
  '2xl': { box: 'h-24 w-24', text: 'text-2xl', badge: 'text-xs px-3 py-1' },
};

export const PostaciLogo = memo(function PostaciLogo({
  size = 'md',
  variant = 'squircle',
  className = '',
  withText = false,
  showBadge = false,
  badgeText = 'PRO',
}: PostaciLogoProps) {
  const conf = SIZES[size] || SIZES.md;
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const squircleId = `postaci-squircle-${uid}`;
  const wingId = `postaci-wing-${uid}`;
  const glowId = `postaci-subtle-glow-${uid}`;

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Vektörel SVG Simge */}
      <div className={`relative shrink-0 ${conf.box} flex items-center justify-center`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full drop-shadow-xs transition-transform duration-200 group-hover:scale-105"
        >
          <defs>
            {/* Ana Squircle Degradesi: Açık ve koyu temada derinlikli safir mavi */}
            <linearGradient id={squircleId} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            {/* Aerodinamik Posta Kanadı Degradesi */}
            <linearGradient id={wingId} x1="16" y1="12" x2="36" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Koyu tema için hafif iç parıltı filtresi */}
            <filter id={glowId} x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1d4ed8" floodOpacity="0.35" />
            </filter>
          </defs>

          {variant === 'squircle' && (
            <>
              {/* Squircle Kavisli Kare Zemin (Safir Mavi taban + Degrade) */}
              <rect
                x="3"
                y="3"
                width="42"
                height="42"
                rx="12"
                fill="#2563eb"
              />
              <rect
                x="3"
                y="3"
                width="42"
                height="42"
                rx="12"
                fill={`url(#${squircleId})`}
              />
              {/* Koyu modda pürüzsüz kenar ayrımı için mikro çerçeve */}
              <rect
                x="3.5"
                y="3.5"
                width="41"
                height="41"
                rx="11.5"
                stroke="white"
                strokeOpacity="0.18"
                strokeWidth="1"
              />
            </>
          )}

          {/* Minimalist Geometrik Mektup / Zarf Katlanması */}
          {/* 1. Zarf Şeffaf Gövdesi */}
          <path
            d="M10 16C10 14.3431 11.3431 13 13 13H35C36.6569 13 38 14.3431 38 16V32C38 33.6569 36.6569 35 35 35H13C11.3431 35 10 33.6569 10 32V16Z"
            fill="white"
            fillOpacity={variant === 'squircle' ? '0.14' : '0.8'}
          />

          {/* 2. Alt Köşe Dikiş Hatları */}
          <path
            d="M10 33.5L20.5 24M38 33.5L27.5 24"
            stroke={variant === 'squircle' ? 'white' : '#2563eb'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity={variant === 'squircle' ? '0.45' : '0.7'}
          />

          {/* 3. Üst Zarf Kapağı (Origami V-Flap) */}
          <path
            d="M10.5 14.5L22.25 24.6C23.27 25.47 24.73 25.47 25.75 24.6L37.5 14.5"
            stroke="white"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.95"
          />

          {/* 4. Dinamik Uçuş Kanadı (Postacı Origami Motifi) */}
          <path
            d="M24 22L36 12L28 30L24 22Z"
            fill="#38bdf8"
          />
          <path
            d="M24 22L36 12L28 30L24 22Z"
            fill={`url(#${wingId})`}
            fillOpacity="0.92"
          />

          {/* 5. Aktif İleti / Bildirim Noktası (Mühür) */}
          <circle
            cx="35"
            cy="13"
            r="3"
            fill="#38bdf8"
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* İsteğe Bağlı Marka Metni */}
      {(withText || showBadge) && (
        <span
          className={`font-bold tracking-tight text-zinc-900 dark:text-zinc-100 ${conf.text}`}
        >
          Postacı
        </span>
      )}

      {/* İsteğe Bağlı PRO / Durum Rozeti */}
      {showBadge && (
        <span
          className={`rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-400 ${conf.badge}`}
        >
          {badgeText}
        </span>
      )}
    </div>
  );
});
