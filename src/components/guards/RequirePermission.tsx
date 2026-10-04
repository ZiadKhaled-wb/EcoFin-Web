import type { PermissionKey } from '@ecotech/contracts';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { usePermissions } from '@/features/me/usePermissions';
import ForbiddenPage from '@/pages/ForbiddenPage';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

/**
 * Route guard by permission (D18). Typing the URL without the permission shows the 403 page;
 * it is not only a hidden link. Fails closed: while permissions load nothing is shown, and if
 * they cannot be loaded the user gets a retry, never the page. The server still checks every call.
 * Use as a layout route (`<Route element={<RequirePermission permission="…" />}>`) or around children.
 */
export default function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children?: ReactNode;
}) {
  const token = useAuthStore((s) => s.accessToken);
  const perms = usePermissions();

  if (!token) return <Navigate to="/login" replace />;
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
  if (!perms.data.keys.includes(permission)) return <ForbiddenPage />;
  return children ?? <Outlet />;
}
