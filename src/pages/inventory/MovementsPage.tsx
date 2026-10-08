import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ExportTooLargeDetail, type Product, type StockMovement } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { productKeys, productsApi } from '@/services/productsApi';
import { stockApi, stockKeys, type StockMovementsParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import {
  documentHref,
  documentLabel,
  downloadText,
  movementProductName,
  movementsCsv,
  movementTypeLabel,
  TYPE_GROUP_KEYS,
  TYPE_GROUPS,
  type TypeGroup,
} from './movementShared';

const PAGE_SIZE = 50;
const isGroup = (v: string): v is TypeGroup => (TYPE_GROUP_KEYS as string[]).includes(v);

/**
 * I05 movement history (stock.view): every stock movement of a product, branch or serial with
 * its running balance and a link to the document that caused it. The filters live in the URL,
 * so the stock drawer and a unit's page can open it pre-filtered. Export needs export.data.
 */
export default function MovementsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const canExport = useCan('export.data');
  const [params, setParams] = useSearchParams();
  const productId = params.get('product_id') ?? '';
  const branchId = params.get('branch_id') ?? '';
  const serial = params.get('serial') ?? '';
  const group = params.get('type') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [serialInput, setSerialInput] = useState(serial);
  const [exporting, setExporting] = useState(false);

  /** Changes filters (empty = removed) and goes back to the first page. */
  function set(next: Record<string, string>) {
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        for (const [k, v] of Object.entries(next)) {
          if (v) out.set(k, v);
          else out.delete(k);
        }
        if (!('page' in next)) out.delete('page');
        return out;
      },
      { replace: true },
    );
  }

  // The URL changed from elsewhere (a link, back): show its serial in the box.
  const [shownSerial, setShownSerial] = useState(serial);
  if (shownSerial !== serial) {
    setShownSerial(serial);
    setSerialInput(serial);
  }
  useEffect(() => {
    const id = setTimeout(() => {
      const value = serialInput.trim();
      if (value !== serial) set({ serial: value });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set() only reads the latest params
  }, [serialInput]);

  const filters: StockMovementsParams = {
    ...(productId ? { product_id: productId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(serial ? { serial } : {}),
    ...(isGroup(group) ? { types: [...TYPE_GROUPS[group]] } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const query = { ...filters, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: stockKeys.movements(orgId, query),
    queryFn: () => stockApi.movements(query),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const nameOfBranch = (id: string) => branchName.get(id) ?? '';

  async function exportCsv() {
    setExporting(true);
    try {
      const { types, ...rest } = filters;
      const result = await stockApi.exportMovements({ ...rest, ...(types ? { types } : {}) });
      const date = new Date().toISOString().slice(0, 10);
      downloadText(`stock-movements-${date}.csv`, movementsCsv(result.items, nameOfBranch));
      notify.success(t('stock.history.export.done', { count: formatNumber(result.total) }));
    } catch (e) {
      const detail =
        e instanceof ApiError && e.code === 'EXPORT_TOO_LARGE'
          ? ExportTooLargeDetail.safeParse(e.details)
          : null;
      notify.error(
        detail?.success
          ? t('stock.history.export.tooLarge', {
              total: formatNumber(detail.data.total),
              limit: formatNumber(detail.data.limit),
            })
          : t('stock.history.export.failed'),
      );
    } finally {
      setExporting(false);
    }
  }

  const columns: ColumnDef<StockMovement, unknown>[] = [
    {
      id: 'date',
      header: t('stock.history.columns.date'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      id: 'product',
      header: t('stock.history.columns.product'),
      cell: ({ row }) => (
        <span>
          <span className="block min-w-40">{movementProductName(row.original)}</span>
          <span className="type-caption block" dir="ltr">
            {row.original.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'branch',
      header: t('stock.history.columns.branch'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{nameOfBranch(row.original.branch_id)}</span>
      ),
    },
    {
      id: 'type',
      header: t('stock.history.columns.type'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{movementTypeLabel(row.original)}</span>
      ),
    },
    {
      id: 'quantity',
      header: t('stock.history.columns.quantity'),
      meta: { numeric: true },
      cell: ({ row }) =>
        `${row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
    },
    {
      id: 'balance',
      header: t('stock.history.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.balance_after),
    },
    {
      id: 'serial',
      header: t('stock.history.columns.serial'),
      cell: ({ row }) =>
        row.original.unit_id && row.original.serial ? (
          <Link
            to={`/inventory/units/${encodeURIComponent(row.original.unit_id)}`}
            className="whitespace-nowrap hover:text-brand-700 hover:underline"
            dir="ltr"
          >
            {row.original.serial}
          </Link>
        ) : (
          ''
        ),
    },
    {
      id: 'document',
      header: t('stock.history.columns.document'),
      cell: ({ row }) => {
        const href = documentHref(row.original);
        const label = documentLabel(row.original);
        return href ? (
          <Link
            to={href}
            className="whitespace-nowrap text-brand-700 hover:underline"
            dir="auto"
            aria-label={t('stock.history.openDocument', { document: label })}
          >
            {label}
          </Link>
        ) : (
          <span dir="auto">{label}</span>
        );
      },
    },
    {
      id: 'party',
      header: t('stock.history.columns.party'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap" dir="auto">
          {row.original.party ?? ''}
        </span>
      ),
    },
    {
      id: 'by',
      header: t('stock.history.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.history.title')}
        actions={
          canExport ? (
            <Button
              variant="secondary"
              onClick={() => void exportCsv()}
              disabled={exporting || (list.data?.total ?? 0) === 0}
            >
              {exporting ? t('stock.history.export.working') : t('stock.history.export.button')}
            </Button>
          ) : undefined
        }
      />
      <p className="type-caption mb-4">{t('stock.history.subtitle')}</p>
      <Card className="mb-4">
        <form
          aria-label={t('stock.history.filters')}
          className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <ProductFilter productId={productId} onChange={(id) => set({ product_id: id })} />
          <Select
            label={t('stock.branch')}
            value={branchId}
            options={[
              { value: '', label: t('stock.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => set({ branch_id: e.target.value })}
          />
          <Select
            label={t('stock.history.type')}
            value={isGroup(group) ? group : ''}
            options={[
              { value: '', label: t('stock.history.allTypes') },
              ...TYPE_GROUP_KEYS.map((g) => ({ value: g, label: t(`stock.history.groups.${g}`) })),
            ]}
            onChange={(e) => set({ type: e.target.value })}
          />
          <FormField
            label={t('stock.history.serial')}
            ltr
            maxLength={64}
            value={serialInput}
            onChange={(e) => setSerialInput(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('stock.history.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => set({ from: e.target.value })}
          />
          <FormField
            type="date"
            ltr
            label={t('stock.history.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => set({ to: e.target.value })}
          />
        </form>
      </Card>
      <DataTable
        caption={t('stock.history.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(m) => m.id}
        empty={{ title: t('stock.history.empty'), description: t('stock.history.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: (p) => set({ page: p > 1 ? String(p) : '' }),
        }}
      />
    </PageContainer>
  );
}

/** Pick one product by name, SKU or barcode, or clear it (every product). */
function ProductFilter({
  productId,
  onChange,
}: {
  productId: string;
  onChange: (id: string) => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);
  const chosen = useQuery({
    queryKey: productKeys.one(orgId, productId),
    queryFn: () => productsApi.get(productId),
    enabled: !!productId,
  });
  const listParams = { ...(search ? { search } : {}), pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: !productId && search.length > 0,
  });
  const name = (p: Product) => (getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar);

  if (productId) {
    return (
      <div className="md:col-span-2 lg:col-span-3">
        <span className="type-label mb-1 block">{t('stock.history.product')}</span>
        <div className="flex items-center justify-between gap-2 rounded-card border border-line px-3 py-2">
          <span className="min-w-0 truncate">
            {chosen.data ? (
              <>
                {name(chosen.data)}{' '}
                <span className="type-caption" dir="ltr">
                  {chosen.data.sku}
                </span>
              </>
            ) : (
              t('stock.history.productLoading')
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setInput('');
              onChange('');
            }}
          >
            {t('stock.history.allProducts')}
          </Button>
        </div>
      </div>
    );
  }
  const items = results.data?.items ?? [];
  return (
    <div className="space-y-2 md:col-span-2 lg:col-span-3">
      <span className="type-label block">{t('stock.history.product')}</span>
      <SearchInput
        value={input}
        onValueChange={setInput}
        label={t('stock.history.productSearch')}
        placeholder={t('stock.history.productSearch')}
      />
      {search && results.data && items.length === 0 && (
        <p className="type-caption">{t('stock.history.noProducts')}</p>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{name(p)}</span>
                <span className="type-caption block" dir="ltr">
                  {p.sku}
                </span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => onChange(p.id)}>
                {t('stock.history.choose')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
