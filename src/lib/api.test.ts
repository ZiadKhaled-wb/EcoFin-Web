import axios, { type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const captureApiError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/monitoring', () => ({ captureApiError }));

import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { clearDeviceToken, getDeviceToken, setDeviceToken } from '@/features/devices/deviceToken';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import {
  httpError,
  httpOk,
  networkError,
  ORG_A,
  ORG_B,
  refreshRejected,
  session,
} from '@/test/authFixtures';

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

  it('a 401 that lands after the refresh finished retries with the new token, no 2nd refresh', async () => {
    // Two calls leave with the old token; the first 401 refreshes; the second 401 only comes back
    // once that refresh is done (a slow endpoint). It must reuse the new token, not refresh again.
    const refreshed = session('new');
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: refreshed });
    let releaseSlow: () => void = () => undefined;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    api.defaults.adapter = async (config) => {
      const auth = String(config.headers.Authorization);
      if (auth === 'Bearer old') {
        if (config.url === '/api/slow') await slowGate;
        throw httpError(config, 401, 'TOKEN_EXPIRED');
      }
      return httpOk(config, { ok: config.url });
    };

    const fast = api.get('/api/fast');
    const slow = api.get('/api/slow');
    expect((await fast).data).toEqual({ ok: '/api/fast' });
    releaseSlow();
    expect((await slow).data).toEqual({ ok: '/api/slow' });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh gets no answer (offline, timeout, 5xx)', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(networkError());
    api.defaults.adapter = async (config) => {
      throw httpError(config, 401, 'TOKEN_EXPIRED');
    };
    await expect(api.get('/api/a')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBe('old');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-old');

    // The next request tries the refresh again, and a good answer recovers the session.
    post.mockResolvedValue({ data: session('back') });
    api.defaults.adapter = async (config) => {
      if (config.headers.Authorization === 'Bearer old')
        throw httpError(config, 401, 'TOKEN_EXPIRED');
      return httpOk(config, { ok: true });
    };
    await expect(api.get('/api/b')).resolves.toMatchObject({ data: { ok: true } });
    expect(useAuthStore.getState().accessToken).toBe('access-back');
  });

  it('clears the session when the server rejects the refresh (4xx)', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(refreshRejected(401));
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

describe('error tracking (Q02)', () => {
  beforeEach(() => captureApiError.mockReset());

  it('a 5xx is reported with the API request id, method and path (no query string sent on)', async () => {
    api.defaults.adapter = async (config) => {
      const err = httpError(config, 500, 'INTERNAL');
      (err.response!.data as { error: { requestId?: string } }).error.requestId = 'req-web-1';
      throw err;
    };
    signedIn('tok');
    const err = await api.post('/api/things?x=1', {}).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 500, code: 'INTERNAL', requestId: 'req-web-1' });
    expect(captureApiError).toHaveBeenCalledWith(err, {
      status: 500,
      code: 'INTERNAL',
      requestId: 'req-web-1',
      method: 'post',
      path: '/api/things?x=1',
    });
  });

  it('client errors and network errors are not reported', async () => {
    api.defaults.adapter = async (config) => {
      throw httpError(config, 409, 'OUT_OF_STOCK');
    };
    signedIn('tok');
    await api.get('/api/a').catch(() => undefined);
    api.defaults.adapter = async (config) => {
      throw Object.assign(networkError(), { config });
    };
    await api.get('/api/a').catch(() => undefined);
    expect(captureApiError).not.toHaveBeenCalled();
  });
});

describe('device token (O03)', () => {
  const TOKEN = 'Dev1ce-T0ken_'.padEnd(43, 'a');
  afterEach(() => {
    clearDeviceToken(ORG_A);
    clearDeviceToken(ORG_B);
  });

  it('is kept in localStorage under ecotech.deviceToken.<organization_id>', () => {
    setDeviceToken(ORG_A, TOKEN);
    expect(window.localStorage.getItem(`ecotech.deviceToken.${ORG_A}`)).toBe(TOKEN);
    expect(getDeviceToken(ORG_A)).toBe(TOKEN);
    expect(getDeviceToken(ORG_B)).toBeNull();
    expect(getDeviceToken(null)).toBeNull();
  });

  it("sends the active shop's token as x-device-token and never a device id", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      seen.push(config);
      return httpOk(config, {});
    };
    setDeviceToken(ORG_A, TOKEN);
    signedIn('tok');
    await api.get('/api/anything', { headers: { 'x-device-token': 'made-up' } });
    expect(seen[0]?.headers['x-device-token']).toBe(TOKEN);
    expect(seen[0]?.headers['x-device-id']).toBeUndefined();

    // Another shop's token is not this shop's; a public call carries none.
    signedIn('tok', ORG_B);
    await api.get('/api/anything');
    expect(seen[1]?.headers['x-device-token']).toBeUndefined();
    await api.post('/api/auth/login', {}, { skipAuth: true });
    expect(seen[2]?.headers['x-device-token']).toBeUndefined();
  });

  it('403 DEVICE_REVOKED removes the token, says so once and sends the request again without it', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue('toast-id');
    const tokens: unknown[] = [];
    api.defaults.adapter = async (config) => {
      tokens.push(config.headers['x-device-token']);
      if (config.headers['x-device-token']) throw httpError(config, 403, 'DEVICE_REVOKED');
      return httpOk(config, { shift: null });
    };
    setDeviceToken(ORG_A, TOKEN);
    signedIn('tok');
    const res = await api.get('/api/shifts/current');
    expect(res.data).toEqual({ shift: null });
    expect(tokens).toEqual([TOKEN, undefined]);
    expect(getDeviceToken(ORG_A)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(t('devices.revoked'));
    expect(t('devices.revoked', undefined, 'en')).toBe('This computer is no longer a POS device');
  });

  it('a newer pairing made meanwhile is kept, and a second refusal is not retried for ever', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue('toast-id');
    const NEWER = 'Newer-T0ken_'.padEnd(43, 'b');
    let calls = 0;
    api.defaults.adapter = async (config) => {
      calls += 1;
      // While the first request is on its way this computer is paired again.
      if (calls === 1) setDeviceToken(ORG_A, NEWER);
      throw httpError(config, 403, 'DEVICE_REVOKED');
    };
    setDeviceToken(ORG_A, TOKEN);
    signedIn('tok');
    await expect(api.get('/api/shifts/current')).rejects.toMatchObject({ code: 'DEVICE_REVOKED' });
    expect(calls).toBe(2);
    // The first refusal was about the old token: the new one stayed until it was refused itself.
    expect(error).toHaveBeenCalledTimes(1);
    expect(getDeviceToken(ORG_A)).toBeNull();
  });
});

describe('deactivated account (EC-145)', () => {
  it('a 403 ACCOUNT_DISABLED on an authenticated call ends the session with the reason', async () => {
    api.defaults.adapter = async (config) => {
      throw httpError(config, 403, 'ACCOUNT_DISABLED');
    };
    signedIn('tok');
    await expect(api.get('/api/anything')).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.endedReason).toBe('account_disabled');
  });

  it('login (skipAuth) keeps its own inline message and ends no session', async () => {
    api.defaults.adapter = async (config) => {
      throw httpError(config, 403, 'ACCOUNT_DISABLED');
    };
    signedIn('tok');
    await expect(api.post('/api/auth/login', {}, { skipAuth: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(useAuthStore.getState().accessToken).toBe('tok');
    expect(useAuthStore.getState().endedReason).toBeNull();
  });
});
