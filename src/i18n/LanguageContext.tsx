/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Language, LanguageContextType, TranslationParams } from './types';
import { tr } from './locales/tr';
import { en } from './locales/en';

const dictionaries: Record<Language, Record<string, string>> = {
  tr,
  en,
};

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem('postaci_language');
    if (saved === 'tr' || saved === 'en') return saved;
  } catch {}

  // Tarayıcı/Sistem dili kontrolü
  if (typeof navigator !== 'undefined' && navigator.language) {
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('en')) return 'en';
  }
  return 'tr';
}

export const LanguageContext = createContext<LanguageContextType>({
  language: 'tr',
  setLanguage: () => {},
  t: (key, _params, fallback) => fallback || key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  // Electron appSettings'den dil ayarını yükle (varsa)
  useEffect(() => {
    if (window.postaci?.appSettings?.get) {
      window.postaci.appSettings.get().then((settings) => {
        if (settings && (settings.language === 'tr' || settings.language === 'en')) {
          setLanguageState(settings.language);
          try {
            localStorage.setItem('postaci_language', settings.language);
          } catch {}
        }
      }).catch(() => {});
    }
  }, []);

  // HTML lang attribute güncelle
  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {}
  }, [language]);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem('postaci_language', newLang);
    } catch {}

    if (window.postaci?.appSettings?.save) {
      window.postaci.appSettings.save({ language: newLang }).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams, fallback?: string): string => {
      const dict = dictionaries[language] || dictionaries.tr;
      let text = dict[key] ?? dictionaries.tr[key] ?? fallback ?? key;

      if (params && typeof text === 'string') {
        Object.entries(params).forEach(([paramKey, val]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
        });
      }

      return text;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
