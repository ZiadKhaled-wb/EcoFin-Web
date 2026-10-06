import {
  AdminCreateShopResponse,
  AdminInviteResponse,
  AdminPlansResponse,
  AdminShopStatusResponse,
  AdminShopsResponse,
  InviteAcceptResponse,
  InviteLookupResponse,
  type AdminCreateShopBody,
  type AdminShopsQuery,
  type AdminShopStatusBody,
  type InviteAcceptBody,
} from '@ziadkhaled-wb/contracts';
import { api, ApiError } from '@/lib/api';
const parse = <T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
  data: unknown,
): T => {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError(500, 'UNKNOWN', 'Reply does not match the contract');
  return result.data;
};
export const adminApi = {
  plans: () => api.get<unknown>('/api/admin/plans').then((r) => parse(AdminPlansResponse, r.data)),
  shops: (query: AdminShopsQuery) =>
    api
      .get<unknown>('/api/admin/shops', { params: query })
      .then((r) => parse(AdminShopsResponse, r.data)),
  create: (body: AdminCreateShopBody) =>
    api.post<unknown>('/api/admin/shops', body).then((r) => parse(AdminCreateShopResponse, r.data)),
  status: (id: string, body: AdminShopStatusBody) =>
    api
      .post<unknown>(`/api/admin/shops/${id}/status`, body)
      .then((r) => parse(AdminShopStatusResponse, r.data)),
  resend: (id: string) =>
    api
      .post<unknown>(`/api/admin/shops/${id}/owner-invite`)
      .then((r) => parse(AdminInviteResponse, r.data)),
};
export const inviteApi = {
  lookup: (token: string) =>
    api
      .post<unknown>('/api/auth/invites/lookup', { token }, { skipAuth: true })
      .then((r) => parse(InviteLookupResponse, r.data)),
  accept: (body: InviteAcceptBody) =>
    api
      .post<unknown>('/api/auth/invites/accept', body, { skipAuth: true })
      .then((r) => parse(InviteAcceptResponse, r.data)),
};
