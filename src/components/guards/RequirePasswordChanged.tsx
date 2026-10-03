import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/** Mirrors the server gate (ADR-0004 D5) so we avoid pointless 403s. */
export default function RequirePasswordChanged() {
  const mustChange = useAuthStore((s) => s.user?.must_change_password);
  if (mustChange) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}
