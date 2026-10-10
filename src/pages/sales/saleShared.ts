import { OutOfStockDetail } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  SHIFT_REQUIRED: 'sales.errors.shiftRequired',
  SHIFT_CLOSED: 'sales.errors.shiftClosed',
  UNIT_NOT_AVAILABLE: 'sales.errors.unitNotAvailable',
  UNIT_NOT_FOUND: 'sales.errors.unitNotAvailable',
  UNIT_REQUIRED: 'sales.errors.unitRequired',
  PRODUCT_NOT_FOUND: 'sales.errors.productNotFound',
  PRODUCT_ARCHIVED: 'sales.errors.productArchived',
  PRICE_OVERRIDE_DENIED: 'sales.errors.priceOverrideDenied',
  PRICE_CHANGED: 'sales.pos.priceChanged',
  CUSTOMER_NOT_FOUND: 'sales.errors.customerNotFound',
  DAY_CLOSED: 'sales.errors.dayClosed',
  PAYMENT_TOTAL_MISMATCH: 'sales.errors.paymentTotalMismatch',
  INSUFFICIENT_STORE_CREDIT: 'sales.errors.insufficientCredit',
  VAULT_INVALID: 'sales.errors.vaultInvalid',
  CASH_ACCOUNT_INACTIVE: 'sales.errors.accountInactive',
  MODULE_NOT_IN_PLAN: 'sales.errors.moduleNotInPlan',
  SUBSCRIPTION_EXPIRED: 'sales.errors.expired',
  PERMISSION_DENIED: 'sales.errors.permission',
  VALIDATION_FAILED: 'sales.errors.validation',
};

/** A translated message for a refused quote or sale. */
export function saleError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'OUT_OF_STOCK') {
    const detail = OutOfStockDetail.safeParse((err as ApiError).details);
    return detail.success
      ? t('sales.errors.outOfStock', { available: detail.data.available })
      : t('sales.errors.outOfStockPlain');
  }
  return t(ERRORS[code] ?? 'sales.errors.failed');
}
