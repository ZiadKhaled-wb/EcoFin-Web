import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { BranchSummary, StockMovement } from '@ziadkhaled-wb/contracts';
import DataTable from '@/components/ui/DataTable';
import Drawer from '@/components/ui/Drawer';
import Select from '@/components/ui/Select';
import { formatDateTime, formatNumber } from '@/lib/format';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { documentHref, documentLabel } from './movementShared';

const PAGE_SIZE = 20;

export interface MovementsTarget {
  productId: string;
  name: string;
  branchId: string;
}

/**
 * I01 drill-down: a product's ledger movements, newest first, with the running balance. Each
 * document links to its screen (I05); "Full history" opens the movement history page.
 */
export default function StockMovementsDrawer({
  target,
  branches,
  onClose,
}: {
  target: MovementsTarget;
  branches: BranchSummary[];
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [branchId, setBranchId] = useState(target.branchId);
  const [page, setPage] = useState(1);
  const params = {
    product_id: target.productId,
    ...(branchId ? { branch_id: branchId } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const movements = useQuery({
    queryKey: stockKeys.movements(orgId, params),
    queryFn: () => stockApi.movements(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const columns: ColumnDef<StockMovement, unknown>[] = [
    {
      id: 'date',
      header: t('stock.drawer.date'),
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'type',
      header: t('stock.drawer.type'),
      cell: ({ row }) => (
        <span>
          {t(`stock.types.${row.original.type}`)}
          {row.original.reason && <> · {t(`stock.reasons.${row.original.reason}`)}</>}
          {row.original.stock_state === 'damaged' && (
            <span className="type-caption"> ({t('stock.drawer.damaged')})</span>
          )}
          {!branchId && (
            <span className="type-caption block">{branchName.get(row.original.branch_id)}</span>
          )}
        </span>
      ),
    },
    {
      id: 'quantity',
      header: t('stock.drawer.quantity'),
      meta: { numeric: true },
      cell: ({ row }) =>
        `${row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
    },
    {
      id: 'balance',
      header: t('stock.drawer.balance'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.balance_after),
    },
    {
      id: 'serial',
      header: t('stock.drawer.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.serial ?? ''}</span>,
    },
    {
      id: 'document',
      header: t('stock.drawer.document'),
      cell: ({ row }) => {
        const href = documentHref(row.original);
        const label = documentLabel(row.original);
        return href ? (
          <Link to={href} className="text-brand-700 hover:underline" dir="auto">
            {label}
          </Link>
        ) : (
          <span dir="auto">{label}</span>
        );
      },
    },
    {
      id: 'by',
      header: t('stock.drawer.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
  ];

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.drawer.title', { name: target.name })}
      side="end"
      className="w-[48rem]!"
    >
      <div className="space-y-4 overflow-y-auto p-4">
        <Link
          to={`/inventory/movements?${new URLSearchParams({
            product_id: target.productId,
            ...(branchId ? { branch_id: branchId } : {}),
          }).toString()}`}
          className="btn btn-ghost"
        >
          {t('stock.history.fullHistory')}
        </Link>
        <Select
          label={t('stock.branch')}
          value={branchId}
          options={[
            { value: '', label: t('stock.drawer.allBranches') },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
        />
        <DataTable
          caption={t('stock.drawer.title', { name: target.name })}
          columns={columns}
          data={movements.data?.items ?? []}
          loading={movements.isPending}
          error={movements.isError}
          onRetry={() => void movements.refetch()}
          getRowId={(m) => m.id}
          empty={{ title: t('stock.drawer.empty') }}
          server={{
            page,
            pageSize: PAGE_SIZE,
            total: movements.data?.total ?? 0,
            onPageChange: setPage,
          }}
        />
      </div>
    </Drawer>
  );
}
