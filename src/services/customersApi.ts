import {
  Customer,
  CustomerList,
  FileListResponse,
  FileResponse,
  FileUrlResponse,
  type CustomerCreateBody,
  type CustomerStatusBody,
  type CustomerStatusFilter,
  type CustomerUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the customers page asks for. */
export interface CustomerListParams {
  search?: string;
  status?: CustomerStatusFilter;
  page?: number;
  pageSize?: number;
}

export const customerKeys = {
  all: (orgId: string | null) => ['customers', orgId] as const,
  list: (orgId: string | null, params: CustomerListParams) =>
    ['customers', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['customers', orgId, 'one', id] as const,
  photos: (orgId: string | null, id: string) => ['customers', orgId, 'photos', id] as const,
};

/**
 * R01 customers (D62). The server masks the national ID for anyone without customer.view_pii:
 * `national_id` is then null and `national_id_masked` holds the last four digits.
 */
export const customersApi = {
  list: async (params: CustomerListParams = {}) =>
    CustomerList.parse((await api.get('/api/customers', { params })).data),
  get: async (id: string) => Customer.parse((await api.get(`/api/customers/${id}`)).data),
  /** A national ID another customer has: CUSTOMER_NATIONAL_ID_TAKEN with that customer in details. */
  create: async (body: CustomerCreateBody) =>
    Customer.parse((await api.post('/api/customers', body)).data),
  update: async (id: string, body: CustomerUpdateBody) =>
    Customer.parse((await api.patch(`/api/customers/${id}`, body)).data),
  /** Block (with a reason) or unblock. */
  setStatus: async (id: string, body: CustomerStatusBody) =>
    Customer.parse((await api.post(`/api/customers/${id}/status`, body)).data),
  /** The customer's ID card photos (F14). Empty for a user without customer.view_pii. */
  photos: async (id: string) =>
    FileListResponse.parse(
      (await api.get('/api/files', { params: { entityType: 'customer', entityId: id } })).data,
    ).items.filter((f) => f.purpose === 'customer_id'),
  /** F14 upload with purpose "customer_id", linked to the customer (needs customer.edit). */
  uploadPhoto: async (id: string, file: File) => {
    const form = new FormData();
    form.append('purpose', 'customer_id');
    form.append('entityType', 'customer');
    form.append('entityId', id);
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
  /** Short-lived signed link to open a photo (needs customer.view_pii). */
  photoUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
