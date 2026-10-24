import { Navigate } from 'react-router-dom';
import LoadingState from '@/components/ui/LoadingState';
import { homePath } from '@/config/navigation';
import { usePermissions } from '@/features/me/usePermissions';
import DashboardPage from '@/pages/DashboardPage';
import { useAuthStore } from '@/store/authStore';

/**
 * The first page after sign-in (the login and the root address both go to /dashboard). A lawyer has
 * no dashboard: whoever holds only the legal and overdue keys goes to /legal instead (L01, D92).
 * The rule is `homePath`, the same one the menu uses to hide the dashboard (`isLegalOnly`).
 */
export default function HomeGate() {
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();
  if (user && perms.isPending) return <LoadingState />;
  if (user && perms.data) {
    const where = homePath({ ...user, permissions: [...perms.data.keys] });
    if (where !== '/dashboard') return <Navigate to={where} replace />;
  }
  return <DashboardPage />;
}
