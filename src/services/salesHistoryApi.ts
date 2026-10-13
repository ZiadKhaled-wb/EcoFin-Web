import {
  SaleHistoryDetails,
  SaleReceiptPrint,
  SalesHistoryQuery,
  SalesHistoryResponse,
  SaleVoidResponse,
  type SalesHistoryQuery as HistoryQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const salesHistoryApi = {
  list: async (query: HistoryQuery) =>
    SalesHistoryResponse.parse(
      (await api.get('/api/sales', { params: SalesHistoryQuery.parse(query) })).data,
    ),
  get: async (id: string) => SaleHistoryDetails.parse((await api.get(`/api/sales/${id}`)).data),
  /** S04 (D68): logs one print of the receipt; the server answers its number (1 = the original). */
  recordReceiptPrint: async (id: string) =>
    SaleReceiptPrint.parse((await api.post(`/api/sales/${id}/receipt-prints`)).data),
  void: async (id: string, reason: string, key: string) =>
    SaleVoidResponse.parse(
      (await api.post(`/api/sales/${id}/void`, { reason }, { headers: { 'Idempotency-Key': key } }))
        .data,
    ),
};
