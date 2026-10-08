import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  BranchSummary,
  Category,
  StockCount,
  StockCountStatus,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { formatDateTime, formatNumber } from '@/lib/format';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { stockApi, stockKeys, type CountListParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { COUNT_TONE, countError } from './countShared';

const PAGE_SIZE = 50;
const STATUSES: StockCountStatus[] = ['open', 'posted', 'cancelled'];
/** I02 counts (stock.count): the list, and starting a new count sheet. */
export default function CountsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const branches = useBranches();
  const categories = useQuery({ queryKey: categoryKeys.list(orgId), queryFn: categoriesApi.list });
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const params: CountListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(status ? { status: status as StockCountStatus } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: stockKeys.counts(orgId, params),
    queryFn: () => stockApi.counts(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));

  const columns: ColumnDef<StockCount, unknown>[] = [
    {
      id: 'number',
      header: t('stock.counts.columns.number'),
      cell: ({ row }) => <span dir="ltr">{row.original.number}</span>,
    },
    {
      id: 'date',
      header: t('stock.counts.columns.date'),
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'branch',
      header: t('stock.counts.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    {
      id: 'category',
      header: t('stock.counts.columns.category'),
      cell: ({ row }) => row.original.category_name ?? t('stock.counts.wholeBranch'),
    },
    {
      id: 'status',
      header: t('stock.counts.columns.status'),
      cell: ({ row }) => (
        <Badge tone={COUNT_TONE[row.original.status]}>
          {t(`stock.counts.statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'progress',
      header: t('stock.counts.columns.progress'),
      cell: ({ row }) =>
        t('stock.counts.progress', {
          counted: formatNumber(row.original.lines_counted),
          total: formatNumber(row.original.lines_total),
        }),
    },
    {
      id: 'different',
      header: t('stock.counts.columns.different'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.lines_different),
    },
    {
      id: 'by',
      header: t('stock.counts.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
    {
      id: 'actions',
      header: t('stock.counts.columns.actions'),
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/inventory/counts/${row.original.id}`)}
        >
          {t('stock.counts.open')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.counts.title')}
        actions={
          (branches.data?.length ?? 0) > 0 ? (
            <Button onClick={() => setCreating(true)}>{t('stock.counts.new')}</Button>
          ) : undefined
        }
      />
      <p className="type-caption mb-4">{t('stock.counts.subtitle')}</p>
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
          label={t('stock.counts.status')}
          value={status}
          options={[
            { value: '', label: t('stock.counts.allStatuses') },
            ...STATUSES.map((s) => ({ value: s, label: t(`stock.counts.statuses.${s}`) })),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('stock.counts.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: t('stock.counts.empty'), description: t('stock.counts.emptyHint') }}
        server={{ page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage }}
      />
      {creating && (
        <NewCountDialog
          branches={branches.data ?? []}
          categories={(categories.data ?? []).filter((c) => !c.archived_at)}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/inventory/counts/${id}`)}
        />
      )}
    </PageContainer>
  );
}

/** Mounted per opening, so it starts with a new idempotency key. */
function NewCountDialog({
  branches,
  categories,
  onClose,
  onCreated,
}: {
  branches: BranchSummary[];
  categories: Category[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const count = await stockApi.createCount(
        { branch_id: branchId, ...(categoryId ? { category_id: categoryId } : {}) },
        key,
      );
      onCreated(count.id);
    } catch (err) {
      setError(countError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.counts.form.title')}
      description={t('stock.counts.form.help')}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Select
          label={t('stock.counts.form.branch')}
          value={branchId}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          onChange={(e) => setBranchId(e.target.value)}
        />
        <Select
          label={t('stock.counts.form.category')}
          value={categoryId}
          options={[
            { value: '', label: t('stock.counts.form.allCategories') },
            ...categories.map((c) => ({
              value: c.id,
              label: `${c.parent_id ? '— ' : ''}${c.name}`,
            })),
          ]}
          onChange={(e) => setCategoryId(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!branchId}>
            {t('stock.counts.form.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
