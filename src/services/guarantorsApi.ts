import {
  CustomerGuarantorList,
  FileListResponse,
  FileResponse,
  FileUrlResponse,
  Guarantor,
  GuarantorDetails,
  GuarantorList,
  type CustomerGuarantorLinkBody,
  type CustomerGuarantorRelationBody,
  type GuarantorCreateBody,
  type GuarantorStatusFilter,
  type GuarantorUpdateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the "existing guarantor" search asks for. */
export interface GuarantorListParams {
  search?: string;
  status?: GuarantorStatusFilter;
  page?: number;
  pageSize?: number;
}

export const guarantorKeys = {
  all: (orgId: string | null) => ['guarantors', orgId] as const,
  list: (orgId: string | null, params: GuarantorListParams) =>
    ['guarantors', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['guarantors', orgId, 'one', id] as const,
  photos: (orgId: string | null, id: string) => ['guarantors', orgId, 'photos', id] as const,
  /** A customer's guarantors live under the customer, so one invalidation covers the page. */
  ofCustomer: (orgId: string | null, customerId: string) =>
    ['customers', orgId, 'guarantors', customerId] as const,
};

/**
 * R04 guarantors (D71). The server masks the national ID for anyone without customer.view_pii:
 * `national_id` is then null and `national_id_masked` holds the last four digits.
 */
export const guarantorsApi = {
  list: async (params: GuarantorListParams = {}) =>
    GuarantorList.parse((await api.get('/api/guarantors', { params })).data),
  get: async (id: string) => GuarantorDetails.parse((await api.get(`/api/guarantors/${id}`)).data),
  /** With `link` the guarantor is created and linked in one call. A national ID another guarantor
   * has: GUARANTOR_NATIONAL_ID_TAKEN with that guarantor in details. */
  create: async (body: GuarantorCreateBody) =>
    Guarantor.parse((await api.post('/api/guarantors', body)).data),
  update: async (id: string, body: GuarantorUpdateBody) =>
    Guarantor.parse((await api.patch(`/api/guarantors/${id}`, body)).data),
  archive: async (id: string) =>
    Guarantor.parse((await api.post(`/api/guarantors/${id}/archive`)).data),
  restore: async (id: string) =>
    Guarantor.parse((await api.post(`/api/guarantors/${id}/restore`)).data),

  ofCustomer: async (customerId: string) =>
    CustomerGuarantorList.parse((await api.get(`/api/customers/${customerId}/guarantors`)).data),
  link: async (customerId: string, body: CustomerGuarantorLinkBody) =>
    CustomerGuarantorList.parse(
      (await api.post(`/api/customers/${customerId}/guarantors`, body)).data,
    ),
  setRelation: async (
    customerId: string,
    guarantorId: string,
    body: CustomerGuarantorRelationBody,
  ) =>
    CustomerGuarantorList.parse(
      (await api.patch(`/api/customers/${customerId}/guarantors/${guarantorId}`, body)).data,
    ),
  unlink: async (customerId: string, guarantorId: string) =>
    CustomerGuarantorList.parse(
      (await api.post(`/api/customers/${customerId}/guarantors/${guarantorId}/unlink`)).data,
    ),

  /** The guarantor's ID card photos (F14). Empty for a user without customer.view_pii. */
  photos: async (id: string) =>
    FileListResponse.parse(
      (await api.get('/api/files', { params: { entityType: 'guarantor', entityId: id } })).data,
    ).items.filter((f) => f.purpose === 'customer_id'),
  /** F14 upload with purpose "customer_id", linked to the guarantor (needs customer.create). */
  uploadPhoto: async (id: string, file: File) => {
    const form = new FormData();
    form.append('purpose', 'customer_id');
    form.append('entityType', 'guarantor');
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
