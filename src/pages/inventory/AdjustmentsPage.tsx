import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  AdjustmentReason,
  BranchSummary,
  StockAdjustmentLine,
  StockAdjustmentSummary,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Drawer from '@/components/ui/Drawer';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatDateTime, formatNumber } from '@/lib/format';
import { stockApi, stockKeys, type AdjustmentListParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import AdjustmentForm from './AdjustmentForm';

const PAGE_SIZE = 50;
const REASONS: AdjustmentReason[] = ['damage', 'loss', 'found', 'correction', 'count', 'other'];

/** I02 adjustments: the list (stock.view) and a new adjustment (stock.adjust). */
export default function AdjustmentsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const canAdjust = useCan('stock.adjust');
  const [branchId, setBranchId] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  // ?view=<id> (from the movement history, I05) opens that adjustment.
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewing, setViewingState] = useState<string | null>(searchParams.get('view'));
  const setViewing = (id: string | null) => {
    setViewingState(id);
    if (!id && searchParams.has('view')) {
      setSearchParams(
        (p) => {
          const out = new URLSearchParams(p);
          out.delete('view');
          return out;
        },
        { replace: true },
      );
    }
  };

  const params: AdjustmentListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(reason ? { reason: reason as AdjustmentReason } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: stockKeys.adjustments(orgId, params),
    queryFn: () => stockApi.adjustments(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));

  const columns: ColumnDef<StockAdjustmentSummary, unknown>[] = [
    {
      id: 'number',
      header: t('stock.adjustments.columns.number'),
      cell: ({ row }) => <span dir="ltr">{row.original.number}</span>,
    },
    {
      id: 'date',
      header: t('stock.adjustments.columns.date'),
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'branch',
      header: t('stock.adjustments.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'reason',
      header: t('stock.adjustments.columns.reason'),
      cell: ({ row }) => (
        <Badge tone={row.original.reason === 'count' ? 'brand' : 'neutral'}>
          {t(`stock.reasons.${row.original.reason}`)}
        </Badge>
      ),
    },
    {
      id: 'lines',
      header: t('stock.adjustments.columns.lines'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.lines_count),
    },
    {
      id: 'in',
      header: t('stock.adjustments.columns.in'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.quantity_in ? `+${formatNumber(row.original.quantity_in)}` : '',
    },
    {
      id: 'out',
      header: t('stock.adjustments.columns.out'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.quantity_out ? `-${formatNumber(row.original.quantity_out)}` : '',
    },
    {
      id: 'by',
      header: t('stock.adjustments.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
    {
      id: 'note',
      header: t('stock.adjustments.columns.note'),
      cell: ({ row }) => (
        <span dir="auto">
          {row.original.count_number
            ? t('stock.adjustments.fromCount', { number: row.original.count_number })
            : (row.original.note ?? '')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('stock.adjustments.columns.actions'),
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => setViewing(row.original.id)}>
          {t('stock.adjustments.view')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.adjustments.title')}
        actions={
          canAdjust && (branches.data?.length ?? 0) > 0 ? (
            <Button onClick={() => setCreating(true)}>{t('stock.adjustments.new')}</Button>
          ) : undefined
        }
      />
      <p className="type-caption mb-4">{t('stock.adjustments.subtitle')}</p>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Select
          label={t('stock.branch')}
          value={branchId}
          options={[
            { value: '', label: t('stock.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t('stock.adjustments.reason')}
          value={reason}
          options={[
            { value: '', label: t('stock.adjustments.allReasons') },
            ...REASONS.map((r) => ({ value: r, label: t(`stock.reasons.${r}`) })),
          ]}
          onChange={(e) => {
            setReason(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('stock.adjustments.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(r) => r.id}
        empty={{
          title: t('stock.adjustments.empty'),
          description: t('stock.adjustments.emptyHint'),
        }}
        server={{ page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage }}
      />
      {creating && (
        <AdjustmentForm branches={branches.data ?? []} onClose={() => setCreating(false)} />
      )}
      {viewing && (
        <AdjustmentDrawer
          id={viewing}
          branches={branches.data ?? []}
          onClose={() => setViewing(null)}
        />
      )}
    </PageContainer>
  );
}

/** One adjustment with its lines. */
function AdjustmentDrawer({
  id,
  branches,
  onClose,
}: {
  id: string;
  branches: BranchSummary[];
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const adjustment = useQuery({
    queryKey: stockKeys.adjustment(orgId, id),
    queryFn: () => stockApi.adjustment(id),
  });
  const a = adjustment.data;
  const name = (l: StockAdjustmentLine) =>
    getLanguage() === 'en' && l.name_en ? l.name_en : l.name_ar;
  const columns: ColumnDef<StockAdjustmentLine, unknown>[] = [
    {
      id: 'product',
      header: t('stock.adjustments.form.product'),
      cell: ({ row }) => (
        <span>
          <span className="block">{name(row.original)}</span>
          <span className="type-caption block" dir="ltr">
            {row.original.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'serial',
      header: t('stock.adjustments.form.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.serial ?? ''}</span>,
    },
    {
      id: 'quantity',
      header: t('stock.adjustments.form.quantity'),
      meta: { numeric: true },
      cell: ({ row }) =>
        `${row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
    },
  ];
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.adjustments.detailTitle', { number: a?.number ?? '' })}
      side="end"
      className="w-[40rem]!"
    >
      <div className="space-y-4 overflow-y-auto p-4">
        {a && (
          <dl className="grid grid-cols-2 gap-2">
            <dt className="type-label">{t('stock.adjustments.columns.branch')}</dt>
            <dd>{branches.find((b) => b.id === a.branch_id)?.name ?? ''}</dd>
            <dt className="type-label">{t('stock.adjustments.columns.reason')}</dt>
            <dd>{t(`stock.reasons.${a.reason}`)}</dd>
            <dt className="type-label">{t('stock.adjustments.columns.date')}</dt>
            <dd>{formatDateTime(a.created_at)}</dd>
            <dt className="type-label">{t('stock.adjustments.columns.by')}</dt>
            <dd>{a.created_by_name ?? ''}</dd>
            {(a.note || a.count_number) && (
              <>
                <dt className="type-label">{t('stock.adjustments.columns.note')}</dt>
                <dd dir="auto">
                  {a.count_number
                    ? t('stock.adjustments.fromCount', { number: a.count_number })
                    : a.note}
                </dd>
              </>
            )}
          </dl>
        )}
        <DataTable
          caption={t('stock.adjustments.detailTitle', { number: a?.number ?? '' })}
          columns={columns}
          data={a?.lines ?? []}
          loading={adjustment.isPending}
          error={adjustment.isError}
          onRetry={() => void adjustment.refetch()}
          getRowId={(l) => l.id}
          empty={{ title: t('stock.adjustments.form.noLines') }}
        />
      </div>
    </Drawer>
  );
}
