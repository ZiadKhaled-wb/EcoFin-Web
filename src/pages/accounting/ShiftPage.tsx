import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SHIFT_DENOMINATIONS, Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { ShiftMovementsTable, ShiftTakings } from './ShiftParts';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('cash.shifts.detail.notFound')}
        description={t('cash.shifts.detail.notFoundHint')}
        action={
          <Link to="/accounting/shifts" className="btn btn-secondary">
            {t('cash.shifts.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/** K02: one shift with its drawer ledger; a closed shift also shows the count and the difference. */
export default function ShiftPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const query = useQuery({
    queryKey: shiftKeys.one(orgId, id),
    queryFn: () => shiftsApi.get(id),
    enabled: validId,
  });

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('cash.shifts.detail.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const shift = query.data;
  if (!shift) return <LoadingState />;
  const branchName = (branches.data ?? []).find((b) => b.id === shift.branch_id)?.name ?? '';
  const counts = SHIFT_DENOMINATIONS.filter((d) => (shift.count_breakdown?.[d] ?? 0) > 0);

  return (
    <PageContainer>
      <PageHeader
        title={t('cash.shifts.detail.title', { number: shift.number })}
        actions={
          <Link to="/accounting/shifts" className="btn btn-ghost">
            {t('cash.shifts.back')}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <div className="mb-3">
            <Badge tone={shift.status === 'open' ? 'warning' : 'neutral'}>
              {t(`cash.shifts.status.${shift.status}`)}
            </Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('cash.shifts.detail.cashier')}</dt>
              <dd>{shift.employee_name}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('cash.shifts.detail.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            {shift.device_name && (
              <div>
                <dt className="type-caption">{t('cash.shifts.detail.device')}</dt>
                <dd>{shift.device_name}</dd>
              </div>
            )}
            <div>
              <dt className="type-caption">{t('cash.shifts.detail.openedAt')}</dt>
              <dd>{formatDateTime(shift.opened_at)}</dd>
            </div>
            {shift.closed_at && (
              <div>
                <dt className="type-caption">{t('cash.shifts.detail.closedAt')}</dt>
                <dd>{formatDateTime(shift.closed_at)}</dd>
              </div>
            )}
            {shift.closed_by_name && (
              <div>
                <dt className="type-caption">{t('cash.shifts.detail.closedBy')}</dt>
                <dd>{shift.closed_by_name}</dd>
              </div>
            )}
            <div>
              <dt className="type-caption">{t('cash.shifts.detail.float')}</dt>
              <dd className="num">{formatMoney(shift.opening_float)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('cash.shifts.detail.expected')}</dt>
              <dd className="num">{formatMoney(shift.expected_cash)}</dd>
            </div>
            {shift.counted_cash !== null && (
              <div>
                <dt className="type-caption">{t('cash.shifts.detail.counted')}</dt>
                <dd className="num">{formatMoney(shift.counted_cash)}</dd>
              </div>
            )}
            {shift.difference !== null && (
              <div>
                <dt className="type-caption">{t('cash.shifts.detail.difference')}</dt>
                <dd className="num type-section-title">{formatMoney(shift.difference)}</dd>
              </div>
            )}
            {shift.difference_reason && (
              <div className="sm:col-span-2">
                <dt className="type-caption">{t('cash.shifts.detail.reason')}</dt>
                <dd dir="auto">{shift.difference_reason}</dd>
              </div>
            )}
            {counts.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="type-caption">{t('cash.shifts.detail.breakdown')}</dt>
                <dd dir="ltr" className="text-start">
                  {counts
                    .map((d) => `${d} × ${formatNumber(shift.count_breakdown?.[d] ?? 0)}`)
                    .join('  ·  ')}
                </dd>
              </div>
            )}
          </dl>
        </Card>
        <Card title={t('cash.shifts.takings.title')}>
          <ShiftTakings shift={shift} />
        </Card>
        <Card title={t('cash.shifts.current.movements')} padded={false}>
          <ShiftMovementsTable movements={shift.movements} />
        </Card>
      </div>
    </PageContainer>
  );
}
