import {
  Collection,
  CollectionPreview,
  ContractListPage,
  type CollectionBody,
  type ContractListQueryInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const collectionKeys = {
  all: (orgId: string | null) => ['collections', orgId] as const,
  contracts: (orgId: string | null, query: ContractListQueryInput) =>
    ['collections', orgId, 'contracts', query] as const,
  /** `amount` '' = only what is due. */
  preview: (orgId: string | null, contractId: string, amount: string) =>
    ['collections', orgId, 'preview', contractId, amount] as const,
  receipt: (orgId: string | null, id: string) => ['collections', orgId, 'receipt', id] as const,
};

/**
 * N03 collections (D78). The server allocates every amount (oldest installment first, its profit
 * then its principal) and refuses more than what is left; the screen only shows its answers. No
 * late fees (Islamic finance rule 4).
 */
export const collectionsApi = {
  /** The shop's contracts; holders of the collection keys see every branch. */
  contracts: async (query: ContractListQueryInput) =>
    ContractListPage.parse((await api.get('/api/contracts', { params: query })).data),
  /** What is due on a contract and, with an amount, what it would pay. */
  preview: async (contractId: string, amount?: string) =>
    CollectionPreview.parse(
      (
        await api.get(`/api/contracts/${contractId}/collection`, {
          params: amount ? { amount } : {},
        })
      ).data,
    ),
  /** One collection on one or several contracts. `key`: one attempt, one receipt. */
  collect: async (body: CollectionBody, key: string) =>
    Collection.parse(
      (await api.post('/api/collections', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  receipt: async (id: string) => Collection.parse((await api.get(`/api/collections/${id}`)).data),
  /** The print log: the first print is the original, later ones copies. */
  recordPrint: async (id: string) =>
    Collection.parse((await api.post(`/api/collections/${id}/prints`)).data),
  /** Same business day, the latest collection of its contracts (collection.reverse). */
  reverse: async (id: string, reason: string, key: string) =>
    Collection.parse(
      (
        await api.post(
          `/api/collections/${id}/reverse`,
          { reason },
          { headers: { 'Idempotency-Key': key } },
        )
      ).data,
    ),
};
