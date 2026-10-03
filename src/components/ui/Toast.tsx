import { Toaster as Sonner } from 'sonner';
import { directionOf } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

/** Mount once (main.tsx). Follows the page direction; errors are announced assertively. */
export function Toaster() {
  const lang = useLanguage();
  return (
    <Sonner
      dir={directionOf(lang)}
      position={lang === 'ar' ? 'bottom-left' : 'bottom-right'}
      closeButton
      style={{ zIndex: 'var(--z-toast)' }}
      toastOptions={{
        classNames: {
          toast: '!rounded-control !border !border-line !bg-surface !text-ink !shadow-overlay',
          description: '!text-ink-soft',
        },
      }}
    />
  );
}
