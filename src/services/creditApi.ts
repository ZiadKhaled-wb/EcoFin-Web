import {
  CreditCheck,
  CreditException,
  CreditExceptionList,
  CreditProfile,
  type CreditCheckQuery,
  type CreditExceptionDecideBody,
  type CreditExceptionListQuery,
  type CreditExceptionRequestBody,
  type CreditLimitBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const creditKeys = {
  /** Under the customer, so the customer page's own invalidation covers it. */
  profile: (orgId: string | null, customerId: string) =>
    ['customers', orgId, 'credit', customerId] as const,
  exceptions: (orgId: string | null) => ['credit-exceptions', orgId] as const,
  exceptionList: (orgId: string | null, status: CreditExceptionListQuery['status']) =>
    ['credit-exceptions', orgId, 'list', status] as const,
};

/**
 * R03 credit (D72). The server decides everything (limit, exposure, score, who may): nothing here
 * computes money or credit. A credit exception is an approval on the spot: a cashier asks for a
 * customer and an amount, a manager (credit.approve) decides from their own session, and the
 * installment sale (N02) uses it within 24 hours, for one contract.
 */
export const creditApi = {
  profile: async (customerId: string) =>
    CreditProfile.parse((await api.get(`/api/customers/${customerId}/credit`)).data),
  /** credit.approve. A reason is needed when the limit goes up (CREDIT_REASON_REQUIRED). */
  setLimit: async (customerId: string, body: CreditLimitBody) =>
    CreditProfile.parse((await api.put(`/api/customers/${customerId}/credit-limit`, body)).data),
  /** Would an installment sale of this financed amount pass now? N02's POS screen asks. */
  check: async (customerId: string, query: CreditCheckQuery) =>
    CreditCheck.parse(
      (await api.get(`/api/customers/${customerId}/credit-check`, { params: query })).data,
    ),
  /** sale.create or credit.approve. */
  requestException: async (customerId: string, body: CreditExceptionRequestBody) =>
    CreditException.parse(
      (await api.post(`/api/customers/${customerId}/credit-exceptions`, body)).data,
    ),
  list: async (status: CreditExceptionListQuery['status'] = 'pending') =>
    CreditExceptionList.parse(
      (await api.get('/api/credit-exceptions', { params: { status } })).data,
    ),
  get: async (id: string) =>
    CreditException.parse((await api.get(`/api/credit-exceptions/${id}`)).data),
  /** credit.approve; the requester can't decide their own request, except the owner. */
  decide: async (id: string, body: CreditExceptionDecideBody) =>
    CreditException.parse((await api.post(`/api/credit-exceptions/${id}/decide`, body)).data),
  /** Only the requester, while it is pending. */
  cancel: async (id: string) =>
    CreditException.parse((await api.post(`/api/credit-exceptions/${id}/cancel`)).data),
};
