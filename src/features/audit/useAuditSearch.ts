import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditApi, type AuditSearchParams } from '@/features/audit/auditApi';
import { useAuthStore } from '@/store/authStore';

/** One page of the audit log. The key carries the shop, so switching shops never mixes logs;
 * the previous page stays on screen while the next one loads. */
export function useAuditSearch(params: AuditSearchParams) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: ['audit', orgId, params],
    queryFn: () => auditApi.search(params),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}
