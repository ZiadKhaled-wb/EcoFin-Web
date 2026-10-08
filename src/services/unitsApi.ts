import {
  UnitDetail,
  UnitList,
  UnitRegistration,
  type UnitRegisterBody,
  type UnitStatus,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export interface UnitSearchParams {
  search?: string;
  status?: UnitStatus;
  branch_id?: string;
  page?: number;
  pageSize?: number;
}

export const unitKeys = {
  all: (orgId: string | null) => ['units', orgId] as const,
  search: (orgId: string | null, params: UnitSearchParams) =>
    ['units', orgId, 'search', params] as const,
  one: (orgId: string | null, id: string) => ['units', orgId, 'one', id] as const,
};

/** I04 serial units: reads with stock.view; registering with stock.adjust and the serials module. */
export const unitsApi = {
  search: async (params: UnitSearchParams = {}) =>
    UnitList.parse((await api.get('/api/units', { params })).data),
  /** The exact serial, as scanned (the server trims and upper-cases it). */
  find: async (serial: string) =>
    UnitDetail.parse((await api.get('/api/units/find', { params: { serial } })).data),
  get: async (id: string) => UnitDetail.parse((await api.get(`/api/units/${id}`)).data),
  /** The key is kept per form, so a retried submit registers once. */
  register: async (body: UnitRegisterBody, key: string) =>
    UnitRegistration.parse(
      (await api.post('/api/units', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
};
