// src/components/icons.tsx — Postacı minimalist modern vektörel ikon kütüphanesi
// Saf Tailwind / SVG tabanlı, 0 harici bağımlılık, 60 FPS akıcı ve hem açık/koyu temada kusursuz
import React, { memo } from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}

const baseProps = (size = 18, strokeWidth = 2, className = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
});

// ── Klasör & Navigasyon İkonları ─────────────────────────────────────────────

export const InboxIcon = memo(function InboxIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
});

export const StarIcon = memo(function StarIcon({ size = 18, strokeWidth = 2, className = '', filled = false, ...props }: IconProps) {
  return (
    <svg
      {...baseProps(size, strokeWidth, className)}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'currentColor' : 'currentColor'}
      {...props}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
});

export const SendIcon = memo(function SendIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
});

export const DraftIcon = memo(function DraftIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
});

export const TrashIcon = memo(function TrashIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
});

export const SpamIcon = memo(function SpamIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
});

export const ArchiveIcon = memo(function ArchiveIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
});

export const FolderIcon = memo(function FolderIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
});

export const AllMailIcon = memo(function AllMailIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
});

// ── E-posta İşlem İkonları ───────────────────────────────────────────────────

export const MailIcon = memo(function MailIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
});

export const MailOpenIcon = memo(function MailOpenIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
      <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
    </svg>
  );
});

export const ComposeIcon = memo(function ComposeIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
});

export const ReplyIcon = memo(function ReplyIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
});

export const ReplyAllIcon = memo(function ReplyAllIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="7 17 2 12 7 7" />
      <polyline points="12 17 7 12 12 7" />
      <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
    </svg>
  );
});

export const ForwardIcon = memo(function ForwardIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="15 17 20 12 15 7" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </svg>
  );
});

export const AttachmentIcon = memo(function AttachmentIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
});

export const SearchIcon = memo(function SearchIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
});

export const EyeIcon = memo(function EyeIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
});

export const SyncIcon = memo(function SyncIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
});

// ── Sistem & Kontrol İkonları ────────────────────────────────────────────────

export const SettingsIcon = memo(function SettingsIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
});

export const HelpIcon = memo(function HelpIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
});

export const InfoIcon = memo(function InfoIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
});

export const SortAscIcon = memo(function SortAscIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="4" y1="6" x2="11" y2="6" />
      <line x1="4" y1="12" x2="9" y2="12" />
      <line x1="4" y1="18" x2="7" y2="18" />
      <polyline points="15 15 18 18 21 15" />
      <line x1="18" y1="6" x2="18" y2="18" />
    </svg>
  );
});

export const SortDescIcon = memo(function SortDescIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="4" y1="6" x2="7" y2="6" />
      <line x1="4" y1="12" x2="9" y2="12" />
      <line x1="4" y1="18" x2="11" y2="18" />
      <polyline points="15 9 18 6 21 9" />
      <line x1="18" y1="6" x2="18" y2="18" />
    </svg>
  );
});

export const UndoIcon = memo(function UndoIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
});

export const PrintIcon = memo(function PrintIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2-2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
});

export const DownloadIcon = memo(function DownloadIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
});

export const SaveIcon = memo(function SaveIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
});

export const ShieldIcon = memo(function ShieldIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
});

export const CheckIcon = memo(function CheckIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
});

export const CloseIcon = memo(function CloseIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
});

export const MinusIcon = memo(function MinusIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
});

export const MaximizeIcon = memo(function MaximizeIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
});

export const MenuIcon = memo(function MenuIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
});

export const PlusIcon = memo(function PlusIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
});

export const ChevronDownIcon = memo(function ChevronDownIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
});

export const ChevronLeftIcon = memo(function ChevronLeftIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
});

export const ExternalLinkIcon = memo(function ExternalLinkIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
});

export const CopyIcon = memo(function CopyIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
});

export const UsersIcon = memo(function UsersIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
});

export const UserIcon = memo(function UserIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
});

export const BellIcon = memo(function BellIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
});

export const PaletteIcon = memo(function PaletteIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z" />
    </svg>
  );
});

export const SunIcon = memo(function SunIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
});

export const MoonIcon = memo(function MoonIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
});

export const MonitorIcon = memo(function MonitorIcon({ size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
});

export const SparklesIcon = memo(function SparklesIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
});

export const KeyboardIcon = memo(function KeyboardIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="6" y1="8" x2="6.01" y2="8" />
      <line x1="10" y1="8" x2="10.01" y2="8" />
      <line x1="14" y1="8" x2="14.01" y2="8" />
      <line x1="18" y1="8" x2="18.01" y2="8" />
      <line x1="6" y1="12" x2="6.01" y2="12" />
      <line x1="10" y1="12" x2="10.01" y2="12" />
      <line x1="14" y1="12" x2="14.01" y2="12" />
      <line x1="18" y1="12" x2="18.01" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
});

// ── Yerleşim (Layout) İkonları ───────────────────────────────────────────────

export const ThreeColumnIcon = memo(function ThreeColumnIcon({ size = 18, strokeWidth = 1.5, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
});

export const HorizontalLayoutIcon = memo(function HorizontalLayoutIcon({ size = 18, strokeWidth = 1.5, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="9" y1="3" x2="9" y2="12" />
    </svg>
  );
});

export const CompactLayoutIcon = memo(function CompactLayoutIcon({ size = 18, strokeWidth = 1.5, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
});

// ── Dosya Türü İkonları (Ek Dosyalar) ────────────────────────────────────────

export const FilePdfIcon = memo(function FilePdfIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 12h2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2v-3z" />
    </svg>
  );
});

export const FileImageIcon = memo(function FileImageIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
});

export const FileTextIcon = memo(function FileTextIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
});

export const FileTableIcon = memo(function FileTableIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="12" y1="11" x2="12" y2="19" />
    </svg>
  );
});

export const FileZipIcon = memo(function FileZipIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="10" cy="14" r="1" />
      <line x1="10" y1="11" x2="10" y2="12" />
      <line x1="10" y1="16" x2="10" y2="18" />
    </svg>
  );
});

export const FileAudioIcon = memo(function FileAudioIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
});

export const FileVideoIcon = memo(function FileVideoIcon({ size = 18, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, className)} {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  );
});

// ── Marka Sağlayıcı İkonları (Google, Microsoft, Yahoo) ─────────────────────

export const GoogleBrandIcon = memo(function GoogleBrandIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
});

export const MicrosoftBrandIcon = memo(function MicrosoftBrandIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" className={className}>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
});

export const YahooBrandIcon = memo(function YahooBrandIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="4" fill="#6001D2" />
      <path fill="#fff" d="M8.2 6.5l2.4 4.8 2.4-4.8h2.3l-3.6 6.8v4.2h-2.2v-4.2l-3.6-6.8h2.3zm8.5 7.4c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z" />
    </svg>
  );
});

// ── Klasör Rolüne Göre İkon Eşleme Bileşeni ─────────────────────────────────

export interface FolderRoleIconProps {
  role?: string;
  className?: string;
  size?: number;
}

export const FolderRoleIcon = memo(function FolderRoleIcon({
  role = 'custom',
  className = '',
  size = 16,
}: FolderRoleIconProps) {
  switch (role) {
    case 'inbox':
      return <InboxIcon size={size} className={className} />;
    case 'starred':
      return <StarIcon size={size} className={className} />;
    case 'sent':
      return <SendIcon size={size} className={className} />;
    case 'drafts':
      return <DraftIcon size={size} className={className} />;
    case 'trash':
      return <TrashIcon size={size} className={className} />;
    case 'junk':
      return <SpamIcon size={size} className={className} />;
    case 'archive':
      return <ArchiveIcon size={size} className={className} />;
    default:
      return <FolderIcon size={size} className={className} />;
  }
});
