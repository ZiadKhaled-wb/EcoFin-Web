import { usePermissions } from '@/features/me/usePermissions';

/**
 * True when the signed-in employee may work in `branchId` (F06 branch scope): the owner works in
 * every branch (`allBranches`), anyone else only in their assigned ones. Fails closed while
 * loading, on error, or without a branch id.
 */
export function useBranchAccess(branchId: string | null | undefined): boolean {
  const { data } = usePermissions();
  if (!data || !branchId) return false;
  return data.allBranches || data.branchIds.includes(branchId);
}
