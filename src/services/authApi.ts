import {
  AuthForgotPasswordBody,
  AuthLoginBody,
  type AuthChangePasswordBody,
  type AuthLoginResponse,
  type AuthResetPasswordBody,
  type AuthSelectShopResponse,
} from '@ecotech/contracts';
import { api } from '@/lib/api';
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

export const authApi = {
  login: (body: AuthLoginBody) =>
    api.post<AuthLoginResponse>('/api/auth/login', body, { skipAuth: true }).then((r) => r.data),

  /** Needs the Bearer token from login, but no x-org-id yet. */
  selectShop: (orgId: string) =>
    api.post<AuthSelectShopResponse>('/api/auth/select-shop', { orgId }).then((r) => r.data),

  forgotPassword: (body: AuthForgotPasswordBody) =>
    api.post('/api/auth/forgot-password', body, { skipAuth: true }).then((r) => r.data),

  resetPassword: (body: AuthResetPasswordBody) =>
    api.post('/api/auth/reset-password', body, { skipAuth: true }).then((r) => r.data),

  changePassword: (body: AuthChangePasswordBody) =>
    api.post('/api/auth/change-password', body).then((r) => r.data),

  /** Revokes the session on the server, then always clears the store and the query cache. */
  async logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore: we clear locally regardless */
    } finally {
      useAuthStore.getState().clearSession();
    }
  },
};
