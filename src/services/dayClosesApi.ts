import {
  DayClose,
  DayCloseAlerts,
  DayCloseListResponse,
  DayClosePreview,
  type CloseDayBody,
  type DayCloseListQuery,
  type ReopenDayBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const dayCloseKeys = {
  all: (orgId: string | null) => ['day-closes', orgId] as const,
  list: (orgId: string | null, params: DayCloseListQuery) =>
    ['day-closes', orgId, 'list', params] as const,
  preview: (orgId: string | null, branchId: string, date: string) =>
    ['day-closes', orgId, 'preview', branchId, date] as const,
  one: (orgId: string | null, id: string) => ['day-closes', orgId, 'one', id] as const,
  alerts: (orgId: string | null) => ['day-closes', orgId, 'alerts'] as const,
};

/**
 * K04 day close (D84). Every number comes from the server; the preview's hash goes back unchanged
 * with the close, so the server can refuse a close when something was posted after the preview.
 */
export const dayClosesApi = {
  list: async (params: DayCloseListQuery = {}) =>
    DayCloseListResponse.parse((await api.get('/api/day-closes', { params })).data),
  /** An open or reopened day; a closed one answers DAY_ALREADY_CLOSED with its id. */
  preview: async (branchId: string, date: string) =>
    DayClosePreview.parse(
      (await api.get('/api/day-closes/preview', { params: { branch_id: branchId, date } })).data,
    ),
  get: async (id: string) => DayClose.parse((await api.get(`/api/day-closes/${id}`)).data),
  alerts: async () => DayCloseAlerts.parse((await api.get('/api/day-closes/alerts')).data),
  /** No Idempotency-Key: closing twice is DAY_ALREADY_CLOSED, which the screen treats as done. */
  close: async (body: CloseDayBody) =>
    DayClose.parse((await api.post('/api/day-closes', body)).data),
  reopen: async (id: string, body: ReopenDayBody) =>
    DayClose.parse((await api.post(`/api/day-closes/${id}/reopen`, body)).data),
};
