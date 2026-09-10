// src/hooks/useTheme.ts — tema ve accent rengi yönetimi
import { useEffect, useState } from 'react';
import type { AccentKey, ThemeKey } from '../types';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeKey>(
    () => (localStorage.getItem('postaci-theme') as ThemeKey) || 'system',
  );
  const [accent, setAccent] = useState<AccentKey>(
    () => (localStorage.getItem('postaci-accent') as AccentKey) || 'blue',
  );

  useEffect(() => {
    localStorage.setItem('postaci-theme', theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && mq.matches),
      );
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('postaci-accent', accent);
  }, [accent]);

  return { theme, setTheme, accent, setAccent };
}
