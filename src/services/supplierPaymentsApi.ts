import {
  OpenSupplierInvoiceList,
  SupplierPayment,
  SupplierPaymentList,
  type SupplierPaymentCreateInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the payments page asks for (only the caller's branches come back). */
export interface SupplierPaymentListParams {
  supplier_id?: string;
  branch_id?: string;
  from?: string;
  to?: string;
  include_reversals?: boolean;
  page?: number;
  pageSize?: number;
}

export const supplierPaymentKeys = {
  all: (orgId: string | null) => ['supplier-payments', orgId] as const,
  list: (orgId: string | null, params: SupplierPaymentListParams) =>
    ['supplier-payments', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['supplier-payments', orgId, 'one', id] as const,
  open: (orgId: string | null, supplierId: string) =>
    ['supplier-payments', orgId, 'open', supplierId] as const,
};

/** U03 supplier payments (D58): pay from a safe or bank, allocated to approved invoices. */
export const supplierPaymentsApi = {
  list: async (params: SupplierPaymentListParams = {}) =>
    SupplierPaymentList.parse((await api.get('/api/supplier-payments', { params })).data),
  get: async (id: string) =>
    SupplierPayment.parse((await api.get(`/api/supplier-payments/${id}`)).data),
  /** What a supplier is still owed, invoice by invoice (supplier.payment_create). */
  openInvoices: async (supplierId: string) =>
    OpenSupplierInvoiceList.parse(
      (
        await api.get('/api/supplier-payments/open-invoices', {
          params: { supplier_id: supplierId },
        })
      ).data,
    ),
  /** `key` is made once per form: a second click pays the same payment, not a new one. */
  create: async (body: SupplierPaymentCreateInput, key: string) =>
    SupplierPayment.parse(
      (await api.post('/api/supplier-payments', body, { headers: { 'Idempotency-Key': key } }))
        .data,
    ),
  /** Owner only. `key` is made once per dialog. */
  reverse: async (id: string, reason: string, key: string) =>
    SupplierPayment.parse(
      (
        await api.post(
          `/api/supplier-payments/${id}/reverse`,
          { reason },
          { headers: { 'Idempotency-Key': key } },
        )
      ).data,
    ),
};
