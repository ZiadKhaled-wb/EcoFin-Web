import {
  ClaimRefundTarget,
  WarrantyClaim,
  WarrantyClaimOpened,
  WarrantyClaimsResponse,
  WarrantyLookupResponse,
  FileResponse,
  FileUrlResponse,
  type WarrantyLookupQuery,
  type WarrantyClaimsQuery,
  type OpenWarrantyClaimBody,
  type MoveWarrantyClaimBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const warrantyKeys = { all: (org: string | null) => ['warranty', org] as const };
export const warrantyApi = {
  lookup: async (params: WarrantyLookupQuery) =>
    WarrantyLookupResponse.parse((await api.get('/api/warranty/lookup', { params })).data),
  list: async (params: WarrantyClaimsQuery) =>
    WarrantyClaimsResponse.parse((await api.get('/api/warranty/claims', { params })).data),
  get: async (id: string) =>
    WarrantyClaim.parse((await api.get('/api/warranty/claims/' + id)).data),
  open: async (body: OpenWarrantyClaimBody, key: string) =>
    WarrantyClaimOpened.parse(
      (await api.post('/api/warranty/claims', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  move: async (id: string, body: MoveWarrantyClaimBody) =>
    WarrantyClaim.parse((await api.post('/api/warranty/claims/' + id + '/move', body)).data),
  /** S05 (D88): an open claim's refund is a return of its line; this says what to open. */
  refund: async (id: string) =>
    ClaimRefundTarget.parse((await api.post('/api/warranty/claims/' + id + '/refund')).data),
  uploadPhoto: async (id: string, file: File) => {
    const body = new FormData();
    body.append('purpose', 'other');
    body.append('entityType', 'warranty_claim');
    body.append('entityId', id);
    body.append('file', file);
    return FileResponse.parse(
      (await api.post('/api/files', body, { headers: { 'Content-Type': 'multipart/form-data' } }))
        .data,
    );
  },
  photoUrl: async (id: string) =>
    FileUrlResponse.parse((await api.get('/api/files/' + id + '/url')).data),
};
