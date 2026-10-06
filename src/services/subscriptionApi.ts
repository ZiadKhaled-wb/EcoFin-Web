import {
  AdminSubscription,
  SubscriptionStatus,
  SubscriptionPlanBody,
  SubscriptionPlanResponse,
  SubscriptionDatesBody,
  SubscriptionDatesResponse,
  SubscriptionPaymentBody,
  SubscriptionPaymentResponse,
  type SubscriptionPlanBody as PlanBody,
  type SubscriptionDatesBody as DatesBody,
  type SubscriptionPaymentBody as PaymentBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const subscriptionApi = {
  status: () => api.get<unknown>('/api/subscription').then((r) => SubscriptionStatus.parse(r.data)),
  adminStatus: (id: string) =>
    api
      .get<unknown>('/api/admin/shops/' + id + '/subscription')
      .then((r) => AdminSubscription.parse(r.data)),
  plan: (id: string, body: PlanBody) =>
    api
      .post<unknown>('/api/admin/shops/' + id + '/plan', SubscriptionPlanBody.parse(body))
      .then((r) => SubscriptionPlanResponse.parse(r.data)),
  dates: (id: string, body: DatesBody) =>
    api
      .post<unknown>(
        '/api/admin/shops/' + id + '/subscription-dates',
        SubscriptionDatesBody.parse(body),
      )
      .then((r) => SubscriptionDatesResponse.parse(r.data)),
  payment: (id: string, body: PaymentBody, key: string) =>
    api
      .post<unknown>('/api/admin/shops/' + id + '/payments', SubscriptionPaymentBody.parse(body), {
        headers: { 'Idempotency-Key': key },
      })
      .then((r) => SubscriptionPaymentResponse.parse(r.data)),
};
