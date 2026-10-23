import type { OfflineSaleSummary } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

const KNOWN_ERRORS = new Set([
  'RESOLUTION_NOT_ALLOWED',
  'REASON_REQUIRED',
  'OFFLINE_SALES_OPEN',
  'OFFLINE_SALE_NOT_FOUND',
  'UNIT_PRODUCT_MISMATCH',
  'UNIT_NOT_AVAILABLE',
  'UNIT_NOT_FOUND',
  'SHIFT_NOT_FOUND',
  'SHIFT_CLOSED',
  'DEVICE_NOT_FOUND',
  'VALIDATION_FAILED',
]);
const KNOWN_CODES = new Set([
  'SHIFT_CLOSED',
  'TIME_INVALID',
  'LIMIT_EXCEEDED',
  'PRICE_MISMATCH',
  'TOTALS_MISMATCH',
  'SERIAL_UNAVAILABLE',
  'VERIFY_FAILED',
  'NOT_OURS',
  'LEASE_REVOKED',
  'RECEIPT_MISMATCH',
]);

export function offlineError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  return KNOWN_ERRORS.has(code)
    ? t(`offline.errors.${code}` as TranslationKey)
    : t('offline.errors.failed');
}

/** The reason shown for a sale: its conflict, its hold, else nothing. */
export function offlineReason(sale: Pick<OfflineSaleSummary, 'conflict_code' | 'fiscal_hold'>) {
  const code = sale.fiscal_hold ?? sale.conflict_code;
  return code && KNOWN_CODES.has(code)
    ? t(`offline.review.codes.${code}` as TranslationKey)
    : (code ?? '');
}
