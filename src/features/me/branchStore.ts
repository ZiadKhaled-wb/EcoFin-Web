import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The branch the user is working in, per shop. The contract defines no branch header, so this is
 * client-side only: pages pass the branch id in the request body or query where an endpoint takes
 * one. The server still checks branch access on every call.
 */
interface BranchState {
  /** shop id -> chosen branch id */
  byOrg: Record<string, string>;
  select: (orgId: string, branchId: string) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      byOrg: {},
      select: (orgId, branchId) => set((s) => ({ byOrg: { ...s.byOrg, [orgId]: branchId } })),
    }),
    { name: 'ecofin-branch', version: 1 },
  ),
);
