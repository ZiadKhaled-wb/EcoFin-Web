import {
  PurchaseApprovalList,
  PurchaseInvoice,
  type PurchaseApprovalStatus,
  PurchaseInvoiceList,
  type PurchaseInvoiceCreateBody,
  type PurchaseInvoiceStatus,
  type PurchaseInvoiceUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the invoices page asks for (only the caller's branches come back). */
export interface PurchaseInvoiceListParams {
  supplier_id?: string;
  branch_id?: string;
  status?: PurchaseInvoiceStatus;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** U06: the approval list filters (the caller's branches only). */
export interface PurchaseApprovalListParams {
  status?: PurchaseApprovalStatus;
  branch_id?: string;
  page?: number;
  pageSize?: number;
}

export const purchaseInvoiceKeys = {
  all: (orgId: string | null) => ['purchase-invoices', orgId] as const,
  list: (orgId: string | null, params: PurchaseInvoiceListParams) =>
    ['purchase-invoices', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['purchase-invoices', orgId, 'one', id] as const,
  approvals: (orgId: string | null, params: PurchaseApprovalListParams) =>
    ['purchase-invoices', orgId, 'approvals', params] as const,
};

/** U02 purchase invoices (D54): drafts, approval (stock in once), rejection. */
export const purchaseInvoicesApi = {
  list: async (params: PurchaseInvoiceListParams = {}) =>
    PurchaseInvoiceList.parse((await api.get('/api/purchase-invoices', { params })).data),
  get: async (id: string) =>
    PurchaseInvoice.parse((await api.get(`/api/purchase-invoices/${id}`)).data),
  /** `key` is made once per form: a second click posts the same invoice, not a new one. */
  create: async (body: PurchaseInvoiceCreateBody, key: string) =>
    PurchaseInvoice.parse(
      (await api.post('/api/purchase-invoices', body, { headers: { 'Idempotency-Key': key } }))
        .data,
    ),
  update: async (id: string, body: PurchaseInvoiceUpdateBody) =>
    PurchaseInvoice.parse((await api.put(`/api/purchase-invoices/${id}`, body)).data),
  /**
   * A repeat answers the approved invoice and posts nothing again. U06: above the threshold a
   * non-owner's approve answers `pending_approval`; the owner decides a pending one with a note.
   */
  approve: async (id: string, note?: string) =>
    PurchaseInvoice.parse(
      (await api.post(`/api/purchase-invoices/${id}/approve`, note ? { note } : {})).data,
    ),
  reject: async (id: string, reason: string) =>
    PurchaseInvoice.parse((await api.post(`/api/purchase-invoices/${id}/reject`, { reason })).data),
  /** U06: invoices waiting for the owner (and decided ones), purchase.invoice_approve. */
  approvals: async (params: PurchaseApprovalListParams = {}) =>
    PurchaseApprovalList.parse((await api.get('/api/purchase-approvals', { params })).data),
};
