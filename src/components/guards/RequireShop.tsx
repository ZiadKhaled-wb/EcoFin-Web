import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/** A login with several shops must pick one before anything else. */
export default function RequireShop() {
  const orgId = useAuthStore((s) => s.orgId);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  if (!orgId) return <Navigate to="/select-shop" replace />;
  return <Outlet />;
}
