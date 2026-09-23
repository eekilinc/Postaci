// src/hooks/useTheme.ts — uyumluluk sarmalayıcı (store destekli)
//
// Gerçek durum artık src/stores/themeStore.ts'ta. Bu hook eski API'yi
// birebir korur, o yüzden tüketiciler (App.tsx) değişmeden çalışır.
// Yeni kod doğrudan useThemeStore() kullansın.
import { useThemeStore } from '../stores/themeStore';

export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const accent = useThemeStore((s) => s.accent);
  const oledMode = useThemeStore((s) => s.oledMode);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setOledMode = useThemeStore((s) => s.setOledMode);
  return { theme, setTheme, accent, setAccent, oledMode, setOledMode };
}
