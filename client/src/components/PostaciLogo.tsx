import React from 'react';

interface PostaciLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const PostaciLogo: React.FC<PostaciLogoProps> = ({
  size = 32,
  className = '',
  style = {}
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        borderRadius: size > 24 ? '9px' : '6px',
        boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)',
        flexShrink: 0,
        ...style
      }}
    >
      <defs>
        <linearGradient id="postaciBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="postaciEnvelopeFold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <filter id="postaciShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Background Rounded Square */}
      <rect width="48" height="48" rx="11" fill="url(#postaciBg)" />

      {/* Subtle Inner Glow Border */}
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="10.25" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />

      {/* Fast Wing / Speed Line */}
      <path
        d="M8 15L16 11L14 15H8Z"
        fill="rgba(255,255,255,0.6)"
      />

      {/* Main Envelope Body */}
      <g filter="url(#postaciShadow)">
        <rect x="9" y="14" width="30" height="21" rx="4" fill="url(#postaciEnvelopeFold)" />
        
        {/* Envelope Flap Fold */}
        <path
          d="M9 16.5L24 27.5L39 16.5"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dynamic Paper Airplane / Letter Stamp Accent */}
        <path
          d="M24 15L37 28L29 28L24 33L24 15Z"
          fill="#60a5fa"
          opacity="0.25"
        />

        {/* Heart / Stamp Badge */}
        <circle cx="33" cy="15" r="4.5" fill="#f43f5e" />
        <path
          d="M33 13.8C33 13.8 31.8 12.8 31 13.6C30.2 14.4 31 15.5 33 16.8C35 15.5 35.8 14.4 35 13.6C34.2 12.8 33 13.8 33 13.8Z"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
};
