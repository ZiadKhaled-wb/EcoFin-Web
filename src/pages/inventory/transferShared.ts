import type { TransferStatus } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

export const TRANSFER_TONE: Record<TransferStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'warning',
  received: 'success',
  partially_received: 'danger',
  cancelled: 'neutral',
};

/** Errors of the transfer screens (create, edit, send, receive, cancel). */
const TRANSFER_ERRORS: Partial<Record<string, TranslationKey>> = {
  TRANSFER_SAME_BRANCH: 'stock.transfers.errors.sameBranch',
  TRANSFER_ALREADY_SENT: 'stock.transfers.errors.alreadySent',
  TRANSFER_NOT_SENT: 'stock.transfers.errors.notSent',
  DOCUMENT_FINAL: 'stock.transfers.errors.final',
  OUT_OF_STOCK: 'stock.transfers.errors.outOfStock',
  UNIT_NOT_AVAILABLE: 'stock.transfers.errors.unit',
  UNIT_ALREADY_IN_STOCK: 'stock.transfers.errors.unit',
  UNIT_REQUIRED: 'stock.transfers.errors.unit',
  UNIT_PRODUCT_MISMATCH: 'stock.transfers.errors.unit',
  BRANCH_DENIED: 'stock.transfers.errors.branch',
  BRANCH_INACTIVE: 'stock.transfers.errors.branchInactive',
  DAY_CLOSED: 'stock.transfers.errors.dayClosed',
  PERMISSION_DENIED: 'stock.transfers.errors.permission',
  PRODUCT_NOT_FOUND: 'stock.transfers.errors.notFound',
  UNIT_NOT_FOUND: 'stock.transfers.errors.notFound',
  VALIDATION_FAILED: 'stock.transfers.errors.validation',
};

export const transferError = (err: unknown) =>
  t(TRANSFER_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'stock.transfers.errors.failed');
