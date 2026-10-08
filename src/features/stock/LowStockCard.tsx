import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { useBranches } from '@/features/me/useBranches';
import { formatNumber } from '@/lib/format';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';

const LIMIT = 5;
const lowListHref = (branchId?: string) =>
  `/inventory/stock?${new URLSearchParams({ low: '1', ...(branchId ? { branch_id: branchId } : {}) }).toString()}`;

/**
 * I06 dashboard card (D01 will place it in the full dashboard): how many products are below
 * their min level in each of the caller's branches, and the biggest shortages. Needs stock.view;
 * the caller mounts it only then.
 */
export default function LowStockCard() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const summary = useQuery({
    queryKey: stockKeys.lowSummary(orgId, LIMIT),
    queryFn: () => stockApi.lowSummary(LIMIT),
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const data = summary.data;

  return (
    <Card
      title={t('stock.lowCard.title')}
      description={t('stock.lowCard.description')}
      className="mt-6"
      actions={
        data && data.total > 0 ? (
          <Link to={lowListHref()} className="btn btn-ghost">
            {t('stock.lowCard.viewAll', { count: formatNumber(data.total) })}
          </Link>
        ) : undefined
      }
    >
      {summary.isPending ? (
        <Skeleton className="h-24" />
      ) : summary.isError || !data ? (
        <ErrorState title={t('stock.lowCard.loadFailed')} onRetry={() => void summary.refetch()} />
      ) : data.total === 0 ? (
        <p className="type-body">{t('stock.lowCard.none')}</p>
      ) : (
        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2" aria-label={t('stock.lowCard.perBranch')}>
            {data.branches.map((b) => (
              <li key={b.branch_id}>
                <Link
                  to={lowListHref(b.branch_id)}
                  className="inline-flex items-center gap-2 rounded-card border border-line px-3 py-1.5 hover:border-brand-700"
                >
                  <span>{branchName.get(b.branch_id) ?? ''}</span>
                  <Badge tone={b.low > 0 ? 'danger' : 'success'}>{formatNumber(b.low)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-line" aria-label={t('stock.lowCard.biggest')}>
            {data.items.map((i) => (
              <li
                key={`${i.product_id}:${i.branch_id}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {getLanguage() === 'en' && i.name_en ? i.name_en : i.name_ar}
                  </span>
                  <span className="type-caption block">
                    {branchName.get(i.branch_id) ?? ''} ·{' '}
                    {t('stock.lowCard.level', {
                      available: formatNumber(i.available),
                      min: formatNumber(i.min_level),
                    })}
                  </span>
                </span>
                <Badge tone="danger">
                  {t('stock.lowCard.short', { count: formatNumber(i.shortage) })}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
