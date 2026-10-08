import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function GuestOnly() {
  const token = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.orgId);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  // P02: the login right after an invite goes to the setup wizard (same fixed value as LoginPage;
  // this guard re-renders as soon as the session is set, so it must agree).
  const afterInvite =
    (useLocation().state as { afterLogin?: string } | null)?.afterLogin === 'onboarding';
  if (!token) return <Outlet />;
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  if (!orgId) return <Navigate to="/select-shop" replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  return <Navigate to={afterInvite ? '/onboarding' : '/dashboard'} replace />;
}
