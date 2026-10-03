import ar from './ar.json';
import en from './en.json';

/**
 * Minimal translation helper (Sprint 1). F09 replaces it with the full AR/EN system and
 * migrates these keys. Flat dotted keys; `{name}` placeholders.
 */
export type TranslationKey = keyof typeof ar;
export type Language = 'ar' | 'en';

// Compile-time check: en.json has exactly the keys of ar.json.
const dictionaries: Record<Language, Record<TranslationKey, string>> = { ar, en };

let current: Language = 'ar';

export const setLanguage = (lang: Language) => {
  current = lang;
};
export const getLanguage = () => current;

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
