import type { CreditExceptionStatus, CreditReason } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

/** How long an approved exception stays usable (the server's rule; shown in the request dialog). */
export const EXCEPTION_HOURS = 24;

export const STATUS_TONE: Record<CreditExceptionStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const reasonLabel = (reason: CreditReason) => t(`credit.reason.${reason}` as TranslationKey);

const ERRORS: Partial<Record<string, TranslationKey>> = {
  CREDIT_REASON_REQUIRED: 'credit.errors.reasonRequired',
  CREDIT_LIMIT_EXCEEDED: 'credit.errors.limitExceeded',
  CREDIT_SCORE_TOO_LOW: 'credit.errors.scoreTooLow',
  CREDIT_CUSTOMER_WATCH: 'credit.errors.watch',
  CREDIT_APPROVAL_INVALID: 'credit.errors.approvalInvalid',
  CUSTOMER_BLOCKED: 'credit.errors.blocked',
  CUSTOMER_NOT_FOUND: 'credit.errors.notFound',
  APPROVAL_NOT_FOUND: 'credit.errors.notFound',
  APPROVAL_NOT_PENDING: 'credit.errors.notPending',
  APPROVAL_NOT_NEEDED: 'credit.errors.notNeeded',
  APPROVAL_NOTE_REQUIRED: 'credit.errors.noteRequired',
  APPROVAL_SELF: 'credit.errors.self',
  PERMISSION_DENIED: 'credit.errors.permission',
  MODULE_NOT_IN_PLAN: 'credit.errors.module',
  VALIDATION_FAILED: 'credit.errors.validation',
  SUBSCRIPTION_EXPIRED: 'credit.errors.expired',
};

/** The words for a refused credit call. */
export const creditError = (err: unknown): string =>
  t(ERRORS[err instanceof ApiError ? err.code : ''] ?? 'credit.errors.failed');
