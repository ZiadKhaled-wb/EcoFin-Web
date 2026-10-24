import { ApiError } from '@/lib/api';
import { padDecimals } from '@/lib/number';
import { shopToday } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';

/** L01 + N09 (D92): how the legal screens word a failed call, and the hearing date rule. */

const ERRORS: Partial<Record<string, TranslationKey>> = {
  LEGAL_CASE_NOT_FOUND: 'legal.errors.LEGAL_CASE_NOT_FOUND',
  HEARING_NOT_FOUND: 'legal.errors.HEARING_NOT_FOUND',
  LEGAL_CASE_ALREADY_OPEN: 'legal.errors.LEGAL_CASE_ALREADY_OPEN',
  LEGAL_CASE_CLOSED: 'legal.errors.LEGAL_CASE_CLOSED',
  LEGAL_CASE_FILED: 'legal.errors.LEGAL_CASE_FILED',
  LEGAL_STATUS_INVALID: 'legal.errors.LEGAL_STATUS_INVALID',
  LEGAL_CONTRACT_NOT_DEFAULTED: 'legal.errors.LEGAL_CONTRACT_NOT_DEFAULTED',
  LEGAL_CLAIM_TOO_HIGH: 'legal.errors.LEGAL_CLAIM_TOO_HIGH',
  LAWYER_INVALID: 'legal.errors.LAWYER_INVALID',
  CONTRACT_NOT_FOUND: 'legal.errors.CONTRACT_NOT_FOUND',
  MODULE_NOT_IN_PLAN: 'legal.errors.MODULE_NOT_IN_PLAN',
  PERMISSION_DENIED: 'legal.errors.PERMISSION_DENIED',
  IDEMPOTENCY_CONFLICT: 'legal.errors.IDEMPOTENCY_CONFLICT',
  VALIDATION_FAILED: 'legal.errors.VALIDATION_FAILED',
  SUBSCRIPTION_EXPIRED: 'legal.errors.SUBSCRIPTION_EXPIRED',
};

/** A sentence for a failed legal call; the server's raw text is never shown. */
export function legalError(err: unknown): string {
  if (err instanceof ApiError && err.code) {
    const key = ERRORS[err.code];
    if (key) return t(key);
  }
  return t('legal.errors.failed');
}

/** The id of the case that already holds the contract (LEGAL_CASE_ALREADY_OPEN details), or null. */
export function openCaseIdOf(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== 'LEGAL_CASE_ALREADY_OPEN') return null;
  const details = err.details as { legal_case_id?: unknown } | undefined;
  return typeof details?.legal_case_id === 'string' ? details.legal_case_id : null;
}

/** A hearing date within the next 7 days (counting today, in the shop's time zone): the list highlights it. */
export function hearingIsSoon(date: string | null, today: string = shopToday()): boolean {
  if (!date) return false;
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return days >= 0 && days <= 7;
}

/** A claim as typed ("10500", "10500.5") as a money string with two decimals, or null while it is not a valid amount. */
export function claimOf(text: string): string | null {
  const v = text.trim();
  return /^\d{1,16}(\.\d{0,2})?$/.test(v) ? padDecimals(v, 2) : null;
}
