import { AuthMeResponse, MePermissionsResponse } from '@ecotech/contracts';
import { api, ApiError } from '@/lib/api';

/** A reply that does not match the contract is an error, never trusted data. */
function parseReply<T>(
  schema: { safeParse: (d: unknown) => { success: true; data: T } | { success: false } },
  data: unknown,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(500, 'UNKNOWN', 'Reply does not match the contract');
  return parsed.data;
}

export const meApi = {
  /** GET /api/auth/me: the employee, the shop and the branches they may work in. */
  me: () => api.get<unknown>('/api/auth/me').then((r) => parseReply(AuthMeResponse, r.data)),

  /** GET /api/me/permissions (F06 server half): permission keys and branch access. */
  permissions: () =>
    api.get<unknown>('/api/me/permissions').then((r) => parseReply(MePermissionsResponse, r.data)),
};
