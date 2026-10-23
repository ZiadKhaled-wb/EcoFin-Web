import {
  Quotation,
  QuotationCreated,
  QuotationList,
  type CreateQuotationBody,
  type UpdateQuotationBody,
  type QuotationListQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const quotationsApi = {
  list: async (params: Partial<QuotationListQuery> = {}) =>
    QuotationList.parse((await api.get('/api/quotations', { params })).data),
  get: async (id: string) => Quotation.parse((await api.get('/api/quotations/' + id)).data),
  create: async (body: CreateQuotationBody, key: string) =>
    QuotationCreated.parse(
      (await api.post('/api/quotations', body, { headers: { 'Idempotency-Key': key } })).data,
    ),
  update: async (id: string, body: UpdateQuotationBody) =>
    Quotation.parse((await api.put('/api/quotations/' + id, body)).data),
  move: async (id: string, action: 'send' | 'accept' | 'reject' | 'cancel', reason?: string) =>
    Quotation.parse((await api.post('/api/quotations/' + id + '/' + action, { reason })).data),
};
