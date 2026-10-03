import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { Session } from '@/types/auth';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Public endpoints (login, check-license…) must not send a Bearer token. */
    skipAuth?: boolean;
    _retried?: boolean;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Normalised error every caller receives. Pages never touch AxiosError. */
export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.fields = fields;
  }
}

export const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.message ? err.message : fallback;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function extractFields(data: Json): Record<string, string> | undefined {
  const raw = data?.errors ?? data?.details ?? data?.fields;
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item?.field && item?.message) out[String(item.field)] = String(item.message);
    }
  } else if (typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const msg = Array.isArray(value) ? value[0] : value;
      if (typeof msg === 'string') out[key] = msg;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function toApiError(error: AxiosError<Json>): ApiError {
  const res = error.response;
  if (!res) {
    return new ApiError(0, 'NETWORK_ERROR', 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.');
  }
  const data = res.data;
  const retryHeader = Number.parseInt(String(res.headers?.['retry-after'] ?? ''), 10);
  return new ApiError(
    res.status,
    data?.code ?? data?.error?.code ?? 'UNKNOWN',
    data?.message ?? data?.error?.message ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.',
    Number.isFinite(retryHeader) ? retryHeader : undefined,
    extractFields(data),
  );
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.skipAuth) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** One shared refresh at a time, so parallel 401s don't stampede the endpoint. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setSession } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    // Plain axios: must not re-enter our interceptors.
    // ASSUMPTION: POST /api/auth/refresh { refresh_token } -> { session } | session.
    const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refresh_token: refreshToken });
    const session: Session = res.data?.session ?? res.data;
    setSession(session);
    return session.access_token;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<Json>) => {
    const apiError = toApiError(error);
    const original = error.config;

    // 401 UNAUTHORIZED -> one refresh attempt, else sign out.
    // Route guards react to the cleared store, so no hard redirect is needed.
    if (
      apiError.status === 401 &&
      apiError.code === 'UNAUTHORIZED' &&
      original &&
      !original.skipAuth &&
      !original._retried
    ) {
      original._retried = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      useAuthStore.getState().clearSession();
    }

    // 403 MUST_CHANGE_PASSWORD -> client state is stale; guards redirect.
    if (apiError.status === 403 && apiError.code === 'MUST_CHANGE_PASSWORD') {
      useAuthStore.getState().flagMustChangePassword();
    }

    return Promise.reject(apiError);
  },
);
