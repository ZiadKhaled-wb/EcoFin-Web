import {
  PurchaseInvoice,
  PurchaseOrder,
  PurchaseOrderList,
  type PurchaseOrderCreateInput,
  type PurchaseOrderInvoiceBody,
  type PurchaseOrderStatus,
  type PurchaseOrderUpdateInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the orders page asks for (only the caller's branches come back). */
export interface PurchaseOrderListParams {
  supplier_id?: string;
  branch_id?: string;
  status?: PurchaseOrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const purchaseOrderKeys = {
  all: (orgId: string | null) => ['purchase-orders', orgId] as const,
  list: (orgId: string | null, params: PurchaseOrderListParams) =>
    ['purchase-orders', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['purchase-orders', orgId, 'one', id] as const,
};

/** U05 purchase orders (D59): order, send, receive as draft invoices, cancel. */
export const purchaseOrdersApi = {
  list: async (params: PurchaseOrderListParams = {}) =>
    PurchaseOrderList.parse((await api.get('/api/purchase-orders', { params })).data),
  get: async (id: string) =>
    PurchaseOrder.parse((await api.get(`/api/purchase-orders/${id}`)).data),
  /** `key` is made once per form: a second click saves the same order, not a new one. */
  create: async (body: PurchaseOrderCreateInput, key: string) =>
    PurchaseOrder.parse(
      (await api.post('/api/purchase-orders', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  update: async (id: string, body: PurchaseOrderUpdateInput) =>
    PurchaseOrder.parse((await api.put(`/api/purchase-orders/${id}`, body)).data),
  send: async (id: string) =>
    PurchaseOrder.parse((await api.post(`/api/purchase-orders/${id}/send`, {})).data),
  cancel: async (id: string, reason: string) =>
    PurchaseOrder.parse((await api.post(`/api/purchase-orders/${id}/cancel`, { reason })).data),
  /** "Receive": a draft purchase invoice from the order. `key` is made once per dialog. */
  invoice: async (id: string, body: PurchaseOrderInvoiceBody, key: string) =>
    PurchaseInvoice.parse(
      (
        await api.post(`/api/purchase-orders/${id}/invoice`, body, {
          headers: { 'Idempotency-Key': key },
        })
      ).data,
    ),
};
