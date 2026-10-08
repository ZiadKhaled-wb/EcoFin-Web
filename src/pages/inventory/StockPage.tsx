import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockRow } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import DataTable from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { formatNumber } from '@/lib/format';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { stockApi, stockKeys, type StockListParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import StockMovementsDrawer, { type MovementsTarget } from './StockMovementsDrawer';

const PAGE_SIZE = 50;

/** I01 stock view: per product and branch, on hand / reserved / available / in transit. */
export default function StockPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const categories = useQuery({
    queryKey: categoryKeys.list(orgId),
    queryFn: categoriesApi.list,
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeSub, setIncludeSub] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [drill, setDrill] = useState<MovementsTarget | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params: StockListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(categoryId ? { category_id: categoryId, include_subcategories: includeSub } : {}),
    ...(search ? { search } : {}),
    ...(lowOnly ? { low_only: true } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const stock = useQuery({
    queryKey: stockKeys.list(orgId, params),
    queryFn: () => stockApi.list(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const productName = (r: StockRow) => r.name_ar;

  const qty = (
    id: keyof Pick<
      StockRow,
      'on_hand' | 'reserved' | 'available' | 'in_transit' | 'damaged' | 'min_level'
    >,
    key: TranslationKey,
  ): ColumnDef<StockRow, unknown> => ({
    id,
    header: t(key),
    meta: { numeric: true },
    cell: ({ row }) => formatNumber(row.original[id]),
  });

  const columns: ColumnDef<StockRow, unknown>[] = [
    {
      id: 'product',
      header: t('stock.columns.product'),
      cell: ({ row }) => (
        <div>
          <span className="block">{row.original.name_ar}</span>
          {row.original.name_en && (
            <span className="type-caption block" dir="auto">
              {row.original.name_en}
            </span>
          )}
          {row.original.archived_at && <Badge tone="neutral">{t('stock.archived')}</Badge>}
        </div>
      ),
    },
    {
      id: 'sku',
      header: t('stock.columns.sku'),
      cell: ({ row }) => <span dir="ltr">{row.original.sku}</span>,
    },
    {
      id: 'branch',
      header: t('stock.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.branch_id) ?? '',
    },
    qty('on_hand', 'stock.columns.onHand'),
    qty('reserved', 'stock.columns.reserved'),
    qty('available', 'stock.columns.available'),
    qty('in_transit', 'stock.columns.inTransit'),
    qty('damaged', 'stock.columns.damaged'),
    qty('min_level', 'stock.columns.minLevel'),
    {
      id: 'status',
      header: t('stock.columns.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.low ? 'danger' : 'success'}>
          {t(row.original.low ? 'stock.low' : 'stock.ok')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('stock.columns.actions'),
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setDrill({
              productId: row.original.product_id,
              name: productName(row.original),
              branchId: row.original.branch_id,
            })
          }
        >
          {t('stock.movements')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title={t('stock.title')} />
      <p className="type-caption mb-4">{t('stock.subtitle')}</p>
      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr] md:items-end">
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('stock.search')}
          placeholder={t('stock.search')}
        />
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
          label={t('stock.category')}
          value={categoryId}
          options={[
            { value: '', label: t('stock.allCategories') },
            ...(categories.data ?? [])
              .filter((c) => !c.archived_at)
              .map((c) => ({ value: c.id, label: `${c.parent_id ? '— ' : ''}${c.name}` })),
          ]}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        />
        <Checkbox
          label={t('stock.includeSubcategories')}
          checked={includeSub}
          disabled={!categoryId}
          onChange={(e) => {
            setIncludeSub(e.target.checked);
            setPage(1);
          }}
        />
        <Checkbox
          label={t('stock.lowOnly')}
          checked={lowOnly}
          onChange={(e) => {
            setLowOnly(e.target.checked);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('stock.title')}
        columns={columns}
        data={stock.data?.items ?? []}
        loading={stock.isPending}
        error={stock.isError}
        onRetry={() => void stock.refetch()}
        getRowId={(r) => `${r.product_id}:${r.branch_id}`}
        rowClassName={(r) => (r.low ? 'bg-danger-50' : undefined)}
        empty={{ title: t('stock.empty'), description: t('stock.emptyHint') }}
        server={{ page, pageSize: PAGE_SIZE, total: stock.data?.total ?? 0, onPageChange: setPage }}
      />
      {drill && (
        <StockMovementsDrawer
          key={`${drill.productId}:${drill.branchId}`}
          target={drill}
          branches={branches.data ?? []}
          onClose={() => setDrill(null)}
        />
      )}
    </PageContainer>
  );
}
