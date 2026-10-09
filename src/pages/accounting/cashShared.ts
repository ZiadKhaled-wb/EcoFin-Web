import type { CashAccount } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

/** Server refusals of the vault writes, translated (D56). */
const CASH_ERRORS: Partial<Record<string, TranslationKey>> = {
  CASH_ACCOUNT_NOT_FOUND: 'cash.errors.notFound',
  CASH_ACCOUNT_NAME_TAKEN: 'cash.errors.nameTaken',
  CASH_ACCOUNT_HAS_BALANCE: 'cash.errors.hasBalance',
  CASH_ACCOUNT_IS_DEFAULT: 'cash.errors.isDefault',
  CASH_ACCOUNT_INACTIVE: 'cash.errors.inactive',
  CASH_ACCOUNT_HAS_MOVEMENTS: 'cash.errors.hasMovements',
  TRANSFER_SAME_ACCOUNT: 'cash.errors.sameAccount',
  INSUFFICIENT_FUNDS: 'cash.errors.insufficientFunds',
  DAY_CLOSED: 'cash.errors.dayClosed',
  BRANCH_DENIED: 'cash.errors.branchDenied',
  BRANCH_INACTIVE: 'cash.errors.branchDenied',
  BRANCH_NOT_FOUND: 'cash.errors.branchNotFound',
  PERMISSION_DENIED: 'cash.errors.permission',
  SUBSCRIPTION_EXPIRED: 'cash.errors.expired',
  VALIDATION_FAILED: 'cash.errors.validation',
};

export const cashError = (e: unknown) =>
  t(CASH_ERRORS[e instanceof ApiError ? e.code : ''] ?? 'cash.errors.failed');

/** "Main safe — Main" or "NBE — Shop-wide", for pickers. */
export const accountLabel = (a: CashAccount) =>
  `${a.name} — ${a.branch_name ?? t('cash.shopWide')}`;

/** True for "0", "0.00", "-0.00". */
export const isZero = (money: string) => !/[1-9]/.test(money);
