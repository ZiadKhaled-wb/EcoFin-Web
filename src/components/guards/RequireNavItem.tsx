import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { canSee, type NavItem } from '@/config/navigation';
import { usePermissions } from '@/features/me/usePermissions';
import ForbiddenPage from '@/pages/ForbiddenPage';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

/**
 * Route guard for a menu item's page (INT-1): typing the URL of a menu item the user can't see
 * shows the 403 page, by the same rule as the menu (canSee: role or permission). Fails closed
 * like RequirePermission. The server still checks every call.
 */
export default function RequireNavItem({ item, children }: { item: NavItem; children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (perms.isPending) return <LoadingState />;
  if (perms.isError) {
    return (
      <ErrorState
        title={t('shell.permissionsFailed.title')}
        description={t('shell.permissionsFailed.description')}
        onRetry={() => void perms.refetch()}
      />
    );
  }
  if (!canSee(item, { ...user, permissions: [...perms.data.keys] })) return <ForbiddenPage />;
  return children;
}
