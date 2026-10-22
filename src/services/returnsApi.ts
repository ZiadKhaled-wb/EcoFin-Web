import {
  SaleReturnable,
  SalesReturn,
  SalesReturnListResponse,
  SalesReturnQuote,
  SalesReturnReceiptPrint,
  type SalesReturnCreateInput,
  type SalesReturnKind,
  type SalesReturnQuoteBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the returns list asks for (only the caller's branches come back). */
export interface ReturnListParams {
  from?: string;
  to?: string;
  branch_id?: string;
  sale_id?: string;
  customer_id?: string;
  kind?: SalesReturnKind;
  page?: number;
  page_size?: number;
}

export const returnKeys = {
  all: (orgId: string | null) => ['returns', orgId] as const,
  list: (orgId: string | null, params: ReturnListParams) =>
    ['returns', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['returns', orgId, 'one', id] as const,
  returnable: (orgId: string | null, saleId: string) =>
    ['returns', orgId, 'returnable', saleId] as const,
  /** `body` is the form as text: a changed form is a new quote. */
  quote: (orgId: string | null, body: string) => ['returns', orgId, 'quote', body] as const,
};

/** S05 returns and exchanges (D88): every amount comes from the server. */
export const returnsApi = {
  returnable: async (saleId: string) =>
    SaleReturnable.parse((await api.get(`/api/sales/${saleId}/returnable`)).data),
  quote: async (body: SalesReturnQuoteBody) =>
    SalesReturnQuote.parse((await api.post('/api/returns/quote', body)).data),
  /** `key` is made once per form: a second click posts the same return, not a new one. */
  create: async (body: SalesReturnCreateInput, key: string) =>
    SalesReturn.parse(
      (await api.post('/api/returns', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  list: async (params: ReturnListParams = {}) =>
    SalesReturnListResponse.parse((await api.get('/api/returns', { params })).data),
  get: async (id: string) => SalesReturn.parse((await api.get(`/api/returns/${id}`)).data),
  /** S04 (D68): logs one print of the return receipt; 1 = the original. */
  recordReceiptPrint: async (id: string) =>
    SalesReturnReceiptPrint.parse((await api.post(`/api/returns/${id}/receipt-prints`)).data),
};
