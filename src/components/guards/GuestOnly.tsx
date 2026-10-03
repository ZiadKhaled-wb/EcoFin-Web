import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function GuestOnly() {
  const token = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.orgId);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  if (!token) return <Outlet />;
  if (!orgId) return <Navigate to="/select-shop" replace />;
  return <Navigate to={mustChange ? '/change-password' : '/dashboard'} replace />;
}
