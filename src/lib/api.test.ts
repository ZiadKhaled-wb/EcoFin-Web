import axios, { type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { httpError, httpOk, ORG_A, session } from '@/test/authFixtures';

const originalAdapter = api.defaults.adapter;

function signedIn(accessToken = 'old', orgId: string | null = ORG_A) {
  useAuthStore.setState({
    accessToken,
    refreshToken: 'refresh-old',
    expiresAt: session().expiresAt,
    orgId,
  });
}

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
});

describe('request headers', () => {
  it('sends the Bearer token and x-org-id of the active shop', async () => {
    let seen: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      seen = config;
      return httpOk(config, {});
    };
    signedIn('tok');
    await api.get('/api/anything');
    expect(seen?.headers.Authorization).toBe('Bearer tok');
    expect(seen?.headers['x-org-id']).toBe(ORG_A);
  });

  it('sends no x-org-id before a shop is chosen, and nothing on public calls', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      seen.push(config);
      return httpOk(config, {});
    };
    signedIn('tok', null);
    await api.get('/api/a');
    signedIn('tok', ORG_A);
    await api.post('/api/auth/login', {}, { skipAuth: true });
    expect(seen[0]?.headers['x-org-id']).toBeUndefined();
    expect(seen[1]?.headers.Authorization).toBeUndefined();
    expect(seen[1]?.headers['x-org-id']).toBeUndefined();
  });
});

describe('401 handling', () => {
  beforeEach(() => signedIn('old'));

  it('refreshes exactly once for parallel 401s, then retries each request', async () => {
    const refreshed = session('new');
    const post = vi
      .spyOn(axios, 'post')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: refreshed }), 10)),
      );
    const calls: string[] = [];
    api.defaults.adapter = async (config) => {
      const auth = String(config.headers.Authorization);
      calls.push(auth);
      if (auth === 'Bearer old') throw httpError(config, 401, 'TOKEN_EXPIRED');
      return httpOk(config, { ok: true });
    };

    const results = await Promise.all([api.get('/api/a'), api.get('/api/b'), api.get('/api/c')]);

    expect(results.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
    expect(post.mock.calls[0]?.[1]).toEqual({ refreshToken: 'refresh-old' });
    expect(useAuthStore.getState().accessToken).toBe(refreshed.accessToken);
    expect(useAuthStore.getState().refreshToken).toBe(refreshed.refreshToken);
    expect(useAuthStore.getState().expiresAt).toBe(refreshed.expiresAt);
    expect(calls.filter((c) => c === `Bearer ${refreshed.accessToken}`)).toHaveLength(3);
  });

  it('clears the session when the refresh fails', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh rejected'));
    api.defaults.adapter = async (config) => {
      throw httpError(config, 401, 'TOKEN_EXPIRED');
    };
    await expect(api.get('/api/a')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('does not refresh for a wrong password (INVALID_CREDENTIALS)', async () => {
    const post = vi.spyOn(axios, 'post');
    api.defaults.adapter = async (config) => {
      throw httpError(config, 401, 'INVALID_CREDENTIALS');
    };
    await expect(api.post('/api/auth/change-password', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBe('old');
  });

  it('turns a contract error body into an ApiError without exposing server text', async () => {
    api.defaults.adapter = async (config) => {
      throw httpError(config, 429, 'TOO_MANY_LOGIN_ATTEMPTS', { 'retry-after': '30' });
    };
    const err = await api.get('/api/a', { skipAuth: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'TOO_MANY_LOGIN_ATTEMPTS', retryAfter: 30 });
    expect((err as ApiError).message).not.toContain('raw server text');
  });
});
