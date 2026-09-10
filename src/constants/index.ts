// src/constants/index.ts — Postacı sabit değerler

import type { AccentKey } from '../types';

export const PROVIDERS = [
  { id: 'google' as const, label: 'Google (Gmail)', icon: '🔵' },
  { id: 'microsoft' as const, label: 'Microsoft (Outlook)', icon: '🟦' },
  { id: 'yahoo' as const, label: 'Yahoo Mail', icon: '🟣' },
];

// Vurgu renkleri (tüm sınıflar sabit yazılı: Tailwind'in üretmesi için)
export const ACCENTS: Record<
  AccentKey,
  { btn: string; soft: string; sel: string; dot: string; label: string }
> = {
  blue: {
    btn: 'bg-blue-600 hover:bg-blue-700',
    soft: 'bg-blue-100 dark:bg-blue-950',
    sel: 'bg-blue-50 dark:bg-blue-950/40',
    dot: 'bg-blue-600',
    label: 'Mavi',
  },
  green: {
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    soft: 'bg-emerald-100 dark:bg-emerald-950',
    sel: 'bg-emerald-50 dark:bg-emerald-950/40',
    dot: 'bg-emerald-600',
    label: 'Yeşil',
  },
  purple: {
    btn: 'bg-violet-600 hover:bg-violet-700',
    soft: 'bg-violet-100 dark:bg-violet-950',
    sel: 'bg-violet-50 dark:bg-violet-950/40',
    dot: 'bg-violet-600',
    label: 'Mor',
  },
  orange: {
    btn: 'bg-orange-600 hover:bg-orange-700',
    soft: 'bg-orange-100 dark:bg-orange-950',
    sel: 'bg-orange-50 dark:bg-orange-950/40',
    dot: 'bg-orange-600',
    label: 'Turuncu',
  },
  teal: {
    btn: 'bg-teal-600 hover:bg-teal-700',
    soft: 'bg-teal-100 dark:bg-teal-950',
    sel: 'bg-teal-50 dark:bg-teal-950/40',
    dot: 'bg-teal-600',
    label: 'Turkuaz',
  },
  rose: {
    btn: 'bg-rose-600 hover:bg-rose-700',
    soft: 'bg-rose-100 dark:bg-rose-950',
    sel: 'bg-rose-50 dark:bg-rose-950/40',
    dot: 'bg-rose-600',
    label: 'Gül Pembe',
  },
  slate: {
    btn: 'bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500',
    soft: 'bg-slate-100 dark:bg-slate-900',
    sel: 'bg-slate-100/70 dark:bg-slate-800/50',
    dot: 'bg-slate-700 dark:bg-slate-400',
    label: 'Grafit',
  },
};
