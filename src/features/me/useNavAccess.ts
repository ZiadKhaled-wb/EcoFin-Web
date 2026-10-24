import { canSee, isLegalOnly, navLeaves } from '@/config/navigation';
import { usePermissions } from '@/features/me/usePermissions';
import { useAuthStore } from '@/store/authStore';

/** True when the signed-in employee may see the menu item `id`: the same rule as the menu and the route guard. */
export function useNavAccess(id: string): boolean {
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();
  const item = navLeaves().find((i) => i.id === id);
  if (!user || !perms.data || !item) return false;
  return canSee(item, { ...user, permissions: [...perms.data.keys] });
}

/** L01: true for a lawyer (the legal and overdue keys only): no dashboard, no customers, no sales. */
export function useIsLegalOnly(): boolean {
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();
  if (!user || !perms.data) return false;
  return isLegalOnly({ ...user, permissions: [...perms.data.keys] });
}
