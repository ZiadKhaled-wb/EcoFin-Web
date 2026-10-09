import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { PurchaseReturnSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import {
  purchaseReturnKeys,
  purchaseReturnsApi,
  type PurchaseReturnListParams,
} from '@/services/purchaseReturnsApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const PAGE_SIZE = 20;

/** U04: purchase returns of the caller's branches, newest first. */
export default function PurchaseReturnsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params: PurchaseReturnListParams = {
    ...(supplierId ? { supplier_id: supplierId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: purchaseReturnKeys.list(orgId, params),
    queryFn: () => purchaseReturnsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const suppliers = useQuery({
    queryKey: supplierKeys.list(orgId, { status: 'all', pageSize: 100 }),
    queryFn: () => suppliersApi.list({ status: 'all', pageSize: 100 }),
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  const columns: ColumnDef<PurchaseReturnSummary, unknown>[] = [
    {
      id: 'number',
      header: t('purchases.returns.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/returns/${row.original.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'invoice',
      header: t('purchases.returns.columns.invoice'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/invoices/${row.original.purchase_invoice_id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.invoice_number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: t('purchases.returns.columns.supplier'),
      cell: ({ row }) => row.original.supplier_name,
    },
    {
      id: 'branch',
      header: t('purchases.returns.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'date',
      header: t('purchases.returns.columns.date'),
      cell: ({ row }) => formatBusinessDate(row.original.business_date),
    },
    {
      id: 'refundMode',
      header: t('purchases.returns.columns.refundMode'),
      cell: ({ row }) => t(`purchases.returns.mode.${row.original.refund_mode}`),
    },
    {
      id: 'total',
      header: t('purchases.returns.columns.total'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.total),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.returns.title')}
        description={t('purchases.returns.description')}
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <Select
            label={t('purchases.returns.filters.supplier')}
            value={supplierId}
            options={[
              { value: '', label: t('purchases.returns.filters.allSuppliers') },
              ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={(e) => filter(setSupplierId)(e.target.value)}
          />
          <Select
            label={t('purchases.returns.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('purchases.returns.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('purchases.returns.filters.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('purchases.returns.filters.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
      </Card>
      <DataTable
        caption={t('purchases.returns.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{
          title: t('purchases.returns.empty'),
          description: t('purchases.returns.emptyHint'),
        }}
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
