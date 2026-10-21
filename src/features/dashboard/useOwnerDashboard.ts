import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dashboardApi, dashboardKeys } from '@/services/dashboardApi';
import { useAuthStore } from '@/store/authStore';

/** The dashboard refreshes this often while the page is visible (D01 owner question 4). */
export const DASHBOARD_REFRESH_MS = 60_000;

/**
 * The owner dashboard of a branch ('' = all branches). The interval pauses while the tab is hidden
 * (`refetchIntervalInBackground` off), and the previous numbers stay on screen while a new branch
 * loads.
 */
export function useOwnerDashboard(branchId: string) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: dashboardKeys.one(orgId, branchId || null),
    queryFn: () => dashboardApi.get(branchId || null),
    refetchInterval: DASHBOARD_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: DASHBOARD_REFRESH_MS / 2,
    placeholderData: keepPreviousData,
  });
}
