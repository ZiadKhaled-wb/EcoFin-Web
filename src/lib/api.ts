import { AuthRefreshResponse, type ErrorCode } from '@ziadkhaled-wb/contracts';
import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { clearDeviceToken, getDeviceToken } from '@/features/devices/deviceToken';
import { t } from '@/i18n';
import { captureApiError } from '@/lib/monitoring';
import { useAuthStore } from '@/store/authStore';
import { showSubscriptionError } from './subscriptionErrors';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Public endpoints (login, forgot-password…) must not send a Bearer token or x-org-id. */
    skipAuth?: boolean;
    _retried?: boolean;
    /** Sent again once without a device token the server no longer knows. */
    _deviceRetried?: boolean;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Code of a failed request: a contract error code, or a client-side one. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

/**
 * Normalised error every caller receives. Pages never touch AxiosError and never show
 * `serverMessage`: they map `code` to a translated string.
 */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  retryAfter?: number;
  fields?: Record<string, string>;
  /** Raw server text. For logs only, never for the UI. */
  serverMessage?: string;
  /** The API's request id (`error.requestId`): the key to its log line and Sentry event. */
  requestId?: string;
  details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    retryAfter?: number,
    fields?: Record<string, string>,
    serverMessage?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.fields = fields;
    this.serverMessage = serverMessage;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Contract error body: `{ error: { code, message, details? } }`. */
function readErrorBody(data: unknown): {
  code?: string;
  message?: string;
  details?: unknown;
  requestId?: string;
} {
  const body = isRecord(data) && isRecord(data.error) ? data.error : {};
  return {
    code: typeof body.code === 'string' ? body.code : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    details: body.details,
    requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
  };
}

function extractFields(details: unknown): Record<string, string> | undefined {
  if (!details) return undefined;
  const out: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const item of details) {
      if (isRecord(item) && item.field && item.message) {
        out[String(item.field)] = String(item.message);
      }
    }
  } else if (isRecord(details)) {
    for (const [key, value] of Object.entries(details)) {
      const msg = Array.isArray(value) ? value[0] : value;
      if (typeof msg === 'string') out[key] = msg;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function toApiError(error: AxiosError<unknown>): ApiError {
  const res = error.response;
  if (!res) return new ApiError(0, 'NETWORK_ERROR', t('errors.network'));
  const body = readErrorBody(res.data);
  const retryHeader = Number.parseInt(String(res.headers?.['retry-after'] ?? ''), 10);
  const apiError = new ApiError(
    res.status,
    (body.code as ApiErrorCode | undefined) ?? 'UNKNOWN',
    t('errors.unknown'),
    Number.isFinite(retryHeader) ? retryHeader : undefined,
    extractFields(body.details),
    body.message,
  );
  apiError.requestId = body.requestId;
  apiError.details = body.details;
  return apiError;
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (config.skipAuth) return config;
  const { accessToken, orgId } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // The active shop. The server still checks it against the token's memberships.
  if (orgId) config.headers['x-org-id'] = orgId;
  // O03: a paired POS computer says which device it is. The server resolves the token; a
  // device id is never sent from here.
  const deviceToken = getDeviceToken(orgId);
  if (deviceToken) config.headers['x-device-token'] = deviceToken;
  else delete config.headers['x-device-token'];
  return config;
});

/** One shared refresh at a time, so parallel 401s and the silent timer don't stampede. */
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setSession, clearSession } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    // Plain axios: must not re-enter our interceptors.
    const res = await axios.post<unknown>(
      `${BASE_URL}/api/auth/refresh`,
      { refreshToken },
      { timeout: 15_000 },
    );
    const parsed = AuthRefreshResponse.safeParse(res.data);
    if (!parsed.success) return null;
    setSession(parsed.data);
    return parsed.data.accessToken;
  } catch (err) {
    // Only a server rejection (4xx) ends the session. A network error, a timeout or a 5xx
    // keeps it: the next request or timer tick tries again.
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      const code = axios.isAxiosError(err) ? readErrorBody(err.response?.data).code : undefined;
      clearSession(status === 403 && code === 'ACCOUNT_DISABLED' ? 'account_disabled' : undefined);
    }
    return null;
  }
}

/**
 * Refreshes the session once, however many callers ask at the same time. Returns the new access
 * token, or null. On null the session is already cleared if the server rejected the refresh;
 * otherwise (no answer) it is kept.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<unknown>) => {
    const apiError = toApiError(error);
    const original = error.config;

    // 401 on an authenticated request -> one refresh attempt. A rejected refresh clears the
    // session (see doRefresh); a refresh with no answer keeps it.
    // INVALID_CREDENTIALS (a wrong current password) is not a dead session.
    // Route guards react to the cleared store, so no hard redirect is needed.
    if (
      apiError.status === 401 &&
      apiError.code !== 'INVALID_CREDENTIALS' &&
      original &&
      !original.skipAuth &&
      !original._retried
    ) {
      original._retried = true;
      // Sent with a token that has been replaced since (another call's refresh finished before
      // this 401 came back): retry with the current token instead of refreshing again.
      const current = useAuthStore.getState().accessToken;
      const sentWith = String(original.headers.Authorization ?? '');
      if (current && sentWith !== `Bearer ${current}`) return api(original);
      const token = await refreshAccessToken();
      if (token) return api(original);
    }

    // O03: the device of this computer was unpaired or turned off. Forget the token, say so
    // once, and send the request again as a computer that is no device.
    if (
      apiError.status === 403 &&
      apiError.code === 'DEVICE_REVOKED' &&
      original &&
      !original.skipAuth
    ) {
      const sentOrg = String(original.headers['x-org-id'] ?? '');
      const sentToken = String(original.headers['x-device-token'] ?? '');
      // Only the token this request carried: a newer pairing made meanwhile is kept.
      if (sentOrg && sentToken && getDeviceToken(sentOrg) === sentToken) {
        clearDeviceToken(sentOrg);
        toast.error(t('devices.revoked'));
      }
      if (!original._deviceRetried) {
        original._deviceRetried = true;
        return api(original);
      }
    }

    // Q02: a server failure goes to the error tracker with the API's request id.
    if (apiError.status >= 500) {
      captureApiError(apiError, {
        status: apiError.status,
        code: apiError.code,
        requestId: apiError.requestId,
        method: original?.method,
        path: original?.url,
      });
    }

    // EC-145: a deactivated employee is refused on the next request. End the session locally
    // (no logout call: the account can't use the API) and let the route guard show the login
    // page with the reason. Login itself is skipAuth: its ACCOUNT_DISABLED is shown inline.
    if (
      apiError.status === 403 &&
      apiError.code === 'ACCOUNT_DISABLED' &&
      original &&
      !original.skipAuth
    ) {
      useAuthStore.getState().clearSession('account_disabled');
    }

    // 403 MUST_CHANGE_PASSWORD -> client state is stale; guards redirect.
    if (apiError.status === 403 && apiError.code === 'MUST_CHANGE_PASSWORD') {
      useAuthStore.getState().flagMustChangePassword();
    }

    showSubscriptionError(apiError);
    return Promise.reject(apiError);
  },
);
