import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Customer, CustomerStatusFilter } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { useCan } from '@/features/me/useCan';
import { formatMoney, formatNumber } from '@/lib/format';
import { customerKeys, customersApi, type CustomerListParams } from '@/services/customersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import CustomerForm from './CustomerForm';
import CustomerStatusDialog from './CustomerStatusDialog';
import { STATUS_TONE, shownNationalId } from './customerShared';

const PAGE_SIZE = 20;
const STATUSES: CustomerStatusFilter[] = ['all', 'active', 'watch', 'blocked'];

/**
 * R01 customers (D62): search by name, phone or national ID, add (customer.create), edit and
 * block / unblock (customer.edit). The national ID column shows what the server sent: the full
 * number with customer.view_pii, otherwise its last four digits.
 */
export default function CustomersPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canCreate = useCan('customer.create');
  const canEdit = useCan('customer.edit');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Customer | null>(null);

  // Debounced search: the request goes out ~300 ms after the last key.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params: CustomerListParams = {
    ...(search ? { search } : {}),
    status,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: customerKeys.list(orgId, params),
    queryFn: () => customersApi.list(params),
    placeholderData: keepPreviousData,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: customerKeys.all(orgId) });

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      id: 'name',
      header: t('customers.columns.name'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/customers/${row.original.id}`} className="text-brand-700 hover:underline">
            {row.original.full_name}
          </Link>
          {row.original.is_business && <Badge tone="brand">{t('customers.businessBadge')}</Badge>}
        </span>
      ),
    },
    {
      id: 'phone',
      header: t('customers.columns.phone'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <span dir="ltr">{row.original.phones[0] ?? ''}</span>
          {row.original.phones.length > 1 && (
            <span className="type-caption">
              {t('customers.morePhones', { count: formatNumber(row.original.phones.length - 1) })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'nationalId',
      header: t('customers.columns.nationalId'),
      cell: ({ row }) => (
        <span dir="ltr" className="num">
          {shownNationalId(row.original)}
        </span>
      ),
    },
    {
      id: 'city',
      header: t('customers.columns.city'),
      cell: ({ row }) => row.original.city ?? '',
    },
    {
      id: 'income',
      header: t('customers.columns.income'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.monthly_income === null ? '' : formatMoney(row.original.monthly_income),
    },
    {
      id: 'status',
      header: t('customers.columns.status'),
      cell: ({ row }) => (
        <Badge tone={STATUS_TONE[row.original.status]}>
          {t(`customers.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('customers.columns.actions'),
      cell: ({ row }) => (
        <Can permission="customer.edit">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(row.original);
                setFormOpen(true);
              }}
            >
              {t('customers.editAction')}
            </Button>
            <Button
              size="sm"
              variant={row.original.status === 'blocked' ? 'primary' : 'ghost'}
              onClick={() => setStatusTarget(row.original)}
            >
              {t(row.original.status === 'blocked' ? 'customers.unblock' : 'customers.block')}
            </Button>
          </div>
        </Can>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        actions={
          <Can permission="customer.create">
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('customers.add')}
            </Button>
          </Can>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr] md:items-end">
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('customers.search')}
          placeholder={t('customers.search')}
        />
        <Select
          label={t('customers.statusFilter')}
          value={status}
          options={STATUSES.map((s) => ({ value: s, label: t(`customers.status.${s}`) }))}
          onChange={(e) => {
            setStatus(e.target.value as CustomerStatusFilter);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('customers.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{ title: t('customers.empty'), description: t('customers.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
      {formOpen && (editing ? canEdit : canCreate) && (
        <CustomerForm
          key={editing?.id ?? 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          customer={editing}
          onSaved={() => void refresh()}
        />
      )}
      {canEdit && (
        <CustomerStatusDialog
          key={statusTarget?.id ?? 'none'}
          customer={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSaved={() => void refresh()}
        />
      )}
    </PageContainer>
  );
}
