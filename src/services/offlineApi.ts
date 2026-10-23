import {
  ApiHealth,
  OfflineLeaseResponse,
  OfflineSaleDetail,
  OfflineSaleList,
  OfflineSaleSummary,
  OfflineSettings,
  OfflineSyncResponse,
  type OfflineImportBody,
  type OfflineItem,
  type OfflineLeaseBody,
  type OfflineResolveBody,
  type OfflineSaleListQuery,
  type OfflineSettingsBody,
} from '@ziadkhaled-wb/contracts';
import axios from 'axios';
import { api } from '@/lib/api';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const offlineKeys = {
  all: (orgId: string | null) => ['offline', orgId] as const,
  list: (orgId: string | null, query: OfflineSaleListQuery) =>
    ['offline', orgId, 'list', query] as const,
  one: (orgId: string | null, id: string) => ['offline', orgId, 'one', id] as const,
  settings: (orgId: string | null) => ['offline', orgId, 'settings'] as const,
};

/** S08 offline cash sales (EC-75). */
export const offlineApi = {
  lease: async (body: OfflineLeaseBody) =>
    OfflineLeaseResponse.parse((await api.post('/api/offline/lease', body)).data),
  sync: async (items: OfflineItem[]) =>
    OfflineSyncResponse.parse((await api.post('/api/offline/sync', { items })).data),
  list: async (query: OfflineSaleListQuery) =>
    OfflineSaleList.parse((await api.get('/api/offline/sales', { params: query })).data),
  get: async (id: string) =>
    OfflineSaleDetail.parse((await api.get(`/api/offline/sales/${id}`)).data),
  resolve: async (id: string, body: OfflineResolveBody) =>
    OfflineSaleSummary.parse((await api.post(`/api/offline/sales/${id}/resolve`, body)).data),
  importItems: async (body: OfflineImportBody) =>
    OfflineSyncResponse.parse((await api.post('/api/offline/import', body)).data),
  settings: async () => OfflineSettings.parse((await api.get('/api/offline/settings')).data),
  saveSettings: async (body: OfflineSettingsBody) =>
    OfflineSettings.parse((await api.put('/api/offline/settings', body)).data),
  /** D1: the connectivity check: no session, no interceptors, a short timeout. */
  health: async (timeoutMs = 5000) => {
    const res = await axios.get(`${BASE_URL}/api/health`, { timeout: timeoutMs });
    return ApiHealth.parse(res.data).ok;
  },
};
