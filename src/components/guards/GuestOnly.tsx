import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function GuestOnly() {
  const token = useAuthStore((s) => s.accessToken);
  if (token) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
