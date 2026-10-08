import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Product, ProductStatus } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/Dialog';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useCan } from '@/features/me/useCan';
import { useSettings } from '@/features/settings/useSettings';
import { ApiError } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { productKeys, productsApi, type ProductListParams } from '@/services/productsApi';
import { taxClassKeys, taxClassesApi } from '@/services/taxClassesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import ProductForm from './ProductForm';

const PAGE_SIZE = 20;

/** Money and cost: LTR-isolated, tabular, kept on one line. (Not meta.numeric: DataTable puts
 * the inline-block .num class on the cell itself, which breaks the table layout.) */
function Num({ children }: { children: string }) {
  return <span className="num whitespace-nowrap">{children}</span>;
}
const STATUSES: ProductStatus[] = ['active', 'archived', 'all'];

export default function ProductsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('catalog.manage');
  const canChangePrice = useCan('catalog.price_change');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeSub, setIncludeSub] = useState(true);
  const [status, setStatus] = useState<ProductStatus>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);

  // Debounced search: the request goes out ~300 ms after the last key.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params: ProductListParams = {
    ...(search ? { search } : {}),
    ...(categoryId ? { category_id: categoryId, include_subcategories: includeSub } : {}),
    status,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: productKeys.list(orgId, params),
    queryFn: () => productsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({
    queryKey: categoryKeys.list(orgId),
    queryFn: categoriesApi.list,
  });
  const taxClasses = useQuery({
    queryKey: taxClassKeys.list(orgId),
    queryFn: taxClassesApi.list,
  });
  const settings = useSettings();

  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const taxName = new Map((taxClasses.data ?? []).map((c) => [c.id, c.name]));
  const refresh = () => cache.invalidateQueries({ queryKey: productKeys.all(orgId) });

  async function archive() {
    if (!archiveTarget) return;
    try {
      await productsApi.archive(archiveTarget.id);
      notify.success(t('products.archived'));
      await refresh();
    } catch (e) {
      notify.error(
        t(
          e instanceof ApiError && e.code === 'PRODUCT_NOT_FOUND'
            ? 'products.errors.notFound'
            : 'products.errors.failed',
        ),
      );
    } finally {
      setArchiveTarget(null);
    }
  }

  async function restore(product: Product) {
    try {
      await productsApi.restore(product.id);
      notify.success(t('products.restored'));
      await refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      notify.error(
        t(
          code === 'PRODUCT_CATEGORY_ARCHIVED'
            ? 'products.errors.categoryArchived'
            : code === 'TAX_CLASS_NOT_FOUND'
              ? 'products.errors.taxClassNotFound'
              : code === 'PRODUCT_NOT_FOUND'
                ? 'products.errors.notFound'
                : 'products.errors.failed',
        ),
      );
    }
  }

  const columns: ColumnDef<Product, unknown>[] = [
    {
      id: 'product',
      header: t('products.columns.product'),
      cell: ({ row }) => (
        <div>
          <span className="block">{row.original.name_ar}</span>
          {row.original.name_en && (
            <span className="type-caption block" dir="auto">
              {row.original.name_en}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'sku',
      header: t('products.columns.sku'),
      cell: ({ row }) => <span dir="ltr">{row.original.sku}</span>,
    },
    {
      id: 'barcode',
      header: t('products.columns.barcode'),
      cell: ({ row }) => <span dir="ltr">{row.original.barcode ?? ''}</span>,
    },
    {
      id: 'category',
      header: t('products.columns.category'),
      cell: ({ row }) =>
        row.original.category_id
          ? (categoryName.get(row.original.category_id) ?? '')
          : t('products.noCategory'),
    },
    {
      id: 'taxClass',
      header: t('products.columns.taxClass'),
      cell: ({ row }) => taxName.get(row.original.tax_class_id) ?? '',
    },
    {
      id: 'cashPrice',
      header: t('products.columns.cashPrice'),
      cell: ({ row }) => <Num>{formatMoney(row.original.cash_price)}</Num>,
    },
    {
      id: 'installmentPrice',
      header: t('products.columns.installmentPrice'),
      cell: ({ row }) =>
        row.original.installment_price ? (
          <Num>{formatMoney(row.original.installment_price)}</Num>
        ) : (
          t('products.fromPolicy')
        ),
    },
    ...(canManage
      ? [
          {
            id: 'cost',
            header: t('products.columns.cost'),
            cell: ({ row }) => <Num>{formatNumber(row.original.avg_cost)}</Num>,
          } satisfies ColumnDef<Product, unknown>,
        ]
      : []),
    {
      id: 'status',
      header: t('products.columns.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.archived_at ? 'neutral' : 'success'}>
          {t(row.original.archived_at ? 'products.status.archived' : 'products.status.active')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('products.actions'),
      cell: ({ row }) => (
        <div className="flex gap-2">
          {!row.original.archived_at && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/inventory/labels?product=${row.original.id}`)}
            >
              {t('products.labels')}
            </Button>
          )}
          <Can permission="catalog.manage">
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
                {t('products.editAction')}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  row.original.archived_at
                    ? void restore(row.original)
                    : setArchiveTarget(row.original)
                }
              >
                {t(row.original.archived_at ? 'products.restore' : 'products.archive')}
              </Button>
            </div>
          </Can>
        </div>
      ),
    },
  ];

  const categoryOptions = (categories.data ?? [])
    .filter((c) => !c.archived_at)
    .map((c) => ({ value: c.id, label: `${c.parent_id ? '— ' : ''}${c.name}` }));

  return (
    <PageContainer>
      <PageHeader
        title={t('products.title')}
        actions={
          <Can permission="catalog.manage">
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('products.add')}
            </Button>
          </Can>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr] md:items-end">
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('products.search')}
          placeholder={t('products.search')}
        />
        <Select
          label={t('products.category')}
          value={categoryId}
          options={[{ value: '', label: t('products.allCategories') }, ...categoryOptions]}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t('products.statusFilter')}
          value={status}
          options={STATUSES.map((s) => ({ value: s, label: t(`products.status.${s}`) }))}
          onChange={(e) => {
            setStatus(e.target.value as ProductStatus);
            setPage(1);
          }}
        />
        <Checkbox
          label={t('products.includeSubcategories')}
          checked={includeSub}
          disabled={!categoryId}
          onChange={(e) => {
            setIncludeSub(e.target.checked);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('products.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        rowClassName={(row) => (row.archived_at ? 'opacity-60' : undefined)}
        empty={{ title: t('products.empty'), description: t('products.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
      {canManage && formOpen && (
        <ProductForm
          key={editing?.id ?? 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          product={editing}
          categories={categories.data ?? []}
          taxClasses={taxClasses.data ?? []}
          defaultTaxClassId={settings.data?.default_tax_class_id ?? ''}
          canChangePrice={canChangePrice}
          onSaved={() => void refresh()}
        />
      )}
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(v) => !v && setArchiveTarget(null)}
        title={t('products.archiveTitle')}
        description={t('products.archiveConfirm')}
        confirmLabel={t('products.archive')}
        tone="danger"
        onConfirm={() => void archive()}
      />
    </PageContainer>
  );
}
