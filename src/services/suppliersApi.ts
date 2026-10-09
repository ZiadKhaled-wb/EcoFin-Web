import {
  Supplier,
  SupplierList,
  SupplierStatement,
  type SupplierCreateBody,
  type SupplierStatus,
  type SupplierUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the suppliers page asks for. */
export interface SupplierListParams {
  search?: string;
  status?: SupplierStatus;
  page?: number;
  pageSize?: number;
}

/** Statement dates (business dates, YYYY-MM-DD); left out = from the first document / until today. */
export interface SupplierStatementParams {
  from?: string;
  to?: string;
}

export const supplierKeys = {
  all: (orgId: string | null) => ['suppliers', orgId] as const,
  list: (orgId: string | null, params: SupplierListParams) =>
    ['suppliers', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['suppliers', orgId, 'one', id] as const,
  statement: (orgId: string | null, id: string, params: SupplierStatementParams) =>
    ['suppliers', orgId, 'statement', id, params] as const,
};

/** U01 suppliers (D53): anyone working with purchases reads; changes need supplier.manage. */
export const suppliersApi = {
  list: async (params: SupplierListParams = {}) =>
    SupplierList.parse((await api.get('/api/suppliers', { params })).data),
  get: async (id: string) => Supplier.parse((await api.get(`/api/suppliers/${id}`)).data),
  /** Shop-wide statement with the running balance. */
  statement: async (id: string, params: SupplierStatementParams = {}) =>
    SupplierStatement.parse((await api.get(`/api/suppliers/${id}/statement`, { params })).data),
  create: async (body: SupplierCreateBody) =>
    Supplier.parse((await api.post('/api/suppliers', body)).data),
  update: async (id: string, body: SupplierUpdateBody) =>
    Supplier.parse((await api.patch(`/api/suppliers/${id}`, body)).data),
  /** Refused with a balance or open documents (SUPPLIER_HAS_BALANCE / _OPEN_DOCUMENTS). */
  archive: async (id: string) =>
    Supplier.parse((await api.post(`/api/suppliers/${id}/archive`)).data),
  restore: async (id: string) =>
    Supplier.parse((await api.post(`/api/suppliers/${id}/restore`)).data),
};
