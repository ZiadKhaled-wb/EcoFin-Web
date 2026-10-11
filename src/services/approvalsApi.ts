import {
  DiscountApproval,
  DiscountApprovalList,
  DiscountApprovalRequested,
  DiscountApprovalResult,
  type DiscountApprovalDecideBody,
  type DiscountApprovalRequestBody,
  type DiscountApprovalStatus,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const approvalKeys = {
  all: (orgId: string | null) => ['discount-approvals', orgId] as const,
  list: (orgId: string | null, status: DiscountApprovalStatus) =>
    ['discount-approvals', orgId, 'list', status] as const,
  one: (orgId: string | null, id: string) => ['discount-approvals', orgId, 'one', id] as const,
};

/**
 * S03 (D65): an over-cap discount is approved on the spot. The cashier asks for exactly this cart
 * (the server keeps its fingerprint), a manager decides from their own session, and the cashier
 * sends the sale with `discount_approval_id` (one sale, 15 minutes). The POS screen (S06) uses the
 * cashier's calls; the manager's page uses `list` and `decideApproval`.
 */
export const approvalsApi = {
  requestDiscountApproval: async (body: DiscountApprovalRequestBody) =>
    DiscountApprovalRequested.parse((await api.post('/api/sales/discount-approvals', body)).data),
  getDiscountApproval: async (id: string) =>
    DiscountApproval.parse((await api.get(`/api/sales/discount-approvals/${id}`)).data),
  cancelDiscountApproval: async (id: string) =>
    DiscountApprovalResult.parse(
      (await api.post(`/api/sales/discount-approvals/${id}/cancel`)).data,
    ),
  /** discount.above_cap: the requests of the caller's branches (waiting ones by default). */
  list: async (status: DiscountApprovalStatus = 'pending') =>
    DiscountApprovalList.parse(
      (await api.get('/api/approvals', { params: { kind: 'discount_above_cap', status } })).data,
    ),
  /** discount.above_cap, not the requester. */
  decideApproval: async (id: string, body: DiscountApprovalDecideBody) =>
    DiscountApprovalResult.parse((await api.post(`/api/approvals/${id}/decide`, body)).data),
};
