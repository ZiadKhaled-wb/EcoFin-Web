import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The branch each user last picked on the dashboard, per shop and user (localStorage). '' means
 * "All branches". A user who never picked has no entry, so the default applies: all branches for
 * someone who can see more than one, their own branch otherwise.
 */
interface DashboardBranchState {
  /** `${shopId}:${userId}` -> branch id, or '' for all branches */
  chosen: Record<string, string>;
  choose: (key: string, branchId: string) => void;
}

export const useDashboardBranchStore = create<DashboardBranchState>()(
  persist(
    (set) => ({
      chosen: {},
      choose: (key, branchId) => set((s) => ({ chosen: { ...s.chosen, [key]: branchId } })),
    }),
    { name: 'ecofin-dashboard-branch', version: 1 },
  ),
);
