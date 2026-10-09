import { compareMoney } from '@ziadkhaled-wb/contracts';

/** Positive = the shop owes the supplier (decimal compare, never a float). */
export const owesSupplier = (balance: string) => compareMoney(balance, '0') > 0;
