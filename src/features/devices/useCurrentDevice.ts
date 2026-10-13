import { useQuery } from '@tanstack/react-query';
import { deviceKeys, devicesApi } from '@/services/devicesApi';
import { useAuthStore } from '@/store/authStore';
import { useDeviceToken } from './deviceToken';

/**
 * O03: the POS device this computer is paired with in the active shop. Without a stored token
 * the answer is known (no device) and the server is not asked. `loading` is true only while a
 * stored token is being checked.
 */
export function useCurrentDevice() {
  const orgId = useAuthStore((s) => s.orgId);
  const signedIn = useAuthStore((s) => !!s.accessToken);
  const token = useDeviceToken(orgId);
  const query = useQuery({
    queryKey: deviceKeys.current(orgId, token),
    queryFn: devicesApi.current,
    enabled: signedIn && !!orgId && !!token,
    staleTime: 60_000,
  });
  return {
    device: token ? (query.data ?? null) : null,
    loading: !!token && query.isPending,
  };
}
