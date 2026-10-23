import {
  RECEIVABLES_BUCKETS,
  RECEIVABLES_GROUP_BY,
  RECEIVABLES_MAX_MIN_DAYS,
  RECEIVABLES_MAX_Q,
  RECEIVABLES_NO_COLLECTOR,
  RECEIVABLES_SORTS,
  ReceivablesQuery,
  type ReceivablesBucket,
  type ReceivablesGroupBy,
  type ReceivablesMeasures,
  type ReceivablesRow,
  type ReceivablesSort,
  type ReceivablesTotals,
} from '@ziadkhaled-wb/contracts';
import { enumParam, uuidParam } from '@/lib/urlFilters';
import { formatBusinessDate, formatDateTime } from '@/lib/format';
import { t, type Language, type TranslationKey } from '@/i18n';
import { csvText, formatCell, rawCell, type FieldKind } from './salesReportShared';

/** D03 (D90): the receivables aging page's filters, drill-down, columns, sorting and CSV. */

export interface ReceivablesFilters {
  groupBy: ReceivablesGroupBy;
  branch: string;
  /** '' = all, a collector's id, or `none` (customers without a collector). */
  collector: string;
  customer: string;
  q: string;
  /** 0 = no minimum. */
  minDays: number;
  /** '' = the server's default (outstanding, largest first). */
  sort: ReceivablesSort | '';
  page: number;
  /** The name of the row the user drilled into, for the breadcrumb only (never sent to the server). */
  label: string;
}

export const PAGE_SIZE = 50;
export const EXPORT_PAGE_SIZE = 1000;
const MAX_LABEL = 120;

export function defaultFilters(): ReceivablesFilters {
  return {
    groupBy: 'customer',
    branch: '',
    collector: '',
    customer: '',
    q: '',
    minDays: 0,
    sort: '',
    page: 1,
    label: '',
  };
}

type Params = Pick<URLSearchParams, 'get'>;

/** The filters from the URL. Anything malformed is dropped, so a hostile link never reaches a request. */
export function readFilters(params: Params): ReceivablesFilters {
  const d = defaultFilters();
  const groupBy = enumParam(params, 'group_by', RECEIVABLES_GROUP_BY) || d.groupBy;
  const page = Number(params.get('page'));
  const minDays = Number(params.get('min_days'));
  const collector =
    params.get('collector_id') === RECEIVABLES_NO_COLLECTOR
      ? RECEIVABLES_NO_COLLECTOR
      : uuidParam(params, 'collector_id');
  const q = (params.get('q') ?? '').trim().slice(0, RECEIVABLES_MAX_Q);
  return {
    groupBy,
    branch: uuidParam(params, 'branch_id'),
    collector,
    customer: uuidParam(params, 'customer_id'),
    // The server takes a search only with the customer or contract grouping.
    q: groupBy === 'customer' || groupBy === 'contract' ? q : '',
    minDays:
      Number.isInteger(minDays) && minDays >= 1 && minDays <= RECEIVABLES_MAX_MIN_DAYS
        ? minDays
        : 0,
    sort: enumParam(params, 'sort', RECEIVABLES_SORTS),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    label: (params.get('label') ?? '').slice(0, MAX_LABEL),
  };
}

/** The URL for the filters; values equal to the default are left out. */
export function writeFilters(f: ReceivablesFilters): URLSearchParams {
  const d = defaultFilters();
  const p = new URLSearchParams();
  if (f.groupBy !== d.groupBy) p.set('group_by', f.groupBy);
  if (f.branch) p.set('branch_id', f.branch);
  if (f.collector) p.set('collector_id', f.collector);
  if (f.customer) p.set('customer_id', f.customer);
  if (f.q && (f.groupBy === 'customer' || f.groupBy === 'contract')) p.set('q', f.q);
  if (f.minDays > 0) p.set('min_days', String(f.minDays));
  if (f.sort) p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  if (f.label) p.set('label', f.label);
  return p;
}

/** The request for the filters. */
export function toQuery(
  f: ReceivablesFilters,
  page = f.page,
  pageSize = PAGE_SIZE,
): ReceivablesQuery {
  return ReceivablesQuery.parse({
    group_by: f.groupBy,
    ...(f.branch ? { branch_id: f.branch } : {}),
    ...(f.collector ? { collector_id: f.collector } : {}),
    ...(f.customer ? { customer_id: f.customer } : {}),
    ...(f.q && (f.groupBy === 'customer' || f.groupBy === 'contract') ? { q: f.q } : {}),
    ...(f.minDays > 0 ? { min_days: f.minDays } : {}),
    ...(f.sort ? { sort: f.sort } : {}),
    page,
    page_size: pageSize,
  });
}

// ---- drill-down ----------------------------------------------------------------------------------------------

/**
 * Where a row leads: a branch or a collector opens its customers, a customer opens its contracts (the filters
 * already set are kept), a contract opens its own page.
 */
export function drillTarget(
  row: ReceivablesRow,
  f: ReceivablesFilters,
): { filters: ReceivablesFilters } | { href: string } {
  const name = rowLabel(row, f.groupBy);
  const next = { ...f, sort: '' as const, page: 1, q: '', label: name };
  switch (f.groupBy) {
    case 'branch':
      return { filters: { ...next, groupBy: 'customer', branch: row.key } };
    case 'collector':
      return { filters: { ...next, groupBy: 'customer', collector: row.key } };
    case 'customer':
      return { filters: { ...next, groupBy: 'contract', customer: row.key } };
    case 'contract':
      return { href: `/contracts/${row.key}` };
  }
}

/** The breadcrumb text of the current level: "Customers of X", "Contracts of Y", or null at the top. */
export function crumb(f: ReceivablesFilters): string | null {
  if (!f.label) return null;
  if (f.groupBy === 'contract' && f.customer)
    return t('reports.receivables.drill.contracts', { name: f.label });
  if (f.groupBy === 'customer' && (f.branch || f.collector)) {
    return t('reports.receivables.drill.customers', { name: f.label });
  }
  return null;
}

// ---- labels ----------------------------------------------------------------------------------------------------

/** The text of a row's first column. */
export function rowLabel(row: ReceivablesRow, group: ReceivablesGroupBy): string {
  if (group === 'collector' && row.key === RECEIVABLES_NO_COLLECTOR) {
    return t('reports.receivables.noCollector');
  }
  return row.label ?? row.key;
}

// ---- sorting ------------------------------------------------------------------------------------------------

/** The columns the server can sort by (decision 9) and the sort each direction asks for. */
export const SORTABLE: Record<string, { desc: ReceivablesSort; asc?: ReceivablesSort }> = {
  label: { desc: 'key_asc', asc: 'key_asc' },
  outstanding: { desc: 'outstanding_desc', asc: 'outstanding_asc' },
  overdue: { desc: 'overdue_desc' },
  late_90_plus: { desc: 'late_90_plus_desc' },
  max_days_late: { desc: 'max_days_late_desc' },
};

export function sortToState(sort: ReceivablesSort): { id: string; desc: boolean }[] {
  for (const [id, m] of Object.entries(SORTABLE)) {
    if (m.desc === sort) return [{ id, desc: id !== 'label' }];
    if (m.asc === sort) return [{ id, desc: false }];
  }
  return [];
}

export function stateToSort(state: { id: string; desc: boolean }[]): ReceivablesSort | '' {
  const first = state[0];
  const m = first && SORTABLE[first.id];
  if (!m) return '';
  return first.desc ? m.desc : (m.asc ?? m.desc);
}

// ---- columns -----------------------------------------------------------------------------------------------

export interface Field {
  field: keyof ReceivablesMeasures;
  label: TranslationKey;
  kind: FieldKind | 'date';
  /** The id of the column when the server can sort by it. */
  sortId?: string;
  /** Shown in the danger colour when above zero (the oldest buckets). */
  danger?: boolean;
}

const F = (
  field: Field['field'],
  label: TranslationKey,
  kind: Field['kind'],
  extra: Partial<Field> = {},
): Field => ({ field, label, kind, ...extra });

const BUCKET_FIELDS: Field[] = [
  F('not_due', 'reports.receivables.columns.not_due', 'money'),
  F('late_1_30', 'reports.receivables.columns.late_1_30', 'money'),
  F('late_31_60', 'reports.receivables.columns.late_31_60', 'money'),
  F('late_61_90', 'reports.receivables.columns.late_61_90', 'money', { danger: true }),
  F('late_90_plus', 'reports.receivables.columns.late_90_plus', 'money', {
    danger: true,
    sortId: 'late_90_plus',
  }),
];

/** What the page shows, in order. */
export function tableFields(group: ReceivablesGroupBy): Field[] {
  return [
    F('outstanding', 'reports.receivables.columns.outstanding', 'money', { sortId: 'outstanding' }),
    ...BUCKET_FIELDS,
    F('overdue', 'reports.receivables.columns.overdue', 'money', { sortId: 'overdue' }),
    F('principal', 'reports.receivables.columns.principal', 'money'),
    F('profit', 'reports.receivables.columns.profit', 'money'),
    ...(group === 'contract'
      ? []
      : [F('contracts', 'reports.receivables.columns.contracts', 'int')]),
    F('max_days_late', 'reports.receivables.columns.maxDaysLate', 'int', {
      sortId: 'max_days_late',
    }),
  ];
}

/** What the CSV holds: every measure. */
export const CSV_FIELDS: Field[] = [
  F('outstanding', 'reports.receivables.columns.outstanding', 'money'),
  F('principal', 'reports.receivables.columns.principal', 'money'),
  F('profit', 'reports.receivables.columns.profit', 'money'),
  ...BUCKET_FIELDS,
  F('overdue', 'reports.receivables.columns.overdue', 'money'),
  F('overdue_pct', 'reports.receivables.columns.overduePct', 'pct'),
  F('contracts', 'reports.receivables.columns.contracts', 'int'),
  F('customers', 'reports.receivables.columns.customers', 'int'),
  F('max_days_late', 'reports.receivables.columns.maxDaysLate', 'int'),
  F('oldest_due_date', 'reports.receivables.columns.oldestDue', 'date'),
];

/** A cell: the server's value, formatted for display ('—' when there is none). */
export function formatField(
  value: string | number | null | undefined,
  kind: Field['kind'],
  lang: Language,
): string {
  if (value === null || value === undefined) return '—';
  if (kind === 'date') return formatBusinessDate(String(value), lang);
  return formatCell(value, kind, lang);
}

export function formatPaidAt(value: string | null, lang: Language): string {
  return value ? formatDateTime(value, lang) : '—';
}

export const BUCKETS: readonly ReceivablesBucket[] = RECEIVABLES_BUCKETS;

// ---- CSV ----------------------------------------------------------------------------------------------------------

/**
 * The CSV of a whole report: the header in the page's language, one line per row (with its phone / code /
 * customer, its collector and last payment) and a totals line. Numbers are the server's strings (no rounding,
 * no adding in the browser). UTF-8 with a BOM so Excel shows Arabic.
 */
export function buildCsv(
  group: ReceivablesGroupBy,
  rows: ReceivablesRow[],
  totals: ReceivablesTotals,
): string {
  const second: TranslationKey =
    group === 'customer'
      ? 'reports.receivables.columns.phone'
      : group === 'branch'
        ? 'reports.receivables.columns.branch'
        : 'reports.receivables.columns.customer';
  const header = [
    t(`reports.receivables.group.${group}`),
    ...(group === 'collector' ? [] : [t(second)]),
    ...(group === 'customer' ? [t('reports.receivables.columns.collector')] : []),
    ...CSV_FIELDS.map((f) => t(f.label)),
    t('reports.receivables.columns.lastPayment'),
  ];
  const lines = rows.map((row) => [
    rowLabel(row, group),
    ...(group === 'collector' ? [] : [rawCell(row.sub_label)]),
    ...(group === 'customer' ? [rawCell(row.collector?.name)] : []),
    ...CSV_FIELDS.map((f) => rawCell(row[f.field])),
    rawCell(row.last_payment_at),
  ]);
  const totalLine = [
    t('reports.receivables.export.totals'),
    ...(group === 'collector' ? [] : ['']),
    ...(group === 'customer' ? [''] : []),
    ...CSV_FIELDS.map((f) => rawCell(totals[f.field])),
    '',
  ];
  return csvText([header, ...lines, totalLine]);
}
