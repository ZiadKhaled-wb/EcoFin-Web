import { useBranchStore } from '@/features/me/branchStore';
import { useMe } from '@/features/me/useMe';
import { useAuthStore } from '@/store/authStore';

/**
 * Branches from `me` and the chosen one. Falls back to the employee's default branch, then the
 * main branch, then the first one, when nothing (or a stale id) was chosen.
 */
export function useSelectedBranch() {
  const orgId = useAuthStore((s) => s.orgId);
  const chosen = useBranchStore((s) => (orgId ? s.byOrg[orgId] : undefined));
  const select = useBranchStore((s) => s.select);
  const me = useMe();

  const branches = me.data?.branches ?? [];
  const branch =
    branches.find((b) => b.id === chosen) ??
    branches.find((b) => b.id === me.data?.employee.defaultBranchId) ??
    branches.find((b) => b.isMain) ??
    branches[0];

  return {
    branches,
    branch,
    isLoading: me.isLoading,
    isError: me.isError,
    selectBranch: (branchId: string) => {
      if (orgId) select(orgId, branchId);
    },
  };
}
