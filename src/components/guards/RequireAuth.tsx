import { Navigate, Outlet } from 'react-router-dom';
import { useSilentRefresh } from '@/hooks/useSilentRefresh';
import { useAuthStore } from '@/store/authStore';

/** Needs a session. Keeps it alive with the silent refresh. */
export default function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  useSilentRefresh();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
