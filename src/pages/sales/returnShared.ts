import {
  compareMoney,
  type RefundLineInput,
  type SaleReturnable,
  type SalesReturnQuote,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

export type RefundMethod = RefundLineInput['method'];
export type RefundDraft = {
  method: RefundMethod;
  amount: string;
  cash_account_id: string;
  reference: string;
};

/** The server's code as a message of the return pages (their own codes, then a fallback). */
export function returnErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : '';
  const key = `returns.errors.${code}` as TranslationKey;
  return code && t(key) !== key ? t(key) : t('returns.errors.fallback');
}

/** The refund lines as the contract takes them (blank or zero lines left out). */
export function refundBody(drafts: readonly RefundDraft[]): RefundLineInput[] {
  return drafts
    .filter((d) => d.amount !== '' && compareMoney(d.amount, '0.00') > 0)
    .map((d) =>
      d.method === 'bank_transfer'
        ? {
            method: d.method,
            amount: d.amount,
            cash_account_id: d.cash_account_id,
            reference: d.reference.trim(),
          }
        : { method: d.method, amount: d.amount },
    );
}

/**
 * The refund lines a form starts with: one line of what goes back, in cash when the sale took
 * enough cash (or on an installment sale), else store credit for a customer's sale, else cash.
 */
export function defaultRefunds(
  quote: SalesReturnQuote | undefined,
  contractSale: boolean,
  hasCustomer: boolean,
): RefundDraft[] {
  if (!quote || compareMoney(quote.refund_due, '0.00') === 0) return [];
  const cashOk =
    contractSale || compareMoney(quote.refundable?.cash ?? '0.00', quote.refund_due) >= 0;
  const method: RefundMethod = cashOk || !hasCustomer ? 'cash' : 'store_credit';
  return [{ method, amount: quote.refund_due, cash_account_id: '', reference: '' }];
}

/** The quantity typed for a line, or 1 for the unit of the warranty claim the form opened for. */
export function lineQuantity(
  line: SaleReturnable['lines'][number],
  typed: Record<string, string>,
  claimId: string | null,
): string {
  const value = typed[line.sale_line_id];
  if (value !== undefined) return value;
  return claimId && line.warranty_claim_id === claimId ? '1' : '';
}
