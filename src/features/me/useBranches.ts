import { useQuery } from '@tanstack/react-query';
import { branchApi } from '@/services/branchApi';
import { useAuthStore } from '@/store/authStore';
export const branchKeys = {
  list: (orgId: string | null) => ['branches', orgId] as const,
  manage: (orgId: string | null) => ['branches-manage', orgId] as const,
};
export function useBranches() {
  const orgId = useAuthStore((s) => s.orgId);
  const enabled = useAuthStore((s) => !!s.accessToken && !!s.orgId);
  return useQuery({
    queryKey: branchKeys.list(orgId),
    queryFn: branchApi.list,
    enabled,
    staleTime: 60_000,
  });
}
