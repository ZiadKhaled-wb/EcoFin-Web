import {
  SalesOrder,
  SalesOrderList,
  type CancelSalesOrderBody,
  type CreateSalesOrderBody,
  type LinkOrderLineBody,
  type OrderDepositBody,
  type OrderFromQuotationBody,
  type ReserveOrderLineBody,
  type SalesOrderListQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

const withKey = (key: string) => ({ headers: { 'Idempotency-Key': key } });
const line = (id: string, lineId: string) => `/api/orders/${id}/lines/${lineId}`;

/**
 * S10 sales orders. Every write answers with the whole order. Create, from-quotation, deposit and
 * cancel carry the caller's `Idempotency-Key`. A deposit and a cash refund on cancel post to the
 * open shift of this computer: the shared client adds the POS `x-device-token` to every request,
 * as it does for the POS sale.
 */
export const salesOrdersApi = {
  list: async (params: Partial<SalesOrderListQuery> = {}) =>
    SalesOrderList.parse((await api.get('/api/orders', { params })).data),
  get: async (id: string) => SalesOrder.parse((await api.get(`/api/orders/${id}`)).data),
  create: async (body: CreateSalesOrderBody, key: string) =>
    SalesOrder.parse((await api.post('/api/orders', body, withKey(key))).data),
  fromQuote: async (quotationId: string, body: OrderFromQuotationBody, key: string) =>
    SalesOrder.parse(
      (await api.post(`/api/quotations/${quotationId}/order`, body, withKey(key))).data,
    ),
  deposit: async (id: string, body: OrderDepositBody, key: string) =>
    SalesOrder.parse((await api.post(`/api/orders/${id}/deposits`, body, withKey(key))).data),
  reserve: async (id: string, lineId: string, body: ReserveOrderLineBody = {}) =>
    SalesOrder.parse((await api.post(`${line(id, lineId)}/reserve`, body)).data),
  linkPo: async (id: string, lineId: string, body: LinkOrderLineBody) =>
    SalesOrder.parse((await api.post(`${line(id, lineId)}/link-po`, body)).data),
  cancel: async (id: string, body: CancelSalesOrderBody, key: string) =>
    SalesOrder.parse((await api.post(`/api/orders/${id}/cancel`, body, withKey(key))).data),
};
