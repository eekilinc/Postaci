// src/hooks/useTheme.ts — tema, accent rengi ve OLED modu yönetimi
import { useEffect, useState } from 'react';
import type { AccentKey, ThemeKey } from '../types';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeKey>(
    () => (localStorage.getItem('postaci-theme') as ThemeKey) || 'system',
  );
  const [accent, setAccent] = useState<AccentKey>(
    () => (localStorage.getItem('postaci-accent') as AccentKey) || 'blue',
  );
  const [oledMode, setOledMode] = useState<boolean>(
    () => localStorage.getItem('postaci_oled_mode') === 'true',
  );

  useEffect(() => {
    localStorage.setItem('postaci-theme', theme);
    localStorage.setItem('postaci_oled_mode', String(oledMode));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('oled-black', isDark && oledMode);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, oledMode]);

  useEffect(() => {
    localStorage.setItem('postaci-accent', accent);
  }, [accent]);

  return { theme, setTheme, accent, setAccent, oledMode, setOledMode };
}
