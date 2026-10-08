import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockTransferSummary, TransferStatus } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatDateTime, formatNumber } from '@/lib/format';
import { stockApi, stockKeys, type TransferListParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import TransferForm from './TransferForm';
import { TRANSFER_TONE } from './transferShared';

const PAGE_SIZE = 50;
const STATUSES: TransferStatus[] = ['draft', 'sent', 'received', 'partially_received', 'cancelled'];

/** I03 transfers (stock.view): out of or into the caller's branches; a new one with transfer_send. */
export default function TransfersPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const branches = useBranches();
  const canSend = useCan('stock.transfer_send');
  const destinations = useQuery({
    queryKey: stockKeys.destinations(orgId),
    queryFn: stockApi.transferDestinations,
    enabled: canSend,
  });
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const params: TransferListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(status ? { status: status as TransferStatus } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: stockKeys.transfers(orgId, params),
    queryFn: () => stockApi.transfers(params),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnDef<StockTransferSummary, unknown>[] = [
    {
      id: 'number',
      header: t('stock.transfers.columns.number'),
      cell: ({ row }) => <span dir="ltr">{row.original.number}</span>,
    },
    {
      id: 'date',
      header: t('stock.transfers.columns.date'),
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'from',
      header: t('stock.transfers.columns.from'),
      cell: ({ row }) => row.original.from_branch_name,
    },
    {
      id: 'to',
      header: t('stock.transfers.columns.to'),
      cell: ({ row }) => row.original.to_branch_name,
    },
    {
      id: 'status',
      header: t('stock.transfers.columns.status'),
      cell: ({ row }) => (
        <Badge tone={TRANSFER_TONE[row.original.status]}>
          {t(`stock.transfers.statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'sent',
      header: t('stock.transfers.columns.sent'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.quantity_sent),
    },
    {
      id: 'received',
      header: t('stock.transfers.columns.received'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.quantity_received === null ? '' : formatNumber(row.original.quantity_received),
    },
    {
      id: 'by',
      header: t('stock.transfers.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
    {
      id: 'actions',
      header: t('stock.transfers.columns.actions'),
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/inventory/transfers/${row.original.id}`)}
        >
          {t('stock.transfers.view')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.transfers.title')}
        actions={
          canSend && (branches.data?.length ?? 0) > 0 ? (
            <Button onClick={() => setCreating(true)}>{t('stock.transfers.new')}</Button>
          ) : undefined
        }
      />
      <p className="type-caption mb-4">{t('stock.transfers.subtitle')}</p>
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
          label={t('stock.transfers.status')}
          value={status}
          options={[
            { value: '', label: t('stock.transfers.allStatuses') },
            ...STATUSES.map((s) => ({ value: s, label: t(`stock.transfers.statuses.${s}`) })),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('stock.transfers.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: t('stock.transfers.empty'), description: t('stock.transfers.emptyHint') }}
        server={{ page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage }}
      />
      {creating && (
        <TransferForm
          branches={branches.data ?? []}
          destinations={destinations.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/inventory/transfers/${saved.id}`)}
        />
      )}
    </PageContainer>
  );
}
