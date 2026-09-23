// src/stores/themeStore.ts — tema durumu (Zustand + kalıcı saklama)
//
// Eski useTheme hook'unun birebir karşılığı. localStorage yazma/okuma
// persist middleware'de, DOM sınıf uygulaması alttaki subscribe'ta.
// Bileşenler seçiciyle abone olur: useThemeStore((s) => s.theme)
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccentKey, ThemeKey } from '../types';

interface ThemeState {
  theme: ThemeKey;
  accent: AccentKey;
  oledMode: boolean;
  setTheme: (t: ThemeKey) => void;
  setAccent: (a: AccentKey) => void;
  setOledMode: (v: boolean) => void;
}

function applyDom(theme: ThemeKey, oledMode: boolean) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('oled-black', isDark && oledMode);
}

function legacy<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (v as unknown as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // İlk açılışta eski anahtarları devral: kullanıcı teması kaybolmaz
      theme:
        typeof localStorage === 'undefined'
          ? 'system'
          : legacy<ThemeKey>('postaci-theme', 'system'),
      accent:
        typeof localStorage === 'undefined'
          ? 'blue'
          : legacy<AccentKey>('postaci-accent', 'blue'),
      oledMode:
        typeof localStorage === 'undefined'
          ? false
          : legacy<string>('postaci_oled_mode', 'false') === 'true',
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setOledMode: (oledMode) => set({ oledMode }),
    }),
    { name: 'postaci-theme-store' },
  ),
);

// Durum her değiştiğinde DOM'u senkron tut (eski useEffect karşılığı)
if (typeof window !== 'undefined') {
  const sync = () => {
    const { theme, oledMode } = useThemeStore.getState();
    applyDom(theme, oledMode);
  };
  useThemeStore.subscribe(sync);
  sync();
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', sync);
}
