import { OwnerDashboard } from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const dashboardKeys = {
  all: (orgId: string | null) => ['dashboard', orgId] as const,
  one: (orgId: string | null, branchId: string | null) =>
    ['dashboard', orgId, branchId ?? 'all'] as const,
};

/**
 * D01 owner dashboard (D87). Every number is computed by the server in SQL by the same definition
 * as the page it links to; the browser shows them and never adds money up. A tile the caller
 * cannot open comes back `null`.
 */
export const dashboardApi = {
  get: async (branchId?: string | null) =>
    OwnerDashboard.parse(
      (await api.get('/api/dashboard', { params: branchId ? { branch_id: branchId } : {} })).data,
    ),
};
