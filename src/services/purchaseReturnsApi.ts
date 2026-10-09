import {
  PayableCashAccountList,
  PurchaseReturn,
  PurchaseReturnList,
  ReturnableInvoice,
  type PurchaseReturnCreateInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the returns page asks for (only the caller's branches come back). */
export interface PurchaseReturnListParams {
  supplier_id?: string;
  branch_id?: string;
  purchase_invoice_id?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const purchaseReturnKeys = {
  all: (orgId: string | null) => ['purchase-returns', orgId] as const,
  list: (orgId: string | null, params: PurchaseReturnListParams) =>
    ['purchase-returns', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['purchase-returns', orgId, 'one', id] as const,
  returnable: (orgId: string | null, invoiceId: string) =>
    ['purchase-returns', orgId, 'returnable', invoiceId] as const,
  prior: (orgId: string | null, invoiceId: string) =>
    ['purchase-returns', orgId, 'prior', invoiceId] as const,
  cashAccounts: (orgId: string | null, branchId: string) =>
    ['purchase-returns', orgId, 'cash-accounts', branchId] as const,
};

/** U04 purchase returns (D57): goods back to a supplier against an approved invoice. */
export const purchaseReturnsApi = {
  list: async (params: PurchaseReturnListParams = {}) =>
    PurchaseReturnList.parse((await api.get('/api/purchase-returns', { params })).data),
  get: async (id: string) =>
    PurchaseReturn.parse((await api.get(`/api/purchase-returns/${id}`)).data),
  /** `key` is made once per form: a second click posts the same return, not a new one. */
  create: async (body: PurchaseReturnCreateInput, key: string) =>
    PurchaseReturn.parse(
      (await api.post('/api/purchase-returns', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  /** What can still go back from an invoice, line by line (purchase.return_create). */
  returnable: async (invoiceId: string) =>
    ReturnableInvoice.parse((await api.get(`/api/purchase-invoices/${invoiceId}/returnable`)).data),
  /** The active safes and banks a refund can go into for a branch. */
  cashAccounts: async (branchId: string) =>
    PayableCashAccountList.parse(
      (await api.get('/api/purchasing/cash-accounts', { params: { branch_id: branchId } })).data,
    ),
  /** Every earlier return of an invoice with its lines (the live tax needs what went back). */
  prior: async (invoiceId: string) => {
    const list = await purchaseReturnsApi.list({ purchase_invoice_id: invoiceId, pageSize: 100 });
    return Promise.all(list.items.map((r) => purchaseReturnsApi.get(r.id)));
  },
};
