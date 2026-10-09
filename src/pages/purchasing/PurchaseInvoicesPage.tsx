import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PurchaseInvoiceStatus, type PurchaseInvoiceSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import {
  purchaseInvoiceKeys,
  purchaseInvoicesApi,
  type PurchaseInvoiceListParams,
} from '@/services/purchaseInvoicesApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { STATUS_TONE } from './purchaseShared';

const PAGE_SIZE = 20;
const STATUSES = PurchaseInvoiceStatus.options;
const isStatus = (v: string): v is PurchaseInvoiceStatus =>
  (STATUSES as readonly string[]).includes(v);

/** U02: purchase invoices of the caller's branches, newest invoice date first. */
export default function PurchaseInvoicesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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

  const params: PurchaseInvoiceListParams = {
    ...(supplierId ? { supplier_id: supplierId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(search ? { search } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: purchaseInvoiceKeys.list(orgId, params),
    queryFn: () => purchaseInvoicesApi.list(params),
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

  const columns: ColumnDef<PurchaseInvoiceSummary, unknown>[] = [
    {
      id: 'number',
      header: t('purchases.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/invoices/${row.original.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'supplierInvoiceNo',
      header: t('purchases.columns.supplierInvoiceNo'),
      cell: ({ row }) => <span dir="ltr">{row.original.supplier_invoice_no ?? ''}</span>,
    },
    {
      id: 'supplier',
      header: t('purchases.columns.supplier'),
      cell: ({ row }) => row.original.supplier_name,
    },
    {
      id: 'branch',
      header: t('purchases.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'date',
      header: t('purchases.columns.date'),
      cell: ({ row }) => formatBusinessDate(row.original.invoice_date),
    },
    {
      id: 'status',
      header: t('purchases.columns.status'),
      cell: ({ row }) => (
        <Badge tone={STATUS_TONE[row.original.status]}>
          {t(`purchases.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'total',
      header: t('purchases.columns.total'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.total),
    },
    {
      id: 'outstanding',
      header: t('purchases.columns.outstanding'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.outstanding === null ? '' : formatMoney(row.original.outstanding),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.title')}
        description={t('purchases.description')}
        actions={
          <Can permission="purchase.invoice_create">
            <Link to="/purchasing/invoices/new" className="btn btn-primary">
              {t('purchases.new')}
            </Link>
          </Can>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 md:items-end">
          <div className="md:col-span-3 lg:col-span-2">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              label={t('purchases.filters.search')}
              placeholder={t('purchases.filters.search')}
            />
          </div>
          <Select
            label={t('purchases.filters.supplier')}
            value={supplierId}
            options={[
              { value: '', label: t('purchases.filters.allSuppliers') },
              ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={(e) => filter(setSupplierId)(e.target.value)}
          />
          <Select
            label={t('purchases.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('purchases.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <Select
            label={t('purchases.filters.status')}
            value={status}
            options={[
              { value: '', label: t('purchases.filters.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: t(`purchases.status.${s}`) })),
            ]}
            onChange={(e) => filter(setStatus)(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField
              type="date"
              ltr
              label={t('purchases.filters.from')}
              value={from}
              max={to || undefined}
              onChange={(e) => filter(setFrom)(e.target.value)}
            />
            <FormField
              type="date"
              ltr
              label={t('purchases.filters.to')}
              value={to}
              min={from || undefined}
              onChange={(e) => filter(setTo)(e.target.value)}
            />
          </div>
        </div>
      </Card>
      <DataTable
        caption={t('purchases.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{ title: t('purchases.empty'), description: t('purchases.emptyHint') }}
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
