import { Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import ForbiddenPage from '@/pages/ForbiddenPage';
export default function RequireSuperAdmin() {
  const allowed = useAuthStore((s) => s.isSuperAdmin);
  return allowed ? <Outlet /> : <ForbiddenPage />;
}
