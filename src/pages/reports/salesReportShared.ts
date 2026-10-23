import {
  SALES_REPORT_GROUP_BY,
  SALES_REPORT_MAX_DAYS,
  SALES_REPORT_SORTS,
  SalesReportQuery,
  salesReportDays,
  type SalesReport,
  type SalesReportGroupBy,
  type SalesReportMeasures,
  type SalesReportRow,
  type SalesReportSort,
} from '@ziadkhaled-wb/contracts';
import { dateParam, enumParam, uuidParam } from '@/lib/urlFilters';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { t, type Language, type TranslationKey } from '@/i18n';

/** D02 (D89): the sales and margin report page's filters, columns, sorting, drill-down links and CSV. */

export const SALE_TYPES = ['cash', 'installment'] as const;
export type SaleTypeFilter = '' | (typeof SALE_TYPES)[number];

export interface SalesFilters {
  from: string;
  to: string;
  groupBy: SalesReportGroupBy;
  branch: string;
  employee: string;
  category: string;
  topLevel: boolean;
  product: string;
  saleType: SaleTypeFilter;
  /** '' = the server's default for the grouping. */
  sort: SalesReportSort | '';
  page: number;
}

export const PAGE_SIZE = 50;
export const EXPORT_PAGE_SIZE = 1000;

// ---- dates (business dates, YYYY-MM-DD, never the browser's clock) --------------------------------------

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) =>
  iso(new Date(toUtc(date).getTime() + n * 86_400_000));
const firstOfMonth = (date: string) => `${date.slice(0, 8)}01`;

export const PRESETS = ['today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear'] as const;
export type Preset = (typeof PRESETS)[number];

/** The shop's dates for a quick period. The week starts on Saturday (Egypt) and runs up to today. */
export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek': {
      const daysSinceSaturday = (toUtc(today).getUTCDay() + 1) % 7;
      return { from: addDays(today, -daysSinceSaturday), to: today };
    }
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth': {
      const lastDay = addDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastDay), to: lastDay };
    }
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

export function activePreset(f: Pick<SalesFilters, 'from' | 'to'>, today: string): Preset | null {
  return (
    PRESETS.find((p) => {
      const r = presetRange(p, today);
      return r.from === f.from && r.to === f.to;
    }) ?? null
  );
}

export function periodValid(f: Pick<SalesFilters, 'from' | 'to'>): boolean {
  return f.from <= f.to && salesReportDays(f.from, f.to) <= SALES_REPORT_MAX_DAYS;
}

// ---- filters <-> URL ---------------------------------------------------------------------------------------

export function defaultFilters(today: string): SalesFilters {
  return {
    from: firstOfMonth(today),
    to: today,
    groupBy: 'day',
    branch: '',
    employee: '',
    category: '',
    topLevel: false,
    product: '',
    saleType: '',
    sort: '',
    page: 1,
  };
}

type Params = Pick<URLSearchParams, 'get'>;

/** The filters from the URL. Anything malformed is dropped, so a hostile link never reaches a request. */
export function readFilters(params: Params, today: string): SalesFilters {
  const d = defaultFilters(today);
  const page = Number(params.get('page'));
  return {
    from: dateParam(params, 'from') || d.from,
    to: dateParam(params, 'to') || d.to,
    groupBy: enumParam(params, 'group_by', SALES_REPORT_GROUP_BY) || d.groupBy,
    branch: uuidParam(params, 'branch_id'),
    employee: uuidParam(params, 'employee_id'),
    category: uuidParam(params, 'category_id'),
    topLevel: params.get('category_level') === 'top',
    product: uuidParam(params, 'product_id'),
    saleType: enumParam(params, 'sale_type', SALE_TYPES),
    sort: enumParam(params, 'sort', SALES_REPORT_SORTS),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The URL for the filters; values equal to the default are left out. */
export function writeFilters(f: SalesFilters, today: string): URLSearchParams {
  const d = defaultFilters(today);
  const p = new URLSearchParams();
  if (f.from !== d.from) p.set('from', f.from);
  if (f.to !== d.to) p.set('to', f.to);
  if (f.groupBy !== d.groupBy) p.set('group_by', f.groupBy);
  if (f.branch) p.set('branch_id', f.branch);
  if (f.employee) p.set('employee_id', f.employee);
  if (f.category) p.set('category_id', f.category);
  if (f.topLevel && f.groupBy === 'category') p.set('category_level', 'top');
  if (f.product) p.set('product_id', f.product);
  if (f.saleType) p.set('sale_type', f.saleType);
  if (f.sort) p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

/** The request. The money-by-payment-type grouping takes no product or category filter. */
export function toQuery(f: SalesFilters, page = f.page, pageSize = PAGE_SIZE): SalesReportQuery {
  const money = f.groupBy === 'payment_type';
  return SalesReportQuery.parse({
    from: f.from,
    to: f.to,
    group_by: f.groupBy,
    ...(f.branch ? { branch_id: f.branch } : {}),
    ...(f.employee ? { employee_id: f.employee } : {}),
    ...(f.category && !money ? { category_id: f.category } : {}),
    ...(f.topLevel && f.groupBy === 'category' ? { category_level: 'top' } : {}),
    ...(f.product && !money ? { product_id: f.product } : {}),
    ...(f.saleType ? { sale_type: f.saleType } : {}),
    ...(f.sort ? { sort: f.sort } : {}),
    page,
    page_size: pageSize,
  });
}

// ---- sorting ------------------------------------------------------------------------------------------------

/** The columns the server can sort by (decision 9) and the sort each direction asks for. */
export const SORTABLE: Record<string, { desc: SalesReportSort; asc?: SalesReportSort }> = {
  label: { desc: 'key_asc', asc: 'key_asc' },
  revenue: { desc: 'revenue_desc', asc: 'revenue_asc' },
  margin: { desc: 'margin_desc', asc: 'margin_asc' },
  quantity: { desc: 'quantity_desc' },
  net_revenue: { desc: 'net_revenue_desc' },
};

export function defaultSort(group: SalesReportGroupBy): SalesReportSort {
  return group === 'day' || group === 'month' ? 'key_asc' : 'revenue_desc';
}

export function sortToState(sort: SalesReportSort): { id: string; desc: boolean }[] {
  for (const [id, m] of Object.entries(SORTABLE)) {
    if (m.desc === sort) return [{ id, desc: id !== 'label' }];
    if (m.asc === sort) return [{ id, desc: false }];
  }
  return [];
}

export function stateToSort(state: { id: string; desc: boolean }[]): SalesReportSort | '' {
  const first = state[0];
  const m = first && SORTABLE[first.id];
  if (!m) return '';
  return first.desc ? m.desc : (m.asc ?? m.desc);
}

// ---- columns -----------------------------------------------------------------------------------------------

export type FieldKind = 'int' | 'money' | 'pct';
export interface Field {
  field: Exclude<keyof SalesReportMeasures, never>;
  label: TranslationKey;
  kind: FieldKind;
  /** Cost-derived: only with report.financial. */
  cost?: boolean;
  /** The id of the column when the server can sort by it. */
  sortId?: string;
}

const F = (
  field: Field['field'],
  label: TranslationKey,
  kind: FieldKind,
  extra: Partial<Field> = {},
): Field => ({ field, label, kind, ...extra });

/** What the page shows, in order. */
export const TABLE_FIELDS: Field[] = [
  F('sales_count', 'reports.sales.columns.salesCount', 'int'),
  F('quantity', 'reports.sales.columns.quantity', 'int', { sortId: 'quantity' }),
  F('revenue', 'reports.sales.columns.revenue', 'money', { sortId: 'revenue' }),
  F('cost', 'reports.sales.columns.cost', 'money', { cost: true }),
  F('margin', 'reports.sales.columns.margin', 'money', { cost: true, sortId: 'margin' }),
  F('margin_pct', 'reports.sales.columns.marginPct', 'pct', { cost: true }),
  F('returned_revenue', 'reports.sales.columns.returnedRevenue', 'money'),
  F('net_revenue', 'reports.sales.columns.netRevenue', 'money', { sortId: 'net_revenue' }),
  F('net_margin', 'reports.sales.columns.netMargin', 'money', { cost: true }),
  F('contract_profit', 'reports.sales.columns.contractProfit', 'money', { cost: true }),
];

/** What the CSV holds: every measure of the grouping. */
export const CSV_FIELDS: Field[] = [
  F('sales_count', 'reports.sales.columns.salesCount', 'int'),
  F('quantity', 'reports.sales.columns.quantity', 'int'),
  F('revenue', 'reports.sales.columns.revenue', 'money'),
  F('gross', 'reports.sales.columns.gross', 'money'),
  F('tax', 'reports.sales.columns.tax', 'money'),
  F('discount', 'reports.sales.columns.discount', 'money'),
  F('cost', 'reports.sales.columns.cost', 'money', { cost: true }),
  F('margin', 'reports.sales.columns.margin', 'money', { cost: true }),
  F('margin_pct', 'reports.sales.columns.marginPct', 'pct', { cost: true }),
  F('return_count', 'reports.sales.columns.returnCount', 'int'),
  F('returned_quantity', 'reports.sales.columns.returnedQuantity', 'int'),
  F('returned_gross', 'reports.sales.columns.returnedGross', 'money'),
  F('returned_revenue', 'reports.sales.columns.returnedRevenue', 'money'),
  F('returned_tax', 'reports.sales.columns.returnedTax', 'money'),
  F('returned_cost', 'reports.sales.columns.returnedCost', 'money', { cost: true }),
  F('returned_margin', 'reports.sales.columns.returnedMargin', 'money', { cost: true }),
  F('net_quantity', 'reports.sales.columns.netQuantity', 'int'),
  F('net_revenue', 'reports.sales.columns.netRevenue', 'money'),
  F('net_cost', 'reports.sales.columns.netCost', 'money', { cost: true }),
  F('net_margin', 'reports.sales.columns.netMargin', 'money', { cost: true }),
  F('net_margin_pct', 'reports.sales.columns.netMarginPct', 'pct', { cost: true }),
  F('contract_profit', 'reports.sales.columns.contractProfit', 'money', { cost: true }),
  F('contract_profit_returned', 'reports.sales.columns.contractProfitReturned', 'money', {
    cost: true,
  }),
];

/** Money by payment type: only the money columns. */
export const MONEY_FIELDS: Field[] = [
  F('amount', 'reports.sales.columns.amount', 'money'),
  F('refunded', 'reports.sales.columns.refunded', 'money'),
  F('net_amount', 'reports.sales.columns.netAmount', 'money'),
];

export function fieldsFor(
  group: SalesReportGroupBy,
  canSeeCost: boolean,
  kind: 'table' | 'csv',
): Field[] {
  const base =
    group === 'payment_type' ? MONEY_FIELDS : kind === 'table' ? TABLE_FIELDS : CSV_FIELDS;
  return base.filter((f) => canSeeCost || !f.cost);
}

/** A cell: the server's string, formatted for display ('-' for a value the grouping does not have). */
export function formatCell(value: string | number | null, kind: FieldKind, lang: Language): string {
  if (value === null || value === undefined) return '—';
  if (kind === 'pct') {
    const one = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    return `${formatNumber(String(value), lang, one)}%`;
  }
  if (kind === 'money') return formatMoney(String(value), lang);
  return formatNumber(String(value), lang);
}

// ---- labels ----------------------------------------------------------------------------------------------------

/** The text of a row's first column. */
export function rowLabel(row: SalesReportRow, group: SalesReportGroupBy, lang: Language): string {
  switch (group) {
    case 'day':
      return formatBusinessDate(row.key, lang);
    case 'month':
      return row.label ?? row.key.slice(0, 7);
    case 'sale_type':
      return t(`reports.sales.saleType.${row.key === 'installment' ? 'installment' : 'cash'}`);
    case 'payment_type':
      return t(
        `reports.sales.paymentType.${
          row.key === 'bank_transfer' || row.key === 'store_credit' || row.key === 'on_contract'
            ? row.key
            : 'cash'
        }`,
      );
    case 'category':
      return row.key === 'none' ? t('reports.sales.noCategory') : (row.label ?? row.key);
    case 'product':
      return (lang === 'en' ? row.label_en : null) ?? row.label ?? row.key;
    default:
      return row.label ?? row.key;
  }
}

// ---- drill-down -------------------------------------------------------------------------------------------------

/**
 * A row's link to the sales history (S07), with the same dates and branch. S07 filters by day, branch and
 * cashier; it has no product filter, so a product row has no link.
 */
export function drillLink(
  row: SalesReportRow,
  group: SalesReportGroupBy,
  f: SalesFilters,
): string | null {
  if (group !== 'day' && group !== 'branch' && group !== 'employee') return null;
  if (group !== 'day' && row.sales_count === 0) return null;
  const p = new URLSearchParams();
  p.set('from', group === 'day' ? row.key : f.from);
  p.set('to', group === 'day' ? row.key : f.to);
  if (group === 'branch') p.set('branch_id', row.key);
  else if (f.branch) p.set('branch_id', f.branch);
  if (group === 'employee') p.set('cashier_id', row.key);
  return `/sales/history?${p.toString()}`;
}

// ---- CSV ----------------------------------------------------------------------------------------------------------

const BOM = String.fromCharCode(0xfeff);

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** A measure exactly as the server sent it ('' for a value the grouping does not have). */
export function rawCell(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** CSV text of the lines (the first is the header): quoted where needed, CRLF, UTF-8 BOM so Excel shows Arabic. */
export function csvText(lines: string[][]): string {
  return `${BOM}${lines.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * The CSV of a whole report: the header in the page's language, one line per row and a totals line.
 * Numbers are the server's strings (no rounding, no adding in the browser). UTF-8 with a BOM so Excel
 * shows Arabic.
 */
export function buildCsv(
  group: SalesReportGroupBy,
  rows: SalesReportRow[],
  totals: SalesReport['totals'],
  canSeeCost: boolean,
  lang: Language,
): string {
  const fields = fieldsFor(group, canSeeCost, 'csv');
  const header = [t(`reports.sales.group.${group}`), ...fields.map((f) => t(f.label))];
  const label = (row: SalesReportRow) =>
    group === 'day' || group === 'month' ? row.key : rowLabel(row, group, lang);
  const lines = rows.map((row) => [label(row), ...fields.map((f) => rawCell(row[f.field]))]);
  const totalLine = [
    t('reports.sales.export.totals'),
    ...fields.map((f) => rawCell(totals[f.field])),
  ];
  return csvText([header, ...lines, totalLine]);
}
