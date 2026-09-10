// src/components/LayoutSwitcher.tsx — Çoklu yerleşim düzeni seçici (3 Sütun, Yatay Alt Alta, Kompakt)
import React, { memo } from 'react';
import { ThreeColumnIcon, HorizontalLayoutIcon, CompactLayoutIcon } from './icons';

export type LayoutMode = 'three-column' | 'horizontal' | 'compact';

interface LayoutSwitcherProps {
  layoutMode?: LayoutMode;
  current?: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  className?: string;
}

const MODES: { id: LayoutMode; label: string; renderIcon: () => React.ReactNode; desc: string }[] = [
  {
    id: 'three-column',
    label: '3 Sütun',
    renderIcon: () => <ThreeColumnIcon size={14} />,
    desc: 'Yan Yana Üç Sütun (Standart)',
  },
  {
    id: 'horizontal',
    label: 'Alt Alta',
    renderIcon: () => <HorizontalLayoutIcon size={14} />,
    desc: 'Üstte Liste, Altta Okuma Paneli',
  },
  {
    id: 'compact',
    label: 'Odak',
    renderIcon: () => <CompactLayoutIcon size={14} />,
    desc: 'Tam Ekran Okuma ve Liste Odak Modu',
  },
];

export const LayoutSwitcher = memo(function LayoutSwitcher({
  layoutMode,
  current,
  onChange,
  className = '',
}: LayoutSwitcherProps) {
  const activeMode = current || layoutMode || 'three-column';

  return (
    <div
      className={`inline-flex rounded-lg border border-zinc-200 bg-zinc-100/70 p-0.5 dark:border-zinc-750 dark:bg-zinc-800/60 select-none ${className}`}
      title="Yerleşim Düzenini Değiştir"
    >
      {MODES.map((m) => {
        const isActive = activeMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all duration-150 ${
              isActive
                ? 'bg-white font-semibold text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
            title={m.desc}
          >
            <span className="shrink-0">{m.renderIcon()}</span>
            <span className="hidden sm:inline text-[11px]">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
});
