import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Supplier, SupplierStatus } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber } from '@/lib/format';
import { supplierKeys, suppliersApi, type SupplierListParams } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import SupplierForm from './SupplierForm';
import { owesSupplier } from './supplierShared';

const PAGE_SIZE = 20;
const STATUSES: SupplierStatus[] = ['active', 'archived', 'all'];

/** Refusals of archive and restore, translated (D53). */
const ARCHIVE_ERRORS: Partial<Record<string, TranslationKey>> = {
  SUPPLIER_HAS_BALANCE: 'suppliers.errors.hasBalance',
  SUPPLIER_HAS_OPEN_DOCUMENTS: 'suppliers.errors.hasOpenDocuments',
  SUPPLIER_NAME_TAKEN: 'suppliers.errors.restoreNameTaken',
  SUPPLIER_PHONE_TAKEN: 'suppliers.errors.restorePhoneTaken',
  SUPPLIER_NOT_FOUND: 'suppliers.errors.notFound',
  PERMISSION_DENIED: 'suppliers.errors.permission',
};

/**
 * U01 suppliers (D53): anyone working with purchases sees the list and the balances; adding,
 * editing, deactivating and restoring need supplier.manage (the server checks every call).
 */
export default function SuppliersPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('supplier.manage');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierStatus>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);

  // Debounced search: the request goes out ~300 ms after the last key.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params: SupplierListParams = {
    ...(search ? { search } : {}),
    status,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: supplierKeys.list(orgId, params),
    queryFn: () => suppliersApi.list(params),
    placeholderData: keepPreviousData,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) });
  const failed = (e: unknown) =>
    notify.error(
      t(ARCHIVE_ERRORS[e instanceof ApiError ? e.code : ''] ?? 'suppliers.errors.failed'),
    );

  async function archive() {
    if (!archiveTarget) return;
    try {
      await suppliersApi.archive(archiveTarget.id);
      notify.success(t('suppliers.archived'));
      await refresh();
    } catch (e) {
      failed(e);
    } finally {
      setArchiveTarget(null);
    }
  }

  async function restore(supplier: Supplier) {
    try {
      await suppliersApi.restore(supplier.id);
      notify.success(t('suppliers.restored'));
      await refresh();
    } catch (e) {
      failed(e);
    }
  }

  const columns: ColumnDef<Supplier, unknown>[] = [
    {
      id: 'name',
      header: t('suppliers.columns.name'),
      cell: ({ row }) => (
        <Link to={`/suppliers/${row.original.id}`} className="text-brand-700 hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'phone',
      header: t('suppliers.columns.phone'),
      cell: ({ row }) => <span dir="ltr">{row.original.phone ?? ''}</span>,
    },
    {
      id: 'taxNo',
      header: t('suppliers.columns.taxNo'),
      cell: ({ row }) => <span dir="ltr">{row.original.tax_registration_no ?? ''}</span>,
    },
    {
      id: 'terms',
      header: t('suppliers.columns.terms'),
      cell: ({ row }) =>
        row.original.payment_terms_days > 0
          ? t('suppliers.termsDays', { count: formatNumber(row.original.payment_terms_days) })
          : t('suppliers.termsNone'),
    },
    {
      id: 'balance',
      header: t('suppliers.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={cn(owesSupplier(row.original.balance) && 'text-danger-700')}>
          {formatMoney(row.original.balance)}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('suppliers.columns.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.archived_at ? 'neutral' : 'success'}>
          {t(row.original.archived_at ? 'suppliers.status.archived' : 'suppliers.status.active')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('suppliers.columns.actions'),
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/suppliers/${row.original.id}`)}
          >
            {t('suppliers.statementAction')}
          </Button>
          <Can permission="supplier.manage">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!!row.original.archived_at}
                onClick={() => {
                  setEditing(row.original);
                  setFormOpen(true);
                }}
              >
                {t('suppliers.editAction')}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  row.original.archived_at
                    ? void restore(row.original)
                    : setArchiveTarget(row.original)
                }
              >
                {t(row.original.archived_at ? 'suppliers.restore' : 'suppliers.archive')}
              </Button>
            </div>
          </Can>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('suppliers.title')}
        description={t('suppliers.description')}
        actions={
          <Can permission="supplier.manage">
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('suppliers.add')}
            </Button>
          </Can>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr] md:items-end">
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('suppliers.search')}
          placeholder={t('suppliers.search')}
        />
        <Select
          label={t('suppliers.statusFilter')}
          value={status}
          options={STATUSES.map((s) => ({ value: s, label: t(`suppliers.status.${s}`) }))}
          onChange={(e) => {
            setStatus(e.target.value as SupplierStatus);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('suppliers.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        rowClassName={(row) => (row.archived_at ? 'opacity-60' : undefined)}
        empty={{ title: t('suppliers.empty'), description: t('suppliers.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
      {canManage && formOpen && (
        <SupplierForm
          key={editing?.id ?? 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          supplier={editing}
          onSaved={() => void refresh()}
        />
      )}
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(v) => !v && setArchiveTarget(null)}
        title={t('suppliers.archiveTitle')}
        description={t('suppliers.archiveConfirm')}
        confirmLabel={t('suppliers.archive')}
        tone="danger"
        onConfirm={() => void archive()}
      />
    </PageContainer>
  );
}
