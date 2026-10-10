import { PoOverReceiptDetail, type PurchaseOrderStatus } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';

export const ORDER_STATUS_TONE: Record<PurchaseOrderStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'warning',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
};

const ERRORS: Partial<Record<string, TranslationKey>> = {
  PURCHASE_ORDER_NOT_FOUND: 'purchases.orders.errors.notFound',
  PURCHASE_ORDER_NOT_EDITABLE: 'purchases.orders.errors.notEditable',
  PO_NOT_SENT: 'purchases.orders.errors.notSent',
  PO_CLOSED: 'purchases.orders.errors.closed',
  PO_LINE_MISMATCH: 'purchases.orders.errors.lineMismatch',
  SALES_ORDER_LINE_INVALID: 'purchases.orders.errors.salesLineInvalid',
  SUPPLIER_ARCHIVED: 'purchases.errors.supplierArchived',
  SUPPLIER_NOT_FOUND: 'purchases.errors.supplierNotFound',
  PRODUCT_NOT_FOUND: 'purchases.errors.productNotFound',
  BRANCH_DENIED: 'purchases.errors.branchDenied',
  BRANCH_INACTIVE: 'purchases.errors.branchInactive',
  PERMISSION_DENIED: 'purchases.errors.permission',
  VALIDATION_FAILED: 'purchases.errors.validation',
};

/** The order line a PO_OVER_RECEIPT refusal names and what is still to come on it (else null). */
export function overReceipt(err: unknown): PoOverReceiptDetail | null {
  if (!(err instanceof ApiError) || err.code !== 'PO_OVER_RECEIPT') return null;
  const detail = PoOverReceiptDetail.safeParse(err.details);
  return detail.success ? detail.data : null;
}

/** A translated message for a refused purchase order call. */
export function orderError(err: unknown): string {
  const over = overReceipt(err);
  if (over) {
    return t('purchases.orders.errors.overReceipt', { remaining: formatNumber(over.remaining) });
  }
  const code = err instanceof ApiError ? err.code : '';
  return t(ERRORS[code] ?? 'purchases.orders.errors.failed');
}
