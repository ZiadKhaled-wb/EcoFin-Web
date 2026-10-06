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
  // Tokens and codes in URLs, e.g. the password-reset link's fragment (#access_token=...&refresh_token=...).
  [/\b(access_token|refresh_token|token|code|password)=[^&\s#"']+/gi, '$1=[redacted]'],
];

/** Keys whose values never leave the browser, whatever they hold. */
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'nationalid',
  'national_id',
  'apikey',
]);

export function maskText(text: string): string {
  return MASKS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** Masks every string and redacts sensitive keys, at any depth (bounded). */
export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskText(value);
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[Redacted]' : scrub(v, depth + 1);
  }
  return out;
}

type Crumb = { category?: string; message?: string; data?: Record<string, unknown> };

/** URLs without query or fragment; console arguments dropped (they can hold whole objects). */
export function cleanBreadcrumb<T extends Crumb>(crumb: T): T {
  if (crumb.data) {
    const data = { ...crumb.data };
    for (const key of ['url', 'to', 'from']) {
      if (typeof data[key] === 'string') data[key] = withoutQuery(data[key]);
    }
    if (crumb.category === 'console') delete data.arguments;
    crumb.data = scrub(data) as Record<string, unknown>;
  }
  if (crumb.message) crumb.message = maskText(crumb.message);
  return crumb;
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
  // The deploy workflow passes the commit as VITE_APP_RELEASE (.github/workflows/deploy.yml).
  const release = (env.VITE_APP_RELEASE ?? env.VITE_VERCEL_GIT_COMMIT_SHA) as string | undefined;
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
    beforeBreadcrumb: (crumb) => cleanBreadcrumb(crumb),
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
      // Everything else that can carry text is scrubbed again on the way out.
      if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => cleanBreadcrumb(b));
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      if (event.tags) event.tags = scrub(event.tags) as typeof event.tags;
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
