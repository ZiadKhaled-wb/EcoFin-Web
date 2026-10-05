import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setContext: vi.fn() };
  return {
    scope,
    init: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
    captureException: vi.fn(),
  };
});
vi.mock('@sentry/react', () => sentry);

async function load() {
  vi.resetModules();
  return import('@/lib/monitoring');
}

const env = (extra: Record<string, string> = {}) =>
  ({
    MODE: 'production',
    DEV: false,
    PROD: true,
    SSR: false,
    BASE_URL: '/',
    ...extra,
  }) as unknown as ImportMetaEnv;

beforeEach(() => vi.clearAllMocks());

describe('monitoring (Q02)', () => {
  it('is off without VITE_SENTRY_DSN and sends nothing', async () => {
    const m = await load();
    expect(m.initMonitoring(env())).toBe(false);
    m.captureApiError(new Error('x'), { status: 500, code: 'INTERNAL', requestId: 'r' });
    m.captureRenderError(new Error('y'));
    await m.monitoringReady();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('starts with environment, short release, no user data, no BrowserSession', async () => {
    const m = await load();
    expect(
      m.initMonitoring(
        env({
          VITE_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/3',
          VITE_SENTRY_ENVIRONMENT: 'development',
          VITE_VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
        }),
      ),
    ).toBe(true);
    await m.monitoringReady();
    const options = sentry.init.mock.calls[0]?.[0] as {
      environment: string;
      release: string;
      dataCollection: Record<string, unknown>;
      integrations: (d: { name: string }[]) => { name: string }[];
      beforeBreadcrumb: (c: Record<string, unknown>) => Record<string, unknown>;
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(options).toMatchObject({ environment: 'development', release: 'abcdef1' });
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
    });
    expect(options.integrations([{ name: 'Dedupe' }, { name: 'BrowserSession' }])).toEqual([
      { name: 'Dedupe' },
    ]);

    const crumb = options.beforeBreadcrumb({
      category: 'fetch',
      data: { url: 'https://api.x/api/auth/me?email=a@b.co', method: 'GET' },
    });
    expect((crumb.data as { url: string }).url).toBe('https://api.x/api/auth/me');

    const event = options.beforeSend({
      user: { email: 'a@b.co' },
      request: {
        url: 'https://site/x?nid=29001011234567',
        cookies: {},
        headers: {},
        query_string: 'nid=1',
      },
      exception: { values: [{ value: 'customer 29001011234567 failed' }] },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: 'https://site/x' });
    expect(event).toMatchObject({
      exception: { values: [{ value: 'customer [national-id] failed' }] },
    });
  });

  it('an API failure is tagged with the server request id, method and a path without query', async () => {
    const m = await load();
    m.initMonitoring(env({ VITE_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/3' }));
    const err = new Error('api');
    m.captureApiError(err, {
      status: 502,
      code: 'UNKNOWN',
      requestId: 'req-9',
      method: 'post',
      path: '/api/x?email=a@b.co',
    });
    await m.monitoringReady();
    await Promise.resolve();
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(sentry.scope.setTag.mock.calls).toEqual([
      ['source', 'api'],
      ['status', '502'],
      ['code', 'UNKNOWN'],
      ['requestId', 'req-9'],
      ['method', 'POST'],
      ['path', '/api/x'],
    ]);
  });

  it('masks emails, national ids, phones and tokens', async () => {
    const { maskText } = await load();
    expect(maskText('a@b.co 29001011234567 01012345678 Bearer abc eyJa.eyJb.c')).toBe(
      '[email] [national-id] [phone] Bearer [token] [jwt]',
    );
  });
});
