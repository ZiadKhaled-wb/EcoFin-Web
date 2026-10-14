import type {
  FiscalDeadlineState,
  FiscalFix,
  FiscalProblem,
  FiscalSituation,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError, type ApiErrorCode } from '@/lib/api';
import { getLanguage, t, type TranslationKey } from '@/i18n';

export const SITUATION_TONE: Record<FiscalSituation, BadgeTone> = {
  waiting: 'neutral',
  accepted: 'success',
  cancelled: 'neutral',
  blocked: 'warning',
  send_failed: 'danger',
  rejected: 'danger',
};

const ERRORS: Partial<Record<ApiErrorCode, TranslationKey>> = {
  FISCAL_NOT_FOUND: 'fiscal.errors.FISCAL_NOT_FOUND',
  USE_CORRECTION: 'fiscal.errors.USE_CORRECTION',
  NOT_REJECTED: 'fiscal.errors.NOT_REJECTED',
  CORRECTION_QUEUED: 'fiscal.errors.CORRECTION_QUEUED',
  CORRECTION_CONFLICT: 'fiscal.errors.CORRECTION_CONFLICT',
  NOT_BLOCKED_NO_DEVICE: 'fiscal.errors.NOT_BLOCKED_NO_DEVICE',
  DEVICE_INVALID_FOR_RECEIPT: 'fiscal.errors.DEVICE_INVALID_FOR_RECEIPT',
  NOT_SUBMITTED: 'fiscal.errors.NOT_SUBMITTED',
  PERMISSION_DENIED: 'fiscal.errors.PERMISSION_DENIED',
  FISCAL_NOT_RETRYABLE: 'fiscal.errors.FISCAL_NOT_RETRYABLE',
};

/** The server code of a failed call as a translated sentence; anything else is the generic message. */
export function fiscalErrorText(error: unknown): string {
  return t((error instanceof ApiError && ERRORS[error.code]) || 'errors.unknown');
}

const REASONS: Record<string, TranslationKey> = {
  NOT_READY: 'fiscal.reasons.NOT_READY',
  NOT_ELIGIBLE: 'fiscal.reasons.NOT_ELIGIBLE',
  FISCAL_NOT_FOUND: 'fiscal.reasons.FISCAL_NOT_FOUND',
  CORRECTION_QUEUED: 'fiscal.reasons.CORRECTION_QUEUED',
  NOT_REJECTED: 'fiscal.reasons.NOT_REJECTED',
  USE_CORRECTION: 'fiscal.reasons.USE_CORRECTION',
};

/** Why a bulk retry skipped a receipt. */
export function skipReasonText(reason: string): string {
  return t(REASONS[reason] ?? 'fiscal.reasons.FAILED');
}

/** "in 3 hours" / "3 hours ago", in the language of the screen. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(getLanguage() === 'ar' ? 'ar-EG-u-nu-latn' : 'en', {
    numeric: 'auto',
  });
  const abs = Math.abs(minutes);
  if (abs < 60) return rtf.format(minutes, 'minute');
  if (abs < 60 * 48) return rtf.format(Math.round(minutes / 60), 'hour');
  return rtf.format(Math.round(minutes / 1440), 'day');
}

export function isOverdue(state: FiscalDeadlineState): boolean {
  return state === 'overdue';
}

/** Where each kind of fix is made. */
export function fixLink(
  fix: FiscalFix,
  problem: Pick<FiscalProblem, 'customer_id' | 'products'>,
  saleId: string,
): string | null {
  switch (fix) {
    case 'product':
      return '/inventory/products';
    case 'customer':
      return problem.customer_id ? `/customers/${problem.customer_id}` : '/customers';
    case 'branch':
      return '/settings/branches';
    case 'eta_settings':
      return '/settings/eta';
    case 'shop_profile':
      return '/settings/profile';
    case 'device':
      return '/settings/devices';
    case 'assign_device':
    case 'support':
      return fix === 'support' ? `/sales/${saleId}` : null;
  }
}

export const FIELD_KEY = {
  rin: 'fiscal.field.rin',
  activity_code: 'fiscal.field.activity_code',
  branch_code: 'fiscal.field.branch_code',
  governorate: 'fiscal.field.governorate',
  city: 'fiscal.field.city',
  street: 'fiscal.field.street',
  building_number: 'fiscal.field.building_number',
} as const satisfies Record<string, TranslationKey>;
