import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { authApi, buildForgotBody, buildLoginBody } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { loginResponse, ORG_A, session } from '@/test/authFixtures';

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  queryClient.clear();
});

describe('login body', () => {
  it('sends email alone', () => {
    const r = buildLoginBody({
      identifier: ' Owner@Example.com ',
      password: ' pw ',
      tenantSlug: 'x',
    });
    expect(r.success && r.data).toEqual({ identifier: 'Owner@Example.com', password: ' pw ' });
  });

  it('sends shop + lowercased username', () => {
    const r = buildLoginBody({ identifier: 'Ahmed.Ali', password: 'pw', tenantSlug: 'shop-a' });
    expect(r.success && r.data).toEqual({
      identifier: 'ahmed.ali',
      tenantSlug: 'shop-a',
      password: 'pw',
    });
  });

  it('rejects a username without a shop', () => {
    expect(buildLoginBody({ identifier: 'ahmed', password: 'pw' }).success).toBe(false);
  });

  it('builds the forgot-password body the same way', () => {
    const r = buildForgotBody({ identifier: 'Ahmed', tenantSlug: 'shop-a' });
    expect(r.success && r.data).toEqual({ identifier: 'ahmed', tenantSlug: 'shop-a' });
  });
});

describe('logout', () => {
  it('calls the endpoint, then clears the store and the query cache', async () => {
    useAuthStore.setState({ ...session(), orgId: 'org' });
    queryClient.setQueryData(['x'], 1);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await authApi.logout();
    expect(post).toHaveBeenCalledWith('/api/auth/logout');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(queryClient.getQueryData(['x'])).toBeUndefined();
  });

  it('clears everything even when the request fails', async () => {
    useAuthStore.setState({ ...session(), orgId: 'org' });
    queryClient.setQueryData(['x'], 1);
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().orgId).toBeNull();
    expect(queryClient.getQueryData(['x'])).toBeUndefined();
  });
});

describe('auth store', () => {
  it('selects the only shop by itself and keeps the shop slug after logout', () => {
    useAuthStore.getState().setLogin(loginResponse());
    expect(useAuthStore.getState().orgId).toBeTruthy();
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().tenantSlug).toBe('shop-a');
  });
});

describe('reply parsing', () => {
  it('rejects a login reply that does not match the contract', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { accessToken: 'only-this' } });
    await expect(authApi.login({ identifier: 'a@b.co', password: 'pw' })).rejects.toMatchObject({
      status: 500,
      code: 'UNKNOWN',
    });
  });

  it('rejects a select-shop reply that does not match the contract', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { shop: {} } });
    await expect(authApi.selectShop(ORG_A)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('returns the parsed login reply', async () => {
    const reply = loginResponse();
    vi.spyOn(api, 'post').mockResolvedValue({ data: reply });
    await expect(authApi.login({ identifier: 'a@b.co', password: 'pw' })).resolves.toEqual(reply);
  });
});
