import type { StockCountStatus } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

export const COUNT_TONE: Record<StockCountStatus, BadgeTone> = {
  open: 'warning',
  posted: 'success',
  cancelled: 'neutral',
};
/** Errors of the count screens (create, scan, save, post, cancel). */
export const COUNT_ERRORS: Partial<Record<string, TranslationKey>> = {
  STOCK_COUNT_OPEN: 'stock.counts.errors.open',
  STOCK_COUNT_INCOMPLETE: 'stock.counts.errors.incomplete',
  STOCK_COUNT_PRODUCT_OUT_OF_SCOPE: 'stock.counts.errors.outOfScope',
  UNIT_ALREADY_IN_STOCK: 'stock.counts.errors.unitElsewhere',
  UNIT_REQUIRED: 'stock.counts.errors.unitRequired',
  PRODUCT_NOT_FOUND: 'stock.counts.errors.notFound',
  UNIT_NOT_FOUND: 'stock.counts.errors.notFound',
  DOCUMENT_FINAL: 'stock.counts.errors.final',
  VALIDATION_FAILED: 'stock.counts.errors.validation',
  OUT_OF_STOCK: 'stock.counts.errors.outOfStock',
  UNIT_NOT_AVAILABLE: 'stock.counts.errors.outOfStock',
  DAY_CLOSED: 'stock.counts.errors.dayClosed',
  PERMISSION_DENIED: 'stock.counts.errors.permission',
};
export const countError = (err: unknown) =>
  t(COUNT_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'stock.counts.errors.failed');
