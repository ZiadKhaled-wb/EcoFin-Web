import { useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';

/**
 * Deactivates or reactivates an employee (EC-145). Every employees query (the list and any
 * employee's detail) is keyed under `['employees', orgId]`, so one invalidation refreshes both.
 */
export function useSetEmployeeActive() {
  const cache = useQueryClient();
  const org = useAuthStore((s) => s.orgId);
  return useMutation({
    mutationFn: (v: { employeeId: string; active: boolean; reason: string }) =>
      staffApi.setEmployeeActive(v.employeeId, { active: v.active, reason: v.reason }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['employees', org] }),
  });
}
