import {
  Sale,
  SalePaymentAccountList,
  SaleQuote,
  type SaleCreateInput,
  type SaleQuoteBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const saleKeys = {
  all: (orgId: string | null) => ['sales', orgId] as const,
  /** `cart` is the cart as text: a changed cart is a new quote. */
  quote: (orgId: string | null, cart: string) => ['sales', orgId, 'quote', cart] as const,
  one: (orgId: string | null, id: string) => ['sales', orgId, 'one', id] as const,
  accounts: (orgId: string | null) => ['sales', orgId, 'payment-accounts'] as const,
};

/** S01 sale core (D62) and S02 payments (D64): the server prices the cart and sells it in the open shift. */
export const salesApi = {
  /** Prices a cart for the caller's open shift; nothing is written. */
  quote: async (body: SaleQuoteBody) =>
    SaleQuote.parse((await api.post('/api/sales/quote', body)).data),
  /** `key` belongs to the cart: the same cart sent twice is one sale. */
  create: async (body: SaleCreateInput, key: string) =>
    Sale.parse((await api.post('/api/sales', body, { headers: { 'Idempotency-Key': key } })).data),
  /** S02: the banks a transfer can go into (names only); empty without an open shift. */
  paymentAccounts: async () =>
    SalePaymentAccountList.parse((await api.get('/api/sales/payment-accounts')).data),
  get: async (id: string) => Sale.parse((await api.get(`/api/sales/${id}`)).data),
};
