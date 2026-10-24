import { useQuery } from '@tanstack/react-query';
import { subscriptionApi } from '@/services/subscriptionApi';
import { useAuthStore } from '@/store/authStore';

/**
 * The modules of the shop's plan, once the subscription status has loaded (same query as the
 * banner), or undefined while it loads or when it can't be read. The menu uses it to hide an item
 * whose module the plan lacks; undefined hides nothing, because the server checks the module on
 * every call anyway.
 */
export function useShopModules(): readonly string[] | undefined {
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: ['subscription', orgId],
    queryFn: subscriptionApi.status,
    enabled: !!orgId,
    staleTime: 0,
  });
  return query.data?.modules;
}
