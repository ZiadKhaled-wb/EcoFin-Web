import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  RECEIVABLES_GROUP_BY,
  RECEIVABLES_NO_COLLECTOR,
  type ReceivablesReport,
  type ReceivablesRow,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { saveBlob } from '@/features/imports/importShared';
import { reportKeys, reportsApi } from '@/services/reportsApi';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';
import { formatBusinessDate, formatDateTime } from '@/lib/format';
import { t } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';
import { formatCell } from './salesReportShared';
import {
  BUCKETS,
  EXPORT_PAGE_SIZE,
  PAGE_SIZE,
  buildCsv,
  crumb,
  defaultFilters,
  drillTarget,
  formatField,
  formatPaidAt,
  readFilters,
  rowLabel,
  sortToState,
  stateToSort,
  tableFields,
  toQuery,
  writeFilters,
  type ReceivablesFilters,
} from './receivablesShared';

/**
 * D03 receivables aging (D90): who owes the shop money today and how late they are, grouped by customer,
 * branch, collector or contract, with a drill-down from a branch or collector to its customers, from a customer
 * to its contracts and on to the contract page. Every number is a SQL aggregate computed by the server and
 * shown as it came; the page formats and adds nothing up. Needs report.financial (the server checks it).
 */
export default function ReceivablesReportPage() {
  const org = useAuthStore((s) => s.orgId);
  const lang = useLanguage();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const go = (next: ReceivablesFilters) => setParams(writeFilters(next));
  const update = (patch: Partial<ReceivablesFilters>) =>
    setParams(writeFilters({ ...filters, page: 1, ...patch }), { replace: true });

  // The search box sends after a pause, not on every key; a new URL (back, clear, drill-down) resets it.
  const [search, setSearch] = useState(filters.q);
  const [shownQ, setShownQ] = useState(filters.q);
  if (shownQ !== filters.q) {
    setShownQ(filters.q);
    setSearch(filters.q);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const typeSearch = (value: string) => {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value.trim() }), 400);
  };

  const query = useMemo(() => toQuery(filters), [filters]);
  const report = useQuery({
    queryKey: reportKeys.receivables(org, query),
    queryFn: () => reportsApi.receivables(query),
    placeholderData: keepPreviousData,
  });
  const data = report.data;

  const branches = useBranches();
  const canPickCollector = useCan('employee.manage');
  const staff = useQuery({
    queryKey: ['reports', org, 'collectors'],
    queryFn: () => staffApi.list({ page_size: 100 }),
    enabled: canPickCollector,
    staleTime: 60_000,
  });
  const searchable = filters.groupBy === 'customer' || filters.groupBy === 'contract';

  const columns = useMemo<ColumnDef<ReceivablesRow>[]>(() => {
    const first: ColumnDef<ReceivablesRow> = {
      id: 'label',
      // An accessor makes the column sortable (TanStack); the server does the sorting.
      accessorFn: (r) => r.label,
      header: t(`reports.receivables.group.${filters.groupBy}`),
      cell: ({ row }) => {
        const r = row.original;
        const text = rowLabel(r, filters.groupBy);
        const target = drillTarget(r, filters);
        const aria =
          'href' in target
            ? t('reports.receivables.drill.openContract', { number: text })
            : filters.groupBy === 'customer'
              ? t('reports.receivables.drill.openContracts', { name: text })
              : t('reports.receivables.drill.openCustomers', { name: text });
        return (
          <>
            <Link
              className="btn-link"
              to={'href' in target ? target.href : `?${writeFilters(target.filters).toString()}`}
              aria-label={aria}
            >
              {text}
            </Link>
            {r.sub_label && <span className="type-caption ms-2">{r.sub_label}</span>}
            {r.contract?.is_migrated && (
              <span className="type-caption ms-2">{t('reports.receivables.drill.migrated')}</span>
            )}
            {filters.groupBy === 'customer' && r.collector && (
              <span className="type-caption ms-2">{r.collector.name}</span>
            )}
            {filters.groupBy === 'customer' && (
              <Link className="type-caption btn-link ms-2" to={`/customers/${r.key}`}>
                {t('reports.receivables.drill.customerPage')}
              </Link>
            )}
          </>
        );
      },
    };
    const rest = tableFields(filters.groupBy).map((f): ColumnDef<ReceivablesRow> => ({
      id: f.sortId ?? f.field,
      accessorFn: (r) => r[f.field],
      header: t(f.label),
      enableSorting: !!f.sortId,
      meta: { numeric: true },
      cell: ({ row }) => {
        const value = row.original[f.field];
        const text = formatField(value, f.kind, lang);
        return f.danger && typeof value === 'string' && value !== '0.00' ? (
          <span className="font-medium text-danger-600">{text}</span>
        ) : (
          text
        );
      },
    }));
    const last: ColumnDef<ReceivablesRow>[] =
      filters.groupBy === 'customer' || filters.groupBy === 'contract'
        ? [
            {
              id: 'last_payment_at',
              header: t('reports.receivables.columns.lastPayment'),
              enableSorting: false,
              cell: ({ row }) => formatPaidAt(row.original.last_payment_at, lang),
            },
          ]
        : [];
    return [first, ...rest, ...last];
  }, [filters, lang]);

  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  async function exportCsv() {
    setExporting(true);
    setExportFailed(false);
    try {
      // Every row of the current query, in pages of 1000; the totals are the same on every page.
      const first = await reportsApi.receivables(toQuery(filters, 1, EXPORT_PAGE_SIZE));
      const rows = [...first.rows];
      for (let page = 2; rows.length < first.total_count; page += 1) {
        const next = await reportsApi.receivables(toQuery(filters, page, EXPORT_PAGE_SIZE));
        if (next.rows.length === 0) break;
        rows.push(...next.rows);
      }
      const csv = buildCsv(filters.groupBy, rows, first.totals);
      const name = t('reports.receivables.export.file', {
        date: first.as_of,
        group: filters.groupBy,
      });
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  const options = (all: string, items: { value: string; label: string }[]) => [
    { value: '', label: all },
    ...items,
  ];
  const here = crumb(filters);
  const sort = filters.sort || 'outstanding_desc';
  const filtered =
    !!filters.branch ||
    !!filters.collector ||
    !!filters.customer ||
    !!filters.q ||
    filters.minDays > 0;

  return (
    <PageContainer>
      <PageHeader
        title={t('reports.receivables.title')}
        description={t('reports.receivables.description')}
        actions={
          <Button
            variant="secondary"
            onClick={() => void exportCsv()}
            loading={exporting}
            loadingLabel={t('reports.receivables.export.working')}
            disabled={!data || data.total_count === 0}
          >
            {t('reports.receivables.export.button')}
          </Button>
        }
      />
      {here && (
        <div className="mb-3">
          <Breadcrumb
            items={[
              { label: t('reports.receivables.drill.all'), to: '/reports/receivables' },
              { label: here },
            ]}
          />
        </div>
      )}
      <Card title={t('reports.receivables.filters.title')} className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={t('reports.receivables.filters.groupBy')}
            value={filters.groupBy}
            onChange={(e) => {
              const groupBy = RECEIVABLES_GROUP_BY.find((g) => g === e.target.value);
              if (groupBy) update({ groupBy, sort: '', label: '' });
            }}
            options={RECEIVABLES_GROUP_BY.map((g) => ({
              value: g,
              label: t(`reports.receivables.group.${g}`),
            }))}
          />
          <Select
            label={t('reports.receivables.filters.branch')}
            value={filters.branch}
            onChange={(e) => update({ branch: e.target.value, label: '' })}
            options={options(
              t('reports.receivables.filters.allBranches'),
              (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            )}
          />
          <Select
            label={t('reports.receivables.filters.collector')}
            value={filters.collector}
            onChange={(e) => update({ collector: e.target.value, label: '' })}
            options={options(t('reports.receivables.filters.allCollectors'), [
              {
                value: RECEIVABLES_NO_COLLECTOR,
                label: t('reports.receivables.filters.noCollector'),
              },
              ...(canPickCollector ? (staff.data?.items ?? []) : []).map((s) => ({
                value: s.id,
                label: s.full_name,
              })),
              // A collector chosen through a drill-down stays selectable without the staff list.
              ...(filters.collector &&
              filters.collector !== RECEIVABLES_NO_COLLECTOR &&
              !(staff.data?.items ?? []).some((s) => s.id === filters.collector)
                ? [{ value: filters.collector, label: filters.label || filters.collector }]
                : []),
            ])}
          />
          <FormField
            label={t('reports.receivables.filters.minDays')}
            type="number"
            inputMode="numeric"
            min={1}
            value={filters.minDays > 0 ? String(filters.minDays) : ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              update({ minDays: Number.isInteger(n) && n > 0 ? n : 0 });
            }}
          />
          {searchable && (
            <FormField
              label={t('reports.receivables.filters.search')}
              help={t('reports.receivables.filters.searchHint')}
              type="search"
              value={search}
              maxLength={100}
              onChange={(e) => typeSearch(e.target.value)}
            />
          )}
        </div>
        {filtered && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => go(defaultFilters())}>
              {t('reports.receivables.filters.clear')}
            </Button>
          </div>
        )}
      </Card>

      {report.isError && !data && <FormError message={t('reports.receivables.loadFailed')} />}
      {data && <TotalsStrip data={data} lang={lang} />}
      {data && <BucketBar data={data} lang={lang} />}
      <ul className="type-caption mb-3 list-disc space-y-1 ps-5">
        <li>{t('reports.receivables.notes.grace')}</li>
        <li>{t('reports.receivables.notes.noFees')}</li>
        <li>{t('reports.receivables.notes.closed')}</li>
      </ul>
      <DataTable
        caption={t('reports.receivables.table.caption', {
          group: t(`reports.receivables.group.${filters.groupBy}`),
        })}
        columns={columns}
        data={data?.rows ?? []}
        getRowId={(row) => row.key}
        loading={report.isPending}
        error={report.isError && !data}
        onRetry={() => void report.refetch()}
        empty={{
          title: t('reports.receivables.empty'),
          description: t('reports.receivables.emptyHint'),
        }}
        server={{
          page: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total_count ?? 0,
          onPageChange: (page) => update({ page }),
          sorting: sortToState(sort),
          onSortingChange: (state) => update({ sort: stateToSort(state), page: 1 }),
        }}
      />
      {exportFailed && <FormError message={t('reports.receivables.export.failed')} />}
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

/** Today's totals of the whole result, as the server sent them. */
function TotalsStrip({ data, lang }: { data: ReceivablesReport; lang: 'ar' | 'en' }) {
  const tt = data.totals;
  const items: [string, string][] = [
    [t('reports.receivables.totals.outstanding'), formatCell(tt.outstanding, 'money', lang)],
    [t('reports.receivables.totals.principal'), formatCell(tt.principal, 'money', lang)],
    [t('reports.receivables.totals.profit'), formatCell(tt.profit, 'money', lang)],
    [t('reports.receivables.totals.overdue'), formatCell(tt.overdue, 'money', lang)],
    [t('reports.receivables.totals.overduePct'), formatCell(tt.overdue_pct, 'pct', lang)],
    [t('reports.receivables.totals.contracts'), formatCell(tt.contracts, 'int', lang)],
    [t('reports.receivables.totals.customers'), formatCell(tt.customers, 'int', lang)],
  ];
  return (
    <Card
      title={t('reports.receivables.totals.title')}
      description={t('reports.receivables.asOf', { date: formatBusinessDate(data.as_of, lang) })}
      className="mb-4"
    >
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </dl>
    </Card>
  );
}

/**
 * The five buckets with their amounts and principal / profit. The bar's widths are a picture of the server's
 * amounts (a share of the outstanding for drawing only); every number written is the server's.
 */
function BucketBar({ data, lang }: { data: ReceivablesReport; lang: 'ar' | 'en' }) {
  const total = Number(data.totals.outstanding);
  const colours = ['bg-success-600', 'bg-ochre-500', 'bg-ochre-700', 'bg-danger-600', 'bg-ink'];
  return (
    <Card title={t('reports.receivables.buckets.title')} className="mb-4">
      {total > 0 && (
        <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-line" aria-hidden>
          {BUCKETS.map((b, i) => {
            const width = (Number(data.totals.buckets[b].amount) / total) * 100;
            return width > 0 ? (
              <div key={b} className={colours[i]} style={{ width: `${width}%` }} />
            ) : null;
          })}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {BUCKETS.map((b) => {
          const s = data.totals.buckets[b];
          return (
            <div key={b} className="min-w-0">
              <dt className="type-caption">{t(`reports.receivables.columns.${b}`)}</dt>
              <dd className="num type-section-title">{formatCell(s.amount, 'money', lang)}</dd>
              <dd className="type-caption">
                {t('reports.receivables.buckets.split', {
                  principal: formatCell(s.principal, 'money', lang),
                  profit: formatCell(s.profit, 'money', lang),
                })}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

/** "Total checked against the open balance of N contracts" or a warning with the differences. */
function CheckLine({ data, lang }: { data: ReceivablesReport; lang: 'ar' | 'en' }) {
  const updated = t('reports.receivables.updated', {
    time: formatDateTime(data.generated_at, lang),
  });
  if (data.check.rows_match) {
    return (
      <p className="type-caption mt-3">
        {t('reports.receivables.check.ok', { count: data.check.contracts_checked })} {updated}
      </p>
    );
  }
  const d = data.check.differences;
  const m = (v: string) => formatCell(v, 'money', lang);
  return (
    <p role="alert" className="mt-3 text-danger-600">
      {t('reports.receivables.check.warning', {
        outstanding: m(d.outstanding),
        principal: m(d.principal),
        notDue: m(d.not_due),
        l30: m(d.late_1_30),
        l60: m(d.late_31_60),
        l90: m(d.late_61_90),
        l90p: m(d.late_90_plus),
        missing: data.check.contracts_without_schedule,
      })}
    </p>
  );
}
