import {
  CurrentShift,
  Shift,
  ShiftList,
  ShiftVaultList,
  type ShiftCashBody,
  type ShiftCloseBody,
  type ShiftForceCloseBody,
  type ShiftOpenBody,
  type ShiftStatus,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the history asks for: a cashier gets their own shifts, cash.view the caller's branches. */
export interface ShiftListParams {
  branch_id?: string;
  employee_id?: string;
  status?: ShiftStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const shiftKeys = {
  all: (orgId: string | null) => ['shifts', orgId] as const,
  list: (orgId: string | null, params: ShiftListParams) =>
    ['shifts', orgId, 'list', params] as const,
  current: (orgId: string | null) => ['shifts', orgId, 'current'] as const,
  one: (orgId: string | null, id: string) => ['shifts', orgId, 'one', id] as const,
  vaults: (orgId: string | null, branchId: string) =>
    ['shifts', orgId, 'vaults', branchId] as const,
};

/** K02 shifts (D60): open with a float, move cash to and from a safe, close with a count. */
export const shiftsApi = {
  list: async (params: ShiftListParams = {}) =>
    ShiftList.parse((await api.get('/api/shifts', { params })).data),
  /** The caller's open shift, or null. */
  current: async () => CurrentShift.parse((await api.get('/api/shifts/current')).data).shift,
  get: async (id: string) => Shift.parse((await api.get(`/api/shifts/${id}`)).data),
  /** The branch's active safes by name (no balances). */
  vaults: async (branchId: string) =>
    ShiftVaultList.parse(
      (await api.get('/api/shifts/vaults', { params: { branch_id: branchId } })).data,
    ).items,
  /** `key` is made once per form: a second click opens the same shift, not a new one. */
  open: async (body: ShiftOpenBody, key: string) =>
    Shift.parse(
      (await api.post('/api/shifts', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  /** `key` is made once per dialog. */
  cash: async (id: string, body: ShiftCashBody, key: string) =>
    Shift.parse(
      (await api.post(`/api/shifts/${id}/cash`, body, { headers: { 'Idempotency-Key': key } }))
        .data,
    ),
  /** EC-147: a manager closes a shift without the lost device's token. */
  forceClose: async (id: string, body: ShiftForceCloseBody) =>
    Shift.parse((await api.post(`/api/shifts/${id}/force-close`, body)).data),
  /** A closed shift is answered unchanged, so a repeat is safe. */
  close: async (id: string, body: ShiftCloseBody) =>
    Shift.parse((await api.post(`/api/shifts/${id}/close`, body)).data),
};
