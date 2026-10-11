import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DiscountApprovalDecideBody,
  DiscountApprovalRequestBody,
} from '@ziadkhaled-wb/contracts';
import { approvalKeys, approvalsApi } from '@/services/approvalsApi';
import { useAuthStore } from '@/store/authStore';

/** The manager's list and the menu badge refresh this often while they are open. */
export const APPROVALS_REFRESH_MS = 15_000;
/** The cashier waits for the manager's decision and looks this often. */
const WAITING_REFRESH_MS = 3_000;

/** The over-cap requests waiting for the caller (discount.above_cap); one query for the page and the badge. */
export function usePendingDiscountApprovals(enabled = true) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: approvalKeys.list(orgId, 'pending'),
    queryFn: () => approvalsApi.list('pending'),
    enabled,
    refetchInterval: APPROVALS_REFRESH_MS,
  });
}

/** Approves or rejects a request; the lists (and so the badge) are refreshed. */
export function useDecideApproval() {
  const cache = useQueryClient();
  const orgId = useAuthStore((s) => s.orgId);
  return useMutation({
    mutationFn: (v: { id: string } & DiscountApprovalDecideBody) =>
      approvalsApi.decideApproval(v.id, {
        approve: v.approve,
        ...(v.note ? { note: v.note } : {}),
      }),
    onSettled: () => cache.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
  });
}

/** The cashier asks for an approval of the cart (the POS screen, S06, calls this). */
export function useRequestDiscountApproval() {
  return useMutation({
    mutationFn: (body: DiscountApprovalRequestBody) => approvalsApi.requestDiscountApproval(body),
  });
}

/** One request, looked at again every few seconds until it is decided. */
export function useDiscountApproval(id: string | null) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: approvalKeys.one(orgId, id ?? ''),
    queryFn: () => approvalsApi.getDiscountApproval(id!),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? WAITING_REFRESH_MS : false,
  });
}

/** The cashier takes a pending request back. */
export function useCancelDiscountApproval() {
  const cache = useQueryClient();
  const orgId = useAuthStore((s) => s.orgId);
  return useMutation({
    mutationFn: (id: string) => approvalsApi.cancelDiscountApproval(id),
    onSettled: () => cache.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
  });
}
