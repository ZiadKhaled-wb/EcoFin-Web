import { useBranchStore } from '@/features/me/branchStore';
import { useMe } from '@/features/me/useMe';
import { useBranches } from '@/features/me/useBranches';
import { useAuthStore } from '@/store/authStore';

/**
 * Active accessible branches and the chosen one. Falls back to the employee's default branch, then the
 * main branch, then the first one, when nothing (or a stale id) was chosen.
 */
export function useSelectedBranch() {
  const orgId = useAuthStore((s) => s.orgId);
  const chosen = useBranchStore((s) => (orgId ? s.byOrg[orgId] : undefined));
  const select = useBranchStore((s) => s.select);
  const me = useMe();
  const available = useBranches();

  const branches = available.data ?? [];
  const branch =
    branches.find((b) => b.id === chosen) ??
    branches.find((b) => b.id === me.data?.employee.defaultBranchId) ??
    branches.find((b) => b.is_main) ??
    branches[0];

  return {
    branches,
    branch,
    currentBranchId: branch?.id ?? null,
    isLoading: available.isLoading,
    isError: available.isError,
    selectBranch: (branchId: string) => {
      if (orgId) select(orgId, branchId);
    },
  };
}
