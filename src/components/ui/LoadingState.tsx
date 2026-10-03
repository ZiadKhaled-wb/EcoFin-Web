import Skeleton from '@/components/ui/Skeleton';
import { t } from '@/i18n';

/** A content area while its data loads: skeleton rows shaped like a list. Announced to screen readers. */
export default function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-6">
      <span className="sr-only">{t('ui.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
