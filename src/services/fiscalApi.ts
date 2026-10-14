import {
  FiscalAlertSummary,
  FiscalDaySummary,
  FiscalDetails,
  FiscalList,
  FiscalListQuery,
  FiscalQueued,
  FiscalRetryManyResult,
  FiscalRetryResult,
  type FiscalListQuery as ListQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const fiscalKeys = {
  all: (orgId: string | null) => ['fiscal', orgId] as const,
  list: (orgId: string | null, query: ListQuery) => ['fiscal', orgId, 'list', query] as const,
  summary: (orgId: string | null) => ['fiscal', orgId, 'summary'] as const,
  one: (orgId: string | null, id: string) => ['fiscal', orgId, 'one', id] as const,
};

/**
 * T03 ETA monitor (EC-91). The server checks fiscal.view and fiscal.retry and the caller's branches.
 * A correction is queued (202) and built by the job worker: the screen refreshes until it changes.
 */
export const fiscalApi = {
  list: async (query: ListQuery) =>
    FiscalList.parse((await api.get('/api/fiscal', { params: FiscalListQuery.parse(query) })).data),
  summary: async () => FiscalAlertSummary.parse((await api.get('/api/fiscal/summary')).data),
  daySummary: async (branchId: string, date: string) =>
    FiscalDaySummary.parse(
      (await api.get('/api/fiscal/day-summary', { params: { branch_id: branchId, date } })).data,
    ),
  get: async (id: string) => FiscalDetails.parse((await api.get(`/api/fiscal/${id}`)).data),
  retry: async (id: string) =>
    FiscalRetryResult.parse((await api.post(`/api/fiscal/${id}/retry`)).data),
  correct: async (id: string) =>
    FiscalQueued.parse((await api.post(`/api/fiscal/${id}/correct`)).data),
  assignDevice: async (id: string, deviceId: string) =>
    FiscalRetryResult.parse(
      (await api.post(`/api/fiscal/${id}/assign-device`, { device_id: deviceId })).data,
    ),
  checkNow: async (id: string) =>
    FiscalQueued.parse((await api.post(`/api/fiscal/${id}/check-now`)).data),
  retryMany: async (ids: string[]) =>
    FiscalRetryManyResult.parse((await api.post('/api/fiscal/retry-many', { ids })).data),
};
