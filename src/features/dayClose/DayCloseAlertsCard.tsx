import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { formatBusinessDate, formatNumber } from '@/lib/format';
import { dayCloseKeys, dayClosesApi } from '@/services/dayClosesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/**
 * K04 dashboard card (next to the ETA alert): per branch, the days with activity that are not
 * closed and what the night check found. Drawn only when there is something to show; the caller
 * mounts it for day.close or cash.view.
 */
export default function DayCloseAlertsCard() {
  const orgId = useAuthStore((s) => s.orgId);
  const alerts = useQuery({
    queryKey: dayCloseKeys.alerts(orgId),
    queryFn: dayClosesApi.alerts,
    staleTime: 60_000,
  });
  if (alerts.isSuccess && alerts.data.branches.length === 0) return null;
  return (
    <Card
      title={t('dayClose.card.title')}
      description={t('dayClose.card.description')}
      className="mt-6"
      actions={
        <Link to="/accounting/day-close" className="btn btn-ghost">
          {t('dayClose.card.open')}
        </Link>
      }
    >
      {alerts.isPending ? (
        <Skeleton className="h-16" />
      ) : alerts.isError ? (
        <ErrorState title={t('dayClose.card.loadFailed')} onRetry={() => void alerts.refetch()} />
      ) : (
        <ul className="space-y-3">
          {alerts.data.branches.map((b) => (
            <li key={b.branch_id} className="flex flex-wrap items-center gap-2">
              <Link
                to={`/accounting/day-close?branch_id=${b.branch_id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {b.branch_name}
              </Link>
              {b.unclosed_days.length > 0 && (
                <Badge tone="warning">
                  {t('dayClose.card.unclosed', { count: formatNumber(b.unclosed_days.length) })}
                </Badge>
              )}
              {b.last_check && b.last_check.warnings > 0 && (
                <Badge tone="neutral">
                  {t('dayClose.card.lastCheck', {
                    date: formatBusinessDate(b.last_check.business_date),
                    count: formatNumber(b.last_check.warnings),
                  })}
                </Badge>
              )}
              {b.last_check && b.last_check.critical > 0 && (
                <Badge tone="danger">
                  {t('dayClose.card.critical', { count: formatNumber(b.last_check.critical) })}
                </Badge>
              )}
              {b.last_check?.drift && <Badge tone="danger">{t('dayClose.card.drift')}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
