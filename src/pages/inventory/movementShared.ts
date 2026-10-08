import type { StockMovement, StockMovementType } from '@ziadkhaled-wb/contracts';
import { getLanguage, t } from '@/i18n';

/** The movement types the history filter offers (I05 slice: sale, purchase, return, transfer, adjustment). */
export const TYPE_GROUPS = {
  sales: ['sale_out', 'delivery_out'],
  returns: ['sale_return_in', 'purchase_return_out'],
  purchases: ['purchase_in'],
  transfers: ['transfer_out', 'transfer_in'],
  adjustments: ['adjustment'],
  opening: ['opening'],
  warranty: ['claim_out', 'claim_in'],
} as const satisfies Record<string, readonly StockMovementType[]>;
export type TypeGroup = keyof typeof TYPE_GROUPS;
export const TYPE_GROUP_KEYS = Object.keys(TYPE_GROUPS) as TypeGroup[];

type DocumentRef = Pick<StockMovement, 'source_type' | 'source_id' | 'source_number' | 'unit_id'>;

/**
 * Where the website shows a movement's source document (D51), or null while that kind of
 * document has no screen yet. S01, S05, S07, U02, U04 and S12 add their routes here.
 */
export function documentHref(m: DocumentRef): string | null {
  switch (m.source_type) {
    case 'stock_adjustment':
      return `/inventory/adjustments?view=${encodeURIComponent(m.source_id)}`;
    case 'transfer':
      return `/inventory/transfers/${encodeURIComponent(m.source_id)}`;
    case 'import':
      // A serial registration (I04) is shown on the unit's page.
      return m.unit_id ? `/inventory/units/${encodeURIComponent(m.unit_id)}` : null;
    default:
      return null;
  }
}

const DOCUMENT_KINDS = [
  'sale',
  'sales_return',
  'delivery',
  'purchase_invoice',
  'purchase_return',
  'transfer',
  'stock_adjustment',
  'warranty_claim',
  'import',
] as const;
type DocumentKind = (typeof DOCUMENT_KINDS)[number];
const isDocumentKind = (v: string): v is DocumentKind =>
  (DOCUMENT_KINDS as readonly string[]).includes(v);

/** The document's number, or its kind when it has none (an opening registration). */
export function documentLabel(m: DocumentRef): string {
  if (m.source_number) return m.source_number;
  return isDocumentKind(m.source_type)
    ? t(`stock.history.documents.${m.source_type}`)
    : t('stock.history.documents.other');
}

export function movementProductName(m: Pick<StockMovement, 'product_name_ar' | 'product_name_en'>) {
  return getLanguage() === 'en' && m.product_name_en ? m.product_name_en : m.product_name_ar;
}

/** A type with its reason and damaged state, as the tables and the CSV show it. */
export function movementTypeLabel(m: Pick<StockMovement, 'type' | 'reason' | 'stock_state'>) {
  return [
    t(`stock.types.${m.type}`),
    m.reason ? t(`stock.reasons.${m.reason}`) : null,
    m.stock_state === 'damaged' ? t('stock.drawer.damaged') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local date and time, YYYY-MM-DD HH:mm (a spreadsheet reads it as a date). */
function csvTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CSV_COLUMNS = [
  'date',
  'businessDate',
  'product',
  'sku',
  'branch',
  'type',
  'quantity',
  'balance',
  'serial',
  'document',
  'party',
  'by',
] as const;
const BOM = String.fromCharCode(0xfeff);

/** The export as CSV: UTF-8 with a BOM (Excel shows Arabic), headers in the user's language. */
export function movementsCsv(items: StockMovement[], branchName: (id: string) => string): string {
  const header = CSV_COLUMNS.map((k) => t(`stock.history.csv.${k}`));
  const rows = items.map((m) => [
    csvTime(m.created_at),
    m.business_date,
    movementProductName(m),
    m.sku,
    branchName(m.branch_id),
    movementTypeLabel(m),
    m.quantity,
    m.balance_after,
    m.serial,
    documentLabel(m),
    m.party,
    m.created_by_name,
  ]);
  return `${BOM}${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Saves text as a file through a temporary link. */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
