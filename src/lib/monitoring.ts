// Q02 error tracking in the browser (Sentry, D35 in EcoFin-API). Off unless VITE_SENTRY_DSN is set,
// so dev, tests and e2e send nothing. Errors only: no tracing, no session replay.
// A failed API call (5xx) is reported with the server's request id, the same id the API put on
// its own Sentry event and log line, so one problem can be followed from the browser to the server.
//
// Privacy: no user data, cookies or bodies; URL query strings are cut from breadcrumbs; emails,
// 14-digit national ids, phone numbers and tokens are masked in every message.
//
// The SDK (about 30 kB gzipped) is loaded in the background only when a DSN is set, so the first
// screen never waits for it and shops without monitoring never download it.
import type * as SentrySdk from '@sentry/react';

const MASKS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/(?<!\d)\d{14}(?!\d)/g, '[national-id]'],
  [/(?<!\d)(\+?20|0)1[0125]\d{8}(?!\d)/g, '[phone]'],
  [/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [token]'],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'],
];

export function maskText(text: string): string {
  return MASKS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** `https://x/api/y?email=a@b` -> `https://x/api/y` (queries can carry personal data). */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

let sdk: Promise<typeof SentrySdk> | undefined;

/** Starts loading Sentry when VITE_SENTRY_DSN is set; returns whether monitoring is on. */
export function initMonitoring(env: ImportMetaEnv = import.meta.env): boolean {
  const dsn = env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  const release = env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined;
  sdk = import('@sentry/react').then((Sentry) => {
    initSdk(Sentry, dsn, env, release);
    return Sentry;
  });
  // A failed download (offline) only means no reports; it must never break the app.
  sdk.catch(() => undefined);
  return true;
}

/** Resolves once the SDK is loaded and started (or right away when monitoring is off). */
export function monitoringReady(): Promise<unknown> {
  return sdk?.catch(() => undefined) ?? Promise.resolve();
}

function withSdk(fn: (Sentry: typeof SentrySdk) => void): void {
  void sdk?.then(fn).catch(() => undefined);
}

function initSdk(
  Sentry: typeof SentrySdk,
  dsn: string,
  env: ImportMetaEnv,
  release: string | undefined,
): void {
  Sentry.init({
    dsn,
    environment: (env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? env.MODE,
    ...(release ? { release: release.slice(0, 7) } : {}),
    // Default browser integrations (global error handlers, dedupe, breadcrumbs); no tracing or replay.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    maxBreadcrumbs: 30,
    beforeBreadcrumb(crumb) {
      const data = crumb.data as Record<string, unknown> | undefined;
      if (data && typeof data.url === 'string') data.url = withoutQuery(data.url);
      if (data && typeof data.to === 'string') data.to = withoutQuery(data.to);
      if (data && typeof data.from === 'string') data.from = withoutQuery(data.from);
      if (crumb.message) crumb.message = maskText(crumb.message);
      return crumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        if (event.request.url) event.request.url = withoutQuery(event.request.url);
        delete event.request.query_string;
      }
      if (event.message) event.message = maskText(event.message);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = maskText(ex.value);
      }
      return event;
    },
  });
}

/** A render error caught by our ErrorBoundary. */
export function captureRenderError(error: unknown, componentStack?: string | null): void {
  withSdk((Sentry) =>
    Sentry.withScope((scope) => {
      if (componentStack) scope.setContext('react', { componentStack });
      Sentry.captureException(error);
    }),
  );
}

/** A failed API call (5xx): tagged with the server's request id so both sides can be matched. */
export function captureApiError(
  error: Error,
  info: { status: number; code: string; requestId?: string; method?: string; path?: string },
): void {
  withSdk((Sentry) =>
    Sentry.withScope((scope) => {
      scope.setTag('source', 'api');
      scope.setTag('status', String(info.status));
      scope.setTag('code', info.code);
      if (info.requestId) scope.setTag('requestId', info.requestId);
      if (info.method) scope.setTag('method', info.method.toUpperCase());
      if (info.path) scope.setTag('path', withoutQuery(info.path));
      Sentry.captureException(error);
    }),
  );
}
