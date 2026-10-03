import {
  AuthForgotPasswordBody,
  AuthLoginBody,
  AuthLoginResponse,
  AuthSelectShopResponse,
  type AuthChangePasswordBody,
  type AuthChangePasswordResponse,
  type AuthForgotPasswordResponse,
  type AuthLogoutResponse,
  type AuthResetPasswordBody,
  type AuthResetPasswordResponse,
  type AuthSelectShopBody,
} from '@ecotech/contracts';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/** What a form hands us before it becomes a contract body. */
export interface IdentifierInput {
  identifier: string;
  tenantSlug?: string;
}

/** Usernames are lowercase in the baseline; emails are left as typed. */
export const normalizeIdentifier = (raw: string) => {
  const v = raw.trim();
  return v.includes('@') ? v : v.toLowerCase();
};

/** The shop is only sent with a username; an email identifies the login on its own. */
function toIdentifierBody({ identifier, tenantSlug }: IdentifierInput) {
  const id = normalizeIdentifier(identifier);
  const slug = tenantSlug?.trim().toLowerCase();
  return id.includes('@') || !slug ? { identifier: id } : { identifier: id, tenantSlug: slug };
}

/** Builds and validates a login body with the contract schema. */
export const buildLoginBody = (input: IdentifierInput & { password: string }) =>
  AuthLoginBody.safeParse({
    ...toIdentifierBody(input),
    password: input.password, // never trimmed
  });

export const buildForgotBody = (input: IdentifierInput) =>
  AuthForgotPasswordBody.safeParse(toIdentifierBody(input));

/** A reply that does not match the contract is a generic error, never trusted data. */
function parseReply<T>(
  schema: { safeParse: (d: unknown) => { success: true; data: T } | { success: false } },
  data: unknown,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(500, 'UNKNOWN', 'Reply does not match the contract');
  return parsed.data;
}

export const authApi = {
  login: (body: AuthLoginBody) =>
    api
      .post<unknown>('/api/auth/login', body, { skipAuth: true })
      .then((r) => parseReply(AuthLoginResponse, r.data)),

  /** Needs the Bearer token from login, but no x-org-id yet. */
  selectShop: (orgId: string) => {
    const body: AuthSelectShopBody = { orgId };
    return api
      .post<unknown>('/api/auth/select-shop', body)
      .then((r) => parseReply(AuthSelectShopResponse, r.data));
  },

  forgotPassword: (body: AuthForgotPasswordBody) =>
    api
      .post<AuthForgotPasswordResponse>('/api/auth/forgot-password', body, { skipAuth: true })
      .then((r) => r.data),

  resetPassword: (body: AuthResetPasswordBody) =>
    api
      .post<AuthResetPasswordResponse>('/api/auth/reset-password', body, { skipAuth: true })
      .then((r) => r.data),

  changePassword: (body: AuthChangePasswordBody) =>
    api.post<AuthChangePasswordResponse>('/api/auth/change-password', body).then((r) => r.data),

  /** Revokes the session on the server, then always clears the store and the query cache. */
  async logout() {
    try {
      await api.post<AuthLogoutResponse>('/api/auth/logout');
    } catch {
      /* ignore: we clear locally regardless */
    } finally {
      useAuthStore.getState().clearSession();
    }
  },
};
