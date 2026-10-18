import {
  ContractChangeHistory,
  ContractChangeListPage,
  ContractChangeResponse,
  ReschedulePreview,
  SettlementQuote,
  SettleResponse,
  type ContractChangeListQueryInput,
  type ReschedulePreviewBody,
  type RescheduleBody,
  type SettleBody,
  type WriteOffBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const contractChangeKeys = {
  all: (orgId: string | null) => ['contract-changes', orgId] as const,
  quote: (orgId: string | null, id: string) => ['contract-changes', orgId, 'quote', id] as const,
  /** `body` is the plan as text: a changed plan is a new preview. */
  preview: (orgId: string | null, id: string, body: string) =>
    ['contract-changes', orgId, 'preview', id, body] as const,
  history: (orgId: string | null, id: string) =>
    ['contract-changes', orgId, 'history', id] as const,
  list: (orgId: string | null, query: ContractChangeListQueryInput) =>
    ['contract-changes', orgId, 'list', query] as const,
};

const keyed = (key: string) => ({ headers: { 'Idempotency-Key': key } });

/**
 * N05 early settlement, rescheduling, write-off (D80). The server works out every number (the
 * payoff, the suggested waiver and its limit, the new schedule) and refuses anything that would
 * add to what a customer owes (Islamic finance rule 5); the screen shows its answers.
 */
export const contractChangesApi = {
  quote: async (id: string) =>
    SettlementQuote.parse((await api.get(`/api/contracts/${id}/settlement-quote`)).data),
  /** In the caller's open shift: the payoff minus the waiver is collected; the contract closes. */
  settle: async (id: string, body: SettleBody, key: string) =>
    SettleResponse.parse((await api.post(`/api/contracts/${id}/settle`, body, keyed(key))).data),
  previewReschedule: async (id: string, body: ReschedulePreviewBody) =>
    ReschedulePreview.parse((await api.post(`/api/contracts/${id}/reschedule/preview`, body)).data),
  reschedule: async (id: string, body: RescheduleBody, key: string) =>
    ContractChangeResponse.parse(
      (await api.post(`/api/contracts/${id}/reschedule`, body, keyed(key))).data,
    ),
  /** The owner only. */
  writeOff: async (id: string, body: WriteOffBody, key: string) =>
    ContractChangeResponse.parse(
      (await api.post(`/api/contracts/${id}/write-off`, body, keyed(key))).data,
    ),
  history: async (id: string) =>
    ContractChangeHistory.parse((await api.get(`/api/contracts/${id}/changes`)).data),
  list: async (query: ContractChangeListQueryInput) =>
    ContractChangeListPage.parse((await api.get('/api/contract-changes', { params: query })).data),
};
