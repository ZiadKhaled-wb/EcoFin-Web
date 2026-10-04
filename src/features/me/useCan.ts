import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { usePermissions } from '@/features/me/usePermissions';

/**
 * True when the signed-in employee holds `permission` (F06). Fails closed: false while the
 * permissions load or when they can't be loaded. Hiding UI is a convenience only; the server
 * checks every endpoint (`requirePermission`).
 */
export function useCan(permission: PermissionKey): boolean {
  const { data } = usePermissions();
  return data?.keys.includes(permission) ?? false;
}
