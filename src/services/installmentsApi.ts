import {
  Contract,
  InstallmentPreview,
  InstallmentSale,
  type InstallmentPreviewBody,
  type InstallmentSaleInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const installmentKeys = {
  all: (orgId: string | null) => ['installments', orgId] as const,
  /** `body` is the preview body as text: changed terms are a new preview. */
  preview: (orgId: string | null, body: string) =>
    ['installments', orgId, 'preview', body] as const,
  contract: (orgId: string | null, id: string) => ['installments', orgId, 'contract', id] as const,
};

/**
 * N01 preview (D76) and N02 installment sale and contract (D77). The server calculates every
 * number (the profit for the whole term, the installment price, the schedule) and checks the
 * customer; the screen only shows its answers.
 */
export const installmentsApi = {
  /** The terms under the shop's current policy, with the customer's checks; nothing is written. */
  preview: async (body: InstallmentPreviewBody) =>
    InstallmentPreview.parse((await api.post('/api/installments/preview', body)).data),
  /** The sale, its down payment and the contract in one request. `key`: one attempt, one sale. */
  sell: async (body: InstallmentSaleInput, key: string) =>
    InstallmentSale.parse(
      (await api.post('/api/installments/sales', body, { headers: { 'Idempotency-Key': key } }))
        .data,
    ),
  contract: async (id: string) => Contract.parse((await api.get(`/api/contracts/${id}`)).data),
};
