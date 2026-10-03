import Button from '@/components/ui/Button';
import { setLanguage, t, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

/** Switches Arabic <-> English. Shows the language you would switch TO, in its own script. */
export default function LanguageSwitch() {
  const lang = useLanguage();
  const next: Language = lang === 'ar' ? 'en' : 'ar';
  const nextName = t(`shell.languageName.${next}`, undefined, next);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11"
      lang={next}
      aria-label={t('shell.switchTo', { language: nextName })}
      onClick={() => void setLanguage(next)}
    >
      {nextName}
    </Button>
  );
}
