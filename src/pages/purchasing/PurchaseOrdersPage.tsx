import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PurchaseOrderStatus, type PurchaseOrderSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatNumber } from '@/lib/format';
import {
  purchaseOrderKeys,
  purchaseOrdersApi,
  type PurchaseOrderListParams,
} from '@/services/purchaseOrdersApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { ORDER_STATUS_TONE } from './purchaseOrderShared';

const PAGE_SIZE = 20;
const STATUSES = PurchaseOrderStatus.options;
const isStatus = (v: string): v is PurchaseOrderStatus =>
  (STATUSES as readonly string[]).includes(v);

/** U05: purchase orders of the caller's branches, newest first. */
export default function PurchaseOrdersPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params: PurchaseOrderListParams = {
    ...(supplierId ? { supplier_id: supplierId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(search ? { search } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: purchaseOrderKeys.list(orgId, params),
    queryFn: () => purchaseOrdersApi.list(params),
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

  const columns: ColumnDef<PurchaseOrderSummary, unknown>[] = [
    {
      id: 'number',
      header: t('purchases.orders.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/orders/${row.original.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: t('purchases.orders.columns.supplier'),
      cell: ({ row }) => row.original.supplier_name,
    },
    {
      id: 'branch',
      header: t('purchases.orders.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'expectedDate',
      header: t('purchases.orders.columns.expectedDate'),
      cell: ({ row }) =>
        row.original.expected_date ? formatBusinessDate(row.original.expected_date) : '',
    },
    {
      id: 'status',
      header: t('purchases.orders.columns.status'),
      cell: ({ row }) => (
        <Badge tone={ORDER_STATUS_TONE[row.original.status]}>
          {t(`purchases.orders.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'lines',
      header: t('purchases.orders.columns.lines'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.lines_count),
    },
    {
      id: 'received',
      header: t('purchases.orders.columns.received'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span dir="ltr">
          {formatNumber(row.original.received)} / {formatNumber(row.original.ordered)}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.orders.title')}
        description={t('purchases.orders.description')}
        actions={
          <Can permission="purchase.order_manage">
            <Link to="/purchasing/orders/new" className="btn btn-primary">
              {t('purchases.orders.new')}
            </Link>
          </Can>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            label={t('purchases.orders.filters.search')}
            placeholder={t('purchases.orders.filters.search')}
          />
          <Select
            label={t('purchases.orders.filters.supplier')}
            value={supplierId}
            options={[
              { value: '', label: t('purchases.orders.filters.allSuppliers') },
              ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={(e) => filter(setSupplierId)(e.target.value)}
          />
          <Select
            label={t('purchases.orders.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('purchases.orders.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <Select
            label={t('purchases.orders.filters.status')}
            value={status}
            options={[
              { value: '', label: t('purchases.orders.filters.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: t(`purchases.orders.status.${s}`) })),
            ]}
            onChange={(e) => filter(setStatus)(e.target.value)}
          />
        </div>
      </Card>
      <DataTable
        caption={t('purchases.orders.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{
          title: t('purchases.orders.empty'),
          description: t('purchases.orders.emptyHint'),
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
