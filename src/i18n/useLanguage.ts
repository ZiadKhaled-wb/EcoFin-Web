import { useTranslation } from 'react-i18next';
import { getLanguage, type Language } from '@/i18n';

/** The active language, re-rendering the caller when it changes. */
export function useLanguage(): Language {
  // Subscribes to language changes; the value itself comes from our own getter.
  useTranslation();
  return getLanguage();
}
