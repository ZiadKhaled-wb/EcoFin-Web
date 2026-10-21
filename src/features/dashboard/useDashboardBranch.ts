import { useBranches } from '@/features/me/useBranches';
import { useMe } from '@/features/me/useMe';
import { useAuthStore } from '@/store/authStore';
import { useDashboardBranchStore } from './dashboardBranchStore';

/**
 * The branch the dashboard shows ('' = all branches) and the branches to pick from. The choice is
 * remembered per user. Without one: all branches for someone who can see more than one, their
 * default branch (else the only one) otherwise. A remembered branch the user can no longer see is
 * ignored.
 */
export function useDashboardBranch() {
  const orgId = useAuthStore((s) => s.orgId);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const key = orgId && userId ? `${orgId}:${userId}` : null;
  const chosen = useDashboardBranchStore((s) => (key ? s.chosen[key] : undefined));
  const choose = useDashboardBranchStore((s) => s.choose);
  const me = useMe();
  const available = useBranches();
  const branches = available.data ?? [];

  const own = branches.find((b) => b.id === me.data?.employee.defaultBranchId) ?? branches[0];
  const fallback = branches.length > 1 ? '' : (own?.id ?? '');
  const valid = chosen !== undefined && (chosen === '' || branches.some((b) => b.id === chosen));
  // A single-branch user can only be on their branch ('' would be the same data).
  const branchId = valid && (branches.length > 1 || chosen !== '') ? chosen : fallback;

  return {
    branches,
    branchId,
    /** False until the branch list is known: the dashboard waits so it never asks twice. */
    ready: !available.isPending && !me.isPending,
    select: (id: string) => {
      if (key) choose(key, id);
    },
  };
}
