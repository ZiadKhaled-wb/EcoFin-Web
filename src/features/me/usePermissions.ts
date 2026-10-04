import { useQuery } from '@tanstack/react-query';
import { meApi } from '@/features/me/meApi';
import { useAuthStore } from '@/store/authStore';

/** Query keys include the active shop, so switching shop never shows another shop's data. */
export const meKeys = {
  me: (orgId: string | null) => ['me', orgId] as const,
  permissions: (orgId: string | null) => ['me', 'permissions', orgId] as const,
};

/**
 * The signed-in user's permission keys and branch access (`GET /api/me/permissions`).
 * F06 builds `useCan`, `<Can>` and the branch hooks on top of this.
 */
export function usePermissions() {
  const orgId = useAuthStore((s) => s.orgId);
  const enabled = useAuthStore((s) => !!s.accessToken && !!s.orgId);
  return useQuery({
    queryKey: meKeys.permissions(orgId),
    queryFn: meApi.permissions,
    enabled,
    staleTime: 60_000,
  });
}
