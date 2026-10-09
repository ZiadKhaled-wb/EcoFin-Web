import {
  CashAccount,
  CashAccountList,
  CashLedger,
  CashTransfer,
  type CashAccountCreateBody,
  type CashAccountKind,
  type CashAccountStatus,
  type CashOpeningBody,
  type CashTransferCreateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the vaults page asks for. */
export interface CashAccountListParams {
  status?: CashAccountStatus;
  branch_id?: string;
  kind?: CashAccountKind;
}

/** Ledger dates (business dates, YYYY-MM-DD) and paging. */
export interface CashLedgerParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const cashKeys = {
  all: (orgId: string | null) => ['cash', orgId] as const,
  accounts: (orgId: string | null, params: CashAccountListParams) =>
    ['cash', orgId, 'accounts', params] as const,
  ledger: (orgId: string | null, id: string, params: CashLedgerParams) =>
    ['cash', orgId, 'ledger', id, params] as const,
};

const idempotent = (key: string) => ({ headers: { 'Idempotency-Key': key } });

/** K01 vaults (D56): reads need cash.view; the server checks every call. */
export const cashApi = {
  list: async (params: CashAccountListParams = {}) =>
    CashAccountList.parse((await api.get('/api/cash-accounts', { params })).data),
  get: async (id: string) => CashAccount.parse((await api.get(`/api/cash-accounts/${id}`)).data),
  ledger: async (id: string, params: CashLedgerParams = {}) =>
    CashLedger.parse((await api.get(`/api/cash-accounts/${id}/movements`, { params })).data),
  create: async (body: CashAccountCreateBody) =>
    CashAccount.parse((await api.post('/api/cash-accounts', body)).data),
  rename: async (id: string, name: string) =>
    CashAccount.parse((await api.patch(`/api/cash-accounts/${id}`, { name })).data),
  /** Refused with a balance or as a branch's default vault. */
  deactivate: async (id: string) =>
    CashAccount.parse((await api.post(`/api/cash-accounts/${id}/deactivate`)).data),
  reactivate: async (id: string) =>
    CashAccount.parse((await api.post(`/api/cash-accounts/${id}/reactivate`)).data),
  /** One opening balance on an empty account; the same key again changes nothing. */
  opening: async (id: string, body: CashOpeningBody, key: string) =>
    CashAccount.parse(
      (await api.post(`/api/cash-accounts/${id}/opening`, body, idempotent(key))).data,
    ),
  /** The same key returns the same transfer (a double click moves the money once). */
  transfer: async (body: CashTransferCreateBody, key: string) =>
    CashTransfer.parse((await api.post('/api/cash-transfers', body, idempotent(key))).data),
};
