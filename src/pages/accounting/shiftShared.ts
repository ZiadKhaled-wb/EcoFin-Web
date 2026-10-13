import { ShiftDifferenceDetail, type ShiftMovement } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  SHIFT_NOT_FOUND: 'cash.shifts.errors.notFound',
  SHIFT_ALREADY_OPEN: 'cash.shifts.errors.alreadyOpen',
  SHIFT_CLOSED: 'cash.shifts.errors.closed',
  DEVICE_INVALID: 'cash.shifts.errors.deviceInvalid',
  // O03: a shift is opened on the paired POS device of this computer.
  DEVICE_REQUIRED: 'devices.errors.DEVICE_REQUIRED',
  DEVICE_BRANCH_MISMATCH: 'devices.errors.DEVICE_BRANCH_MISMATCH',
  DEVICE_MISMATCH: 'devices.errors.DEVICE_MISMATCH',
  DEVICE_REVOKED: 'devices.revoked',
  VAULT_INVALID: 'cash.shifts.errors.vaultInvalid',
  CASH_ACCOUNT_INACTIVE: 'cash.shifts.errors.accountInactive',
  INSUFFICIENT_FUNDS: 'cash.shifts.errors.insufficientFunds',
  DAY_CLOSED: 'cash.shifts.errors.dayClosed',
  BRANCH_DENIED: 'cash.shifts.errors.branchDenied',
  PERMISSION_DENIED: 'cash.shifts.errors.permission',
  VALIDATION_FAILED: 'cash.shifts.errors.validation',
};

/** A translated message for a refused shift call. */
export function shiftError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'SHIFT_DIFFERENCE_REASON_REQUIRED') {
    const detail = ShiftDifferenceDetail.safeParse((err as ApiError).details);
    return t('cash.shifts.errors.differenceReason', {
      expected: formatMoney(detail.success ? detail.data.expected : '0.00'),
      counted: formatMoney(detail.success ? detail.data.counted : '0.00'),
    });
  }
  return t(ERRORS[code] ?? 'cash.shifts.errors.failed');
}

const MOVEMENT_LABELS: Partial<Record<string, TranslationKey>> = {
  float_in: 'cash.shifts.movement.float_in',
  float_out: 'cash.shifts.movement.float_out',
  sale: 'cash.shifts.movement.sale',
  refund: 'cash.shifts.movement.refund',
  collection: 'cash.shifts.movement.collection',
  expense: 'cash.shifts.movement.expense',
  adjustment: 'cash.shifts.movement.adjustment',
};
/** What a drawer movement is, in words. */
export const movementLabel = (m: Pick<ShiftMovement, 'type'>) =>
  t(MOVEMENT_LABELS[m.type] ?? 'cash.shifts.movement.other');

/** counted − expected as money ("-10.00"); both have two decimals. */
export function moneyDifference(counted: string, expected: string): string {
  const cents = Math.round(Number(counted) * 100) - Math.round(Number(expected) * 100);
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
