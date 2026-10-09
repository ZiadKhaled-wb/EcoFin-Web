import {
  SerialTakenDetail,
  computeDocumentTax,
  type PurchaseInvoiceStatus,
  type TaxDocumentResult,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { getLanguage, t, type TranslationKey } from '@/i18n';

export const STATUS_TONE: Record<PurchaseInvoiceStatus, BadgeTone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const productName = (p: { name_ar: string; name_en: string | null }) =>
  getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;

/** Today in the shop's time zone, as a business date (YYYY-MM-DD). */
export function shopToday(timeZone = 'Africa/Cairo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

const ERRORS: Partial<Record<string, TranslationKey>> = {
  PURCHASE_INVOICE_NOT_FOUND: 'purchases.errors.notFound',
  PURCHASE_INVOICE_NOT_EDITABLE: 'purchases.errors.notEditable',
  SUPPLIER_INVOICE_NO_TAKEN: 'purchases.errors.supplierInvoiceNoTaken',
  SUPPLIER_ARCHIVED: 'purchases.errors.supplierArchived',
  SUPPLIER_NOT_FOUND: 'purchases.errors.supplierNotFound',
  PRODUCT_NOT_FOUND: 'purchases.errors.productNotFound',
  TAX_CLASS_NOT_FOUND: 'purchases.errors.taxClassNotFound',
  SERIAL_INVALID: 'purchases.errors.serialInvalid',
  SERIALS_REQUIRED: 'purchases.errors.serialsRequired',
  UNIT_NOT_ALLOWED: 'purchases.errors.unitNotAllowed',
  MODULE_NOT_IN_PLAN: 'purchases.errors.moduleNotInPlan',
  BRANCH_DENIED: 'purchases.errors.branchDenied',
  BRANCH_INACTIVE: 'purchases.errors.branchInactive',
  DAY_CLOSED: 'purchases.errors.dayClosed',
  PERMISSION_DENIED: 'purchases.errors.permission',
  VALIDATION_FAILED: 'purchases.errors.validation',
};

/** The serials a SERIAL_TAKEN refusal names (empty for any other error). */
export function takenSerials(err: unknown): string[] {
  if (!(err instanceof ApiError) || err.code !== 'SERIAL_TAKEN') return [];
  const detail = SerialTakenDetail.safeParse(err.details);
  return detail.success ? detail.data.serials : [];
}

/** A translated message for a refused purchase invoice call. */
export function purchaseError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'SERIAL_TAKEN') {
    const separator = getLanguage() === 'ar' ? '، ' : ', ';
    return t('purchases.errors.serialTaken', { serials: takenSerials(err).join(separator) });
  }
  return t(ERRORS[code] ?? 'purchases.errors.failed');
}

/** One line as the live totals need it. */
export interface CostLine {
  quantity: string;
  unit_cost: string;
  tax_rate: string;
}

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const usable = (l: CostLine) => /^[1-9]\d*$/.test(l.quantity) && MONEY.test(l.unit_cost);

/**
 * Live net, VAT and total (prices before VAT, D54), the same calculation as the server. Lines
 * that aren't filled in yet count as nothing; null when no line is usable.
 */
export function liveTotals(lines: CostLine[]): TaxDocumentResult | null {
  const ok = lines.filter(usable);
  if (ok.length === 0) return null;
  return computeDocumentTax({
    prices_include_vat: false,
    lines: ok.map((l) => ({
      unit_price: l.unit_cost,
      quantity: Number(l.quantity),
      tax_rate: l.tax_rate,
    })),
  });
}

/** The live result for one line (or null while it isn't filled in). */
export function lineTotals(line: CostLine) {
  return usable(line) ? (liveTotals([line])?.lines[0] ?? null) : null;
}

/** Serials typed one per line: trimmed, upper-cased, blanks dropped. */
export const parseSerials = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
