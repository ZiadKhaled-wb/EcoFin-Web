import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/services/settingsApi';
import { useAuthStore } from '@/store/authStore';

export const settingsKeys = {
  settings: (orgId: string | null) => ['settings', orgId] as const,
  policies: (orgId: string | null) => ['settings-policies', orgId] as const,
};

/** The shop's settings. Every employee may read them (receipt, VAT and discount rules). */
export function useSettings() {
  const orgId = useAuthStore((s) => s.orgId);
  const enabled = useAuthStore((s) => !!s.accessToken && !!s.orgId);
  return useQuery({
    queryKey: settingsKeys.settings(orgId),
    queryFn: settingsApi.get,
    enabled,
    staleTime: 60_000,
  });
}
