import {
  ReturnQtyExceededDetail,
  returnLineTax,
  sumTaxLines,
  type PurchaseInvoice,
  type PurchaseReturn,
  type TaxBreakdown,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  PURCHASE_RETURN_NOT_FOUND: 'purchases.returns.errors.notFound',
  PURCHASE_INVOICE_NOT_FOUND: 'purchases.errors.notFound',
  PURCHASE_INVOICE_NOT_APPROVED: 'purchases.returns.errors.notApproved',
  RETURN_QTY_EXCEEDED: 'purchases.returns.errors.qtyExceededForm',
  // The goods left the invoice's branch (or a unit was sold, reserved or moved).
  UNIT_NOT_AVAILABLE: 'purchases.returns.errors.notInBranch',
  OUT_OF_STOCK: 'purchases.returns.errors.notInBranch',
  UNIT_NOT_FOUND: 'purchases.returns.errors.unitNotFound',
  VAULT_INVALID: 'purchases.returns.errors.vaultInvalid',
  CASH_ACCOUNT_INACTIVE: 'purchases.returns.errors.accountInactive',
  BRANCH_DENIED: 'purchases.errors.branchDenied',
  BRANCH_INACTIVE: 'purchases.errors.branchInactive',
  DAY_CLOSED: 'purchases.errors.dayClosed',
  PERMISSION_DENIED: 'purchases.errors.permission',
  VALIDATION_FAILED: 'purchases.errors.validation',
};

/** A translated message for a refused purchase return call. */
export function returnError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  return t(ERRORS[code] ?? 'purchases.returns.errors.failed');
}

/** The line a RETURN_QTY_EXCEEDED refusal names and what it can still take (else null). */
export function qtyExceeded(err: unknown): ReturnQtyExceededDetail | null {
  if (!(err instanceof ApiError) || err.code !== 'RETURN_QTY_EXCEEDED') return null;
  const detail = ReturnQtyExceededDetail.safeParse(err.details);
  return detail.success ? detail.data : null;
}

type Returned = TaxBreakdown & { quantity: number };
const NOTHING: Returned = { net: '0.00', tax: '0.00', gross: '0.00', quantity: 0 };

/** What already went back of each invoice line, from the invoice's earlier returns. */
export function returnedByLine(prior: PurchaseReturn[]): Map<string, Returned> {
  const out = new Map<string, Returned>();
  for (const line of prior.flatMap((r) => r.lines)) {
    const before = out.get(line.invoice_line_id) ?? NOTHING;
    const sum = sumTaxLines([
      before,
      { net: line.net, tax: line.tax_amount, gross: line.line_total },
    ]);
    out.set(line.invoice_line_id, { ...sum, quantity: before.quantity + line.quantity });
  }
  return out;
}

/** What the form picked for one invoice line. */
export interface ReturnPick {
  invoice_line_id: string;
  /** How many go back (the number of chosen units for a serialized line). */
  quantity: number;
  /** Serialized lines go back unit by unit, each with its own tax (as the server does). */
  perUnit: boolean;
}

/**
 * Live net, VAT and total of a return (D41), the same calculation as the server: each line's
 * share of the invoice line, the last return taking whatever is left. Null when nothing is picked.
 */
export function returnTotals(
  invoice: PurchaseInvoice,
  prior: Map<string, Returned>,
  picks: ReturnPick[],
): TaxBreakdown | null {
  const parts: TaxBreakdown[] = [];
  for (const pick of picks) {
    const line = invoice.lines.find((l) => l.id === pick.invoice_line_id);
    if (!line || pick.quantity < 1) continue;
    const original = {
      net: line.net,
      tax: line.tax_amount,
      gross: line.line_total,
      quantity: line.quantity,
    };
    let before = prior.get(line.id) ?? NOTHING;
    if (before.quantity + pick.quantity > line.quantity) continue;
    for (const step of pick.perUnit ? Array<number>(pick.quantity).fill(1) : [pick.quantity]) {
      const part = returnLineTax(original, before, step);
      parts.push(part);
      before = { ...sumTaxLines([before, part]), quantity: before.quantity + step };
    }
  }
  return parts.length > 0 ? sumTaxLines(parts) : null;
}
