import {
  PaymentExceedsOutstandingDetail,
  compareMoney,
  subtractMoney,
  sumMoney,
  type OpenSupplierInvoice,
  type SupplierPaymentSummary,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  INSUFFICIENT_FUNDS: 'purchases.payments.errors.insufficientFunds',
  ALLOCATION_INVALID: 'purchases.payments.errors.allocationInvalid',
  DAY_CLOSED: 'purchases.payments.errors.dayClosed',
  VAULT_INVALID: 'purchases.payments.errors.vaultInvalid',
  CASH_ACCOUNT_INACTIVE: 'purchases.payments.errors.accountInactive',
  SUPPLIER_PAYMENT_NOT_FOUND: 'purchases.payments.errors.notFound',
  PAYMENT_ALREADY_REVERSED: 'purchases.payments.errors.alreadyReversed',
  APPROVAL_OWNER_ONLY: 'purchases.payments.errors.ownerOnly',
  SUPPLIER_NOT_FOUND: 'purchases.errors.supplierNotFound',
  BRANCH_DENIED: 'purchases.errors.branchDenied',
  BRANCH_INACTIVE: 'purchases.errors.branchInactive',
  PERMISSION_DENIED: 'purchases.errors.permission',
  VALIDATION_FAILED: 'purchases.errors.validation',
};

/** A translated message for a refused supplier payment call. */
export function paymentError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'PAYMENT_EXCEEDS_OUTSTANDING') {
    const detail = PaymentExceedsOutstandingDetail.safeParse((err as ApiError).details);
    return t('purchases.payments.errors.exceedsOutstanding', {
      outstanding: formatMoney(detail.success ? detail.data.outstanding : '0.00'),
    });
  }
  return t(ERRORS[code] ?? 'purchases.payments.errors.failed');
}

export type PaymentState = 'paid' | 'reversed' | 'reversal';
export const paymentState = (
  p: Pick<SupplierPaymentSummary, 'reverses_payment_id' | 'reversed_by_payment_id'>,
): PaymentState =>
  p.reverses_payment_id ? 'reversal' : p.reversed_by_payment_id ? 'reversed' : 'paid';
export const STATE_TONE: Record<PaymentState, BadgeTone> = {
  paid: 'success',
  reversed: 'danger',
  reversal: 'warning',
};

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
/** A typed amount that is a positive money value (else null). */
export const typedMoney = (v: string) => (MONEY.test(v) && /[1-9]/.test(v) ? v : null);

/** The amount split over the open invoices, oldest first (the order the server lists them in). */
export function fillOldestFirst(amount: string, invoices: OpenSupplierInvoice[]) {
  const out: Record<string, string> = {};
  let left = typedMoney(amount) ? sumMoney([amount]) : '0.00';
  for (const inv of invoices) {
    if (compareMoney(left, '0.00') <= 0) break;
    const take = compareMoney(left, inv.outstanding) > 0 ? inv.outstanding : left;
    out[inv.purchase_invoice_id] = take;
    left = subtractMoney(left, take);
  }
  return out;
}

/** The sum of the typed allocations (rows that aren't a valid amount count as nothing). */
export const allocatedTotal = (allocations: Record<string, string>) =>
  sumMoney(Object.values(allocations).filter((v) => typedMoney(v) !== null));
