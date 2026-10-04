import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import type { ReactNode } from 'react';
import { useCan } from '@/features/me/useCan';

/**
 * Renders `children` only when the employee holds `permission`, else `fallback` (nothing by
 * default). For whole pages use `<RequirePermission>` (403 page) instead.
 *   <Can permission="employee.manage"><Button>…</Button></Can>
 */
export default function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return useCan(permission) ? children : fallback;
}
