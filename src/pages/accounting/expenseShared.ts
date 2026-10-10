import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  EXPENSE_CATEGORY_NOT_FOUND: 'cash.expenses.errors.categoryNotFound',
  EXPENSE_CATEGORY_NAME_TAKEN: 'cash.expenses.errors.nameTaken',
  EXPENSE_CATEGORY_ARCHIVED: 'cash.expenses.errors.categoryArchived',
  EXPENSE_NOT_FOUND: 'cash.expenses.errors.notFound',
  EXPENSE_ALREADY_REVERSED: 'cash.expenses.errors.alreadyReversed',
  APPROVAL_OWNER_ONLY: 'cash.expenses.errors.ownerOnly',
  SHIFT_REQUIRED: 'cash.expenses.errors.shiftRequired',
  SHIFT_CLOSED: 'cash.expenses.errors.shiftClosed',
  VAULT_INVALID: 'cash.expenses.errors.vaultInvalid',
  CASH_ACCOUNT_INACTIVE: 'cash.expenses.errors.accountInactive',
  INSUFFICIENT_FUNDS: 'cash.expenses.errors.insufficientFunds',
  DAY_CLOSED: 'cash.expenses.errors.dayClosed',
  BRANCH_DENIED: 'cash.expenses.errors.branchDenied',
  PERMISSION_DENIED: 'cash.expenses.errors.permission',
  VALIDATION_FAILED: 'cash.expenses.errors.validation',
};

/** A translated message for a refused expense call. */
export function expenseError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  return t(ERRORS[code] ?? 'cash.expenses.errors.failed');
}

/** The first and last day (YYYY-MM-DD) of the month of `today`. */
export function monthRange(today = new Date()): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = today.getFullYear();
  const m = today.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}
