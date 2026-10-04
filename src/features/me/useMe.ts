import { useQuery } from '@tanstack/react-query';
import { meApi } from '@/features/me/meApi';
import { meKeys } from '@/features/me/usePermissions';
import { useAuthStore } from '@/store/authStore';

/** The signed-in employee, shop and branch list (`GET /api/auth/me`). */
export function useMe() {
  const orgId = useAuthStore((s) => s.orgId);
  const enabled = useAuthStore((s) => !!s.accessToken && !!s.orgId);
  return useQuery({ queryKey: meKeys.me(orgId), queryFn: meApi.me, enabled, staleTime: 60_000 });
}
