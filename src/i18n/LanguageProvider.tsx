import { DirectionProvider } from '@radix-ui/react-direction';
import { Fragment, useEffect, type ReactNode } from 'react';
import { directionOf } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

/**
 * Gives Radix the page direction and remounts the tree when the language changes, so every
 * string (including those read through the plain `t()` helper) is re-read. <html lang dir> is
 * kept in step by the i18n module itself.
 */
export default function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = directionOf(lang);
  }, [lang]);
  return (
    <DirectionProvider dir={directionOf(lang)}>
      <Fragment key={lang}>{children}</Fragment>
    </DirectionProvider>
  );
}
