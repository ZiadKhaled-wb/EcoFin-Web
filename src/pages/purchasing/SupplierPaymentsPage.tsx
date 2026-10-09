import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { SupplierPaymentSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import {
  supplierPaymentKeys,
  supplierPaymentsApi,
  type SupplierPaymentListParams,
} from '@/services/supplierPaymentsApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { STATE_TONE, paymentState } from './supplierPaymentShared';

const PAGE_SIZE = 20;

/** U03: supplier payments of the caller's branches, newest first; reversals are their own rows. */
export default function SupplierPaymentsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params: SupplierPaymentListParams = {
    ...(supplierId ? { supplier_id: supplierId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: supplierPaymentKeys.list(orgId, params),
    queryFn: () => supplierPaymentsApi.list(params),
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

  const columns: ColumnDef<SupplierPaymentSummary, unknown>[] = [
    {
      id: 'number',
      header: t('purchases.payments.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/payments/${row.original.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: t('purchases.payments.columns.supplier'),
      cell: ({ row }) => row.original.supplier_name,
    },
    {
      id: 'branch',
      header: t('purchases.payments.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'date',
      header: t('purchases.payments.columns.date'),
      cell: ({ row }) => formatBusinessDate(row.original.business_date),
    },
    {
      id: 'account',
      header: t('purchases.payments.columns.account'),
      cell: ({ row }) => row.original.cash_account_name,
    },
    {
      id: 'state',
      header: t('purchases.payments.columns.state'),
      cell: ({ row }) => {
        const state = paymentState(row.original);
        return <Badge tone={STATE_TONE[state]}>{t(`purchases.payments.state.${state}`)}</Badge>;
      },
    },
    {
      id: 'amount',
      header: t('purchases.payments.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.amount),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.payments.title')}
        description={t('purchases.payments.description')}
        actions={
          <Can permission="supplier.payment_create">
            <Link to="/purchasing/payments/new" className="btn btn-primary">
              {t('purchases.payments.new')}
            </Link>
          </Can>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <Select
            label={t('purchases.payments.filters.supplier')}
            value={supplierId}
            options={[
              { value: '', label: t('purchases.payments.filters.allSuppliers') },
              ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={(e) => filter(setSupplierId)(e.target.value)}
          />
          <Select
            label={t('purchases.payments.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('purchases.payments.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('purchases.payments.filters.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('purchases.payments.filters.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
      </Card>
      <DataTable
        caption={t('purchases.payments.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{
          title: t('purchases.payments.empty'),
          description: t('purchases.payments.emptyHint'),
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
