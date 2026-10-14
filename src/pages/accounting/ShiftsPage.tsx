import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ShiftStatus, type ShiftSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import ForceCloseShiftDialog from './ForceCloseShiftDialog';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import ErrorState from '@/components/ui/ErrorState';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatDateTime, formatMoney } from '@/lib/format';
import { shiftKeys, shiftsApi, type ShiftListParams } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  CloseShiftDialog,
  ShiftTakings,
  OpenShiftForm,
  ShiftCashDialog,
  ShiftMovementsTable,
} from './ShiftParts';

const PAGE_SIZE = 20;
const STATUSES = ShiftStatus.options;
const isStatus = (v: string): v is ShiftStatus => (STATUSES as readonly string[]).includes(v);

/**
 * K02: the cashier's own shift (open it, move cash to and from a safe, close it with a count)
 * and the shift history (own shifts; with cash.view every shift of the caller's branches).
 */
export default function ShiftsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const canOperate = useCan('shift.operate');
  const canForceClose = useCan('cash.adjust');
  const [forceClosing, setForceClosing] = useState<ShiftSummary | null>(null);
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params: ShiftListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: shiftKeys.list(orgId, params),
    queryFn: () => shiftsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  const columns: ColumnDef<ShiftSummary, unknown>[] = [
    ...(canForceClose
      ? [
          {
            id: 'force-close',
            header: t('cash.shifts.forceClose.title'),
            cell: ({ row }) =>
              row.original.status === 'open' && row.original.device_revoked === true ? (
                <Button variant="danger" onClick={() => setForceClosing(row.original)}>
                  {t('cash.shifts.forceClose.title')}
                </Button>
              ) : null,
          } satisfies ColumnDef<ShiftSummary, unknown>,
        ]
      : []),
    {
      id: 'number',
      header: t('cash.shifts.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/accounting/shifts/${row.original.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'cashier',
      header: t('cash.shifts.columns.cashier'),
      cell: ({ row }) => row.original.employee_name,
    },
    {
      id: 'branch',
      header: t('cash.shifts.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'opened',
      header: t('cash.shifts.columns.opened'),
      cell: ({ row }) => formatDateTime(row.original.opened_at),
    },
    {
      id: 'status',
      header: t('cash.shifts.columns.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.status === 'open' ? 'warning' : 'neutral'}>
          {t(`cash.shifts.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'expected',
      header: t('cash.shifts.columns.expected'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.expected_cash),
    },
    {
      id: 'counted',
      header: t('cash.shifts.columns.counted'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.counted_cash === null ? '' : formatMoney(row.original.counted_cash),
    },
    {
      id: 'difference',
      header: t('cash.shifts.columns.difference'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.difference === null ? '' : formatMoney(row.original.difference),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title={t('cash.shifts.title')} description={t('cash.shifts.description')} />
      {canOperate && <MyShift />}
      {forceClosing && (
        <ForceCloseShiftDialog shift={forceClosing} onClose={() => setForceClosing(null)} />
      )}
      <h2 className="type-section-title mb-3 mt-6">{t('cash.shifts.history')}</h2>
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <Select
            label={t('cash.shifts.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('cash.shifts.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <Select
            label={t('cash.shifts.filters.status')}
            value={status}
            options={[
              { value: '', label: t('cash.shifts.filters.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: t(`cash.shifts.status.${s}`) })),
            ]}
            onChange={(e) => filter(setStatus)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('cash.shifts.filters.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('cash.shifts.filters.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
      </Card>
      <DataTable
        caption={t('cash.shifts.history')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{ title: t('cash.shifts.empty'), description: t('cash.shifts.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </PageContainer>
  );
}

/** The caller's open shift, or the form to open one. */
function MyShift() {
  const orgId = useAuthStore((s) => s.orgId);
  const current = useQuery({
    queryKey: shiftKeys.current(orgId),
    queryFn: shiftsApi.current,
  });
  const [moving, setMoving] = useState<'in' | 'out' | null>(null);
  const [closing, setClosing] = useState(false);
  const shift = current.data;

  return (
    <Card title={t('cash.shifts.mine')}>
      {current.isPending ? (
        <Skeleton className="h-24" />
      ) : current.isError ? (
        <ErrorState
          title={t('cash.shifts.detail.loadFailed')}
          onRetry={() => void current.refetch()}
        />
      ) : shift?.device_revoked ? (
        <Notice tone="error">{t('cash.shifts.revoked')}</Notice>
      ) : !shift ? (
        <div className="space-y-4">
          <p className="type-body">{t('cash.shifts.none')}</p>
          <OpenShiftForm />
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('cash.shifts.current.number')}</dt>
              <dd dir="ltr" className="text-start">
                {shift.number}
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('cash.shifts.current.openedAt')}</dt>
              <dd>{formatDateTime(shift.opened_at)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('cash.shifts.current.float')}</dt>
              <dd className="num">{formatMoney(shift.opening_float)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('cash.shifts.current.expected')}</dt>
              <dd className="num type-section-title" data-testid="shift-expected">
                {formatMoney(shift.expected_cash)}
              </dd>
              <dd className="type-caption">{t('cash.shifts.current.expectedHelp')}</dd>
            </div>
          </dl>
          <div className="space-y-1">
            <p className="type-caption">{t('cash.shifts.takings.title')}</p>
            <ShiftTakings shift={shift} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMoving('in')}>
              {t('cash.shifts.current.cashIn')}
            </Button>
            <Button variant="secondary" onClick={() => setMoving('out')}>
              {t('cash.shifts.current.cashOut')}
            </Button>
            <Button variant="danger" onClick={() => setClosing(true)}>
              {t('cash.shifts.current.close')}
            </Button>
          </div>
          <div className="rounded-control border border-line">
            <ShiftMovementsTable movements={shift.movements} />
          </div>
          {moving && (
            <ShiftCashDialog shift={shift} direction={moving} onClose={() => setMoving(null)} />
          )}
          {closing && <CloseShiftDialog shift={shift} onClose={() => setClosing(false)} />}
        </div>
      )}
    </Card>
  );
}
