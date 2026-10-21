import {
  Collection,
  CollectorRoute,
  Customer,
  MyWallet,
  WalletListResponse,
  WalletMovementPage,
  WalletSettlement,
  type CollectorRouteQuery,
  type FieldCollectionBody,
  type SetCustomerCollectorBody,
  type SettleWalletBody,
  type WalletListQuery,
  type WalletMovementQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const walletKeys = {
  all: (orgId: string | null) => ['wallets', orgId] as const,
  mine: (orgId: string | null) => ['wallets', orgId, 'mine'] as const,
  list: (orgId: string | null, query: WalletListQuery = {}) =>
    ['wallets', orgId, 'list', query] as const,
  ledger: (orgId: string | null, id: string, query: WalletMovementQuery) =>
    ['wallets', orgId, 'ledger', id, query] as const,
  route: (orgId: string | null, query: CollectorRouteQuery) =>
    ['wallets', orgId, 'route', query] as const,
};

const keyed = (key: string) => ({ headers: { 'Idempotency-Key': key } });

/**
 * N06 collector wallets (D81). The server decides everything (who may collect for a customer, what
 * the wallet holds, the settlement, the route); the screens show its answers. A collector is paid a
 * salary: there is no commission anywhere, and a shortage is only recorded, never deducted.
 */
export const walletsApi = {
  /** N03's collection taken in the field: the cash goes into the caller's own wallet, no shift. */
  collectField: async (body: FieldCollectionBody, key: string) =>
    Collection.parse((await api.post('/api/collections/field', body, keyed(key))).data),
  mine: async () => MyWallet.parse((await api.get('/api/wallets/me')).data),
  list: async (query: WalletListQuery = {}) =>
    WalletListResponse.parse((await api.get('/api/wallets', { params: query })).data),
  ledger: async (id: string, query: WalletMovementQuery) =>
    WalletMovementPage.parse(
      (await api.get(`/api/wallets/${id}/movements`, { params: query })).data,
    ),
  /** Hand the cash in: part of it is allowed; a shortage needs a reason and is only recorded. */
  settle: async (id: string, body: SettleWalletBody, key: string) =>
    WalletSettlement.parse((await api.post(`/api/wallets/${id}/settle`, body, keyed(key))).data),
  /** Assign, change or clear (`employee_id: null`) the customer's collector. */
  setCollector: async (customerId: string, body: SetCustomerCollectorBody) =>
    Customer.parse((await api.put(`/api/customers/${customerId}/collector`, body)).data),
  route: async (query: CollectorRouteQuery = {}) =>
    CollectorRoute.parse((await api.get('/api/collectors/route', { params: query })).data),
};
