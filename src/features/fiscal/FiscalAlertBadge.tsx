import { Link } from 'react-router-dom';
import { BellIcon } from '@/components/ui/Icons';
import { useCan } from '@/features/me/useCan';
import { useFiscalSummary } from '@/features/fiscal/useFiscal';
import { t } from '@/i18n';

/**
 * The shell's alert for ETA receipts that need a person (blocked, send failed, rejected, due soon,
 * overdue). Drawn only for someone with fiscal.view and only when something needs attention; it
 * links to the receipts page filtered to the problems.
 */
export default function FiscalAlertBadge() {
  const allowed = useCan('fiscal.view');
  const summary = useFiscalSummary(allowed);
  if (!allowed || !summary.data) return null;
  const { blocked, send_failed, rejected, due_soon, overdue } = summary.data;
  const total = blocked + send_failed + rejected + due_soon + overdue;
  if (total === 0) return null;
  return (
    <Link
      to="/tax/eta-receipts?situation=problem"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-danger-600"
      aria-label={t('fiscal.badge', { count: total })}
      title={t('fiscal.badge', { count: total })}
    >
      <BellIcon className="size-5" />
      <span className="absolute -top-1 -end-1 inline-flex min-w-5 items-center justify-center rounded-full bg-danger-600 px-1 text-xs font-medium text-white">
        {total}
      </span>
    </Link>
  );
}
