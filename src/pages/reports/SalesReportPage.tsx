import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  SALES_REPORT_GROUP_BY,
  type SalesReport,
  type SalesReportRow,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { useMe } from '@/features/me/useMe';
import { saveBlob } from '@/features/imports/importShared';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { productsApi, productKeys } from '@/services/productsApi';
import { reportKeys, reportsApi } from '@/services/reportsApi';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, shopToday } from '@/lib/format';
import { t } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';
import {
  EXPORT_PAGE_SIZE,
  PAGE_SIZE,
  PRESETS,
  SALE_TYPES,
  activePreset,
  buildCsv,
  drillLink,
  fieldsFor,
  formatCell,
  periodValid,
  presetRange,
  readFilters,
  rowLabel,
  sortToState,
  stateToSort,
  defaultSort,
  toQuery,
  writeFilters,
  type SaleTypeFilter,
  type SalesFilters,
} from './salesReportShared';

const DEFAULT_TIME_ZONE = 'Africa/Cairo';

/**
 * D02 sales and margin report (D89): what sold in a period and what it earned, grouped and filtered. Every
 * number is a SQL aggregate computed by the server and shown as it came; the page formats and adds nothing
 * up. Cost, margin and contract profit come back `null` without report.financial and are not drawn.
 */
export default function SalesReportPage() {
  const org = useAuthStore((s) => s.orgId);
  const me = useMe();
  const lang = useLanguage();
  const today = shopToday(me.data?.org.timezone ?? DEFAULT_TIME_ZONE);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params, today), [params, today]);
  const update = (patch: Partial<SalesFilters>) =>
    setParams(writeFilters({ ...filters, page: 1, ...patch }, today), { replace: true });

  const valid = periodValid(filters);
  const query = useMemo(() => (valid ? toQuery(filters) : null), [valid, filters]);
  const report = useQuery({
    queryKey: reportKeys.sales(org, query),
    queryFn: () => reportsApi.sales(query!),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const canSeeCost = data?.can_see_cost ?? false;

  // Pickers: branches (everyone), categories and products (the catalog), sellers (employee.manage).
  const branches = useBranches();
  const categories = useQuery({
    queryKey: categoryKeys.list(org),
    queryFn: categoriesApi.list,
    staleTime: 60_000,
  });
  const products = useQuery({
    queryKey: productKeys.list(org, { pageSize: 100 }),
    queryFn: () => productsApi.list({ pageSize: 100 }),
    staleTime: 60_000,
  });
  const canPickSeller = useCan('employee.manage');
  const staff = useQuery({
    queryKey: ['reports', org, 'sellers'],
    queryFn: () => staffApi.list({ page_size: 100 }),
    enabled: canPickSeller,
    staleTime: 60_000,
  });
  const money = filters.groupBy === 'payment_type';

  const columns = useMemo<ColumnDef<SalesReportRow>[]>(() => {
    const first: ColumnDef<SalesReportRow> = {
      id: 'label',
      header: t(`reports.sales.group.${filters.groupBy}`),
      enableSorting: !money,
      cell: ({ row }) => {
        const text = rowLabel(row.original, filters.groupBy, lang);
        const link = drillLink(row.original, filters.groupBy, filters);
        const sub = row.original.sub_label;
        return (
          <>
            {link ? (
              <Link
                className="btn-link"
                to={link}
                aria-label={t('reports.sales.table.open', { name: text })}
              >
                {text}
              </Link>
            ) : (
              text
            )}
            {sub && <span className="type-caption ms-2">{sub}</span>}
          </>
        );
      },
    };
    const rest = fieldsFor(filters.groupBy, canSeeCost, 'table').map(
      (f): ColumnDef<SalesReportRow> => ({
        id: f.sortId ?? f.field,
        header: t(f.label),
        enableSorting: !!f.sortId && !money,
        meta: { numeric: true },
        cell: ({ row }) => formatCell(row.original[f.field], f.kind, lang),
      }),
    );
    return [first, ...rest];
    // `filters` carries the dates and branch the drill-down links keep.
  }, [filters, canSeeCost, money, lang]);

  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  async function exportCsv() {
    setExporting(true);
    setExportFailed(false);
    try {
      // Every row of the current query, in pages of 1000; the totals are the same on every page.
      const first = await reportsApi.sales(toQuery(filters, 1, EXPORT_PAGE_SIZE));
      const rows = [...first.rows];
      for (let page = 2; rows.length < first.total_count; page += 1) {
        const next = await reportsApi.sales(toQuery(filters, page, EXPORT_PAGE_SIZE));
        if (next.rows.length === 0) break;
        rows.push(...next.rows);
      }
      const csv = buildCsv(filters.groupBy, rows, first.totals, first.can_see_cost, lang);
      const name = t('reports.sales.export.file', {
        from: filters.from,
        to: filters.to,
        group: filters.groupBy,
      });
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  const sort = filters.sort || defaultSort(filters.groupBy);
  const options = (
    all: string,
    items: { value: string; label: string }[],
  ): { value: string; label: string }[] => [{ value: '', label: all }, ...items];
  const preset = activePreset(filters, today);

  return (
    <PageContainer>
      <PageHeader
        title={t('reports.sales.title')}
        description={t('reports.sales.description')}
        actions={
          <Button
            variant="secondary"
            onClick={() => void exportCsv()}
            loading={exporting}
            loadingLabel={t('reports.sales.export.working')}
            disabled={!data || data.total_count === 0}
          >
            {t('reports.sales.export.button')}
          </Button>
        }
      />
      <Card title={t('reports.sales.filters.title')} className="mb-4">
        <div
          className="mb-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('reports.sales.filters.presets')}
        >
          {PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? 'primary' : 'secondary'}
              aria-pressed={preset === p}
              onClick={() => update(presetRange(p, today))}
            >
              {t(`reports.sales.filters.${p}`)}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            label={t('reports.sales.filters.from')}
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
          <FormField
            label={t('reports.sales.filters.to')}
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
          <Select
            label={t('reports.sales.filters.groupBy')}
            value={filters.groupBy}
            onChange={(e) => {
              const groupBy = SALES_REPORT_GROUP_BY.find((g) => g === e.target.value);
              if (groupBy) update({ groupBy, sort: '' });
            }}
            options={SALES_REPORT_GROUP_BY.map((g) => ({
              value: g,
              label: t(`reports.sales.group.${g}`),
            }))}
          />
          <Select
            label={t('reports.sales.filters.branch')}
            value={filters.branch}
            onChange={(e) => update({ branch: e.target.value })}
            options={options(
              t('reports.sales.filters.allBranches'),
              (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            )}
          />
          {canPickSeller && (
            <Select
              label={t('reports.sales.filters.employee')}
              value={filters.employee}
              onChange={(e) => update({ employee: e.target.value })}
              options={options(
                t('reports.sales.filters.allEmployees'),
                (staff.data?.items ?? []).map((s) => ({ value: s.id, label: s.full_name })),
              )}
            />
          )}
          <Select
            label={t('reports.sales.filters.saleType')}
            value={filters.saleType}
            onChange={(e) => {
              const saleType = SALE_TYPES.find((s) => s === e.target.value);
              update({ saleType: (saleType ?? '') as SaleTypeFilter });
            }}
            options={options(
              t('reports.sales.filters.allTypes'),
              SALE_TYPES.map((s) => ({ value: s, label: t(`reports.sales.saleType.${s}`) })),
            )}
          />
          {!money && (
            <Select
              label={t('reports.sales.filters.category')}
              value={filters.category}
              onChange={(e) => update({ category: e.target.value })}
              options={options(
                t('reports.sales.filters.allCategories'),
                (categories.data ?? [])
                  .filter((c) => !c.archived_at)
                  .map((c) => ({
                    value: c.id,
                    label: c.parent_id
                      ? `${categories.data?.find((p) => p.id === c.parent_id)?.name ?? ''} › ${c.name}`
                      : c.name,
                  })),
              )}
            />
          )}
          {!money && (
            <Select
              label={t('reports.sales.filters.product')}
              value={filters.product}
              onChange={(e) => update({ product: e.target.value })}
              options={options(
                t('reports.sales.filters.allProducts'),
                (products.data?.items ?? []).map((p) => ({
                  value: p.id,
                  label: `${lang === 'en' && p.name_en ? p.name_en : p.name_ar} (${p.sku})`,
                })),
              )}
            />
          )}
        </div>
        {filters.groupBy === 'category' && (
          <label className="mt-3 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={filters.topLevel}
              onChange={(e) => update({ topLevel: e.target.checked })}
            />
            <span>{t('reports.sales.filters.topLevel')}</span>
          </label>
        )}
        <FormError message={!valid ? t('reports.sales.periodInvalid') : ''} />
      </Card>

      {report.isError && !data && <FormError message={t('reports.sales.loadFailed')} />}
      {data && <TotalsStrip data={data} money={money} lang={lang} />}
      {data && <Notes data={data} filters={filters} />}
      <DataTable
        caption={t('reports.sales.table.caption', {
          group: t(`reports.sales.group.${filters.groupBy}`),
        })}
        columns={columns}
        data={data?.rows ?? []}
        getRowId={(row) => row.key}
        loading={report.isPending && query !== null}
        error={report.isError && !data}
        onRetry={() => void report.refetch()}
        empty={{ title: t('reports.sales.empty'), description: t('reports.sales.emptyHint') }}
        server={{
          page: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total_count ?? 0,
          onPageChange: (page) => update({ page }),
          sorting: money ? [] : sortToState(sort),
          onSortingChange: (state) => update({ sort: stateToSort(state), page: 1 }),
        }}
      />
      {exportFailed && <FormError message={t('reports.sales.export.failed')} />}
      {data && <CheckLine data={data} lang={lang} />}
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption">{label}</dt>
      <dd className="num type-section-title">{value}</dd>
    </div>
  );
}

/** The totals of the whole period, as the server sent them. */
function TotalsStrip({
  data,
  money,
  lang,
}: {
  data: SalesReport;
  money: boolean;
  lang: 'ar' | 'en';
}) {
  const tt = data.totals;
  const items = money
    ? [
        [t('reports.sales.totals.salesCount'), formatCell(tt.sales_count, 'int', lang)],
        [t('reports.sales.totals.amount'), formatCell(tt.amount, 'money', lang)],
        [t('reports.sales.totals.refunded'), formatCell(tt.refunded, 'money', lang)],
        [t('reports.sales.columns.netAmount'), formatCell(tt.net_amount, 'money', lang)],
      ]
    : [
        [t('reports.sales.totals.salesCount'), formatCell(tt.sales_count, 'int', lang)],
        [t('reports.sales.totals.revenue'), formatCell(tt.revenue, 'money', lang)],
        ...(data.can_see_cost
          ? [
              [t('reports.sales.totals.cost'), formatCell(tt.cost, 'money', lang)],
              [t('reports.sales.totals.marginPct'), formatCell(tt.margin_pct, 'pct', lang)],
            ]
          : []),
        [t('reports.sales.totals.returns'), formatCell(tt.returned_revenue, 'money', lang)],
        [t('reports.sales.totals.netRevenue'), formatCell(tt.net_revenue, 'money', lang)],
        ...(data.can_see_cost
          ? [[t('reports.sales.totals.netMargin'), formatCell(tt.net_margin, 'money', lang)]]
          : []),
      ];
  return (
    <Card title={t('reports.sales.totals.title')} className="mb-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <Stat key={label} label={label!} value={value!} />
        ))}
      </dl>
    </Card>
  );
}

function Notes({ data, filters }: { data: SalesReport; filters: SalesFilters }) {
  const notes: string[] = [];
  if (filters.groupBy === 'payment_type') notes.push(t('reports.sales.notes.payment'));
  if (data.can_see_cost && filters.groupBy !== 'payment_type') {
    notes.push(t('reports.sales.notes.contractProfit'));
    if (filters.groupBy === 'product' || filters.groupBy === 'category') {
      notes.push(t('reports.sales.notes.contractSplit'));
    }
  }
  notes.push(t('reports.sales.notes.voided'));
  return (
    <ul className="type-caption mb-3 list-disc space-y-1 ps-5">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/** "Totals checked against N sales documents" or a warning with the differences. */
function CheckLine({ data, lang }: { data: SalesReport; lang: 'ar' | 'en' }) {
  const updated = t('reports.sales.updated', { time: formatDateTime(data.generated_at, lang) });
  if (!data.check) {
    return (
      <p className="type-caption mt-3">
        {t('reports.sales.check.filtered')} {updated}
      </p>
    );
  }
  if (data.check.rows_match) {
    return (
      <p className="type-caption mt-3">
        {data.group_by === 'payment_type'
          ? t('reports.sales.check.okMoney')
          : t('reports.sales.check.ok', { count: data.totals.sales_count ?? 0 })}{' '}
        {updated}
      </p>
    );
  }
  const d = data.check.differences;
  const shown = (v: string | null) => (v === null ? '—' : formatCell(v, 'money', lang));
  return (
    <p role="alert" className="mt-3 text-danger-700">
      {t('reports.sales.check.warning', {
        revenue: shown(d.revenue),
        tax: shown(d.tax),
        cost: shown(d.cost),
        returnedRevenue: shown(d.returned_revenue),
        gross: shown(d.gross),
        returnedGross: shown(d.returned_gross),
      })}
    </p>
  );
}
