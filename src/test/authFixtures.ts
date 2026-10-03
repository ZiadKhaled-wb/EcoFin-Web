import type {
  AuthLoginResponse,
  AuthSelectShopResponse,
  AuthSession,
  ShopMembership,
} from '@ecotech/contracts';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';
export const USER_ID = '33333333-3333-4333-8333-333333333333';

export const shopA: ShopMembership = {
  orgId: ORG_A,
  orgName: 'Shop A',
  tenantSlug: 'shop-a',
  role: 'OWNER',
};
export const shopB: ShopMembership = {
  orgId: ORG_B,
  orgName: 'Shop B',
  tenantSlug: 'shop-b',
  role: 'CASHIER',
};

export const session = (suffix = '1', expiresInMs = 3_600_000): AuthSession => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
});

export const loginResponse = (over: Partial<AuthLoginResponse> = {}): AuthLoginResponse => ({
  ...session(),
  user: { id: USER_ID, email: 'owner@example.com' },
  mustChangePassword: false,
  shops: [shopA],
  requiresShopSelection: false,
  ...over,
});

export const selectShopResponse = (shop = shopB): AuthSelectShopResponse => ({
  user: { id: USER_ID, email: 'owner@example.com' },
  shop,
});

/** An axios error shaped like a contract error reply. */
export function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  code: string,
  headers: Record<string, string> = {},
) {
  const response = {
    status,
    statusText: String(status),
    headers,
    config,
    data: { error: { code, message: 'raw server text' } },
  } as AxiosResponse;
  return new AxiosError('failed', String(status), config, undefined, response);
}

export function httpOk<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
  return { status: 200, statusText: 'OK', headers: {}, config, data };
}

/** A refresh call the server answered with a status (axios rejects like this). */
export function refreshRejected(status: number) {
  return httpError({ headers: {} } as InternalAxiosRequestConfig, status, 'TOKEN_INVALID');
}

/** A refresh call that got no answer at all (offline, timeout). */
export const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
