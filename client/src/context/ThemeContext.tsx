import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, AccentColor, Density } from '../types';

export type { Theme, AccentColor, Density };

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accentColor: AccentColor;
  setAccentColor: (accent: AccentColor) => void;
  density: Density;
  setDensity: (density: Density) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('postaci_theme') as Theme;
    return saved || 'dark';
  });

  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('postaci_accent') as AccentColor;
    return saved || 'blue';
  });

  const [density, setDensityState] = useState<Density>(() => {
    const saved = localStorage.getItem('postaci_density') as Density;
    return saved || 'comfortable';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('postaci_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accentColor);
    localStorage.setItem('postaci_accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    localStorage.setItem('postaci_density', density);
  }, [density]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const setAccentColor = (a: AccentColor) => {
    setAccentColorState(a);
  };

  const setDensity = (d: Density) => {
    setDensityState(d);
  };

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      accentColor,
      setAccentColor,
      density,
      setDensity,
      toggleTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
