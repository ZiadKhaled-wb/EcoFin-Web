import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar, en, type Namespace, type TranslationKey } from './resources';

export type { TranslationKey } from './resources';
export type Language = 'ar' | 'en';

export const LANGUAGES: readonly Language[] = ['ar', 'en'];
export const DEFAULT_LANGUAGE: Language = 'ar';
const STORAGE_KEY = 'ecofin-lang';

export const isLanguage = (v: unknown): v is Language => v === 'ar' || v === 'en';
export const directionOf = (lang: Language): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

function readStoredLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return DEFAULT_LANGUAGE;
}

/** Keeps <html lang dir> in step with the language (the Radix provider is set by LanguageProvider). */
function applyToDocument(lang: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = directionOf(lang);
}

// Resources are bundled, so init is synchronous and `t()` works before React renders.
void i18next.use(initReactI18next).init({
  resources: {
    ar: ar as unknown as Record<string, object>,
    en: en as unknown as Record<string, object>,
  },
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  ns: Object.keys(ar),
  defaultNS: 'common',
  initAsync: false,
  // Keep the `{name}` placeholders the auth strings already use.
  interpolation: { prefix: '{', suffix: '}', escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

applyToDocument(getLanguage());
i18next.on('languageChanged', (lng) => {
  if (isLanguage(lng)) applyToDocument(lng);
});

export function getLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

/** Switches the language and remembers it for this viewer. */
export async function setLanguage(lang: Language): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked: the switch still works for this visit */
  }
  await i18next.changeLanguage(lang);
}

/**
 * Translates `namespace.path.to.key`. The first segment picks the namespace file.
 * Pass `lng` to translate into a language other than the active one.
 */
export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
  lng?: Language,
): string {
  const dot = key.indexOf('.');
  const ns = key.slice(0, dot) as Namespace;
  return i18next.t(key.slice(dot + 1), { ns, lng, ...params });
}

export { i18next };
