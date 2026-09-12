export type Language = 'tr' | 'en';

export type TranslationParams = Record<string, string | number>;

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: TranslationParams, fallback?: string) => string;
}
