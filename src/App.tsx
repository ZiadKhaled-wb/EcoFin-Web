import EmployeesPage from '@/pages/settings/EmployeesPage';
import SetPasswordPage from '@/pages/auth/SetPasswordPage';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestOnly from '@/components/guards/GuestOnly';
import RequireAuth from '@/components/guards/RequireAuth';
import RequireNavItem from '@/components/guards/RequireNavItem';
import RequirePermission from '@/components/guards/RequirePermission';
import RequirePasswordChanged from '@/components/guards/RequirePasswordChanged';
import RequireShop from '@/components/guards/RequireShop';
import LoginPage from '@/pages/auth/LoginPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import ShopPickerPage from '@/pages/auth/ShopPickerPage';
import AppShell from '@/components/layout/AppShell';
import { navLeaves } from '@/config/navigation';
import DashboardPage from '@/pages/DashboardPage';
import ModulePlaceholderPage from '@/pages/ModulePlaceholderPage';
import RequireSuperAdmin from '@/components/guards/RequireSuperAdmin';
import AdminLayout from '@/components/layout/AdminLayout';
import AdminShopsPage from '@/pages/admin/AdminShopsPage';
import CreateShopPage from '@/pages/admin/CreateShopPage';
import InviteAcceptPage from '@/pages/auth/InviteAcceptPage';
import SubscriptionPage from '@/pages/admin/SubscriptionPage';
import BranchesPage from '@/pages/settings/BranchesPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import CategoriesPage from '@/pages/inventory/CategoriesPage';
import ProductsPage from '@/pages/inventory/ProductsPage';
import ShopProfilePage from '@/pages/settings/ShopProfilePage';

// Dev-only living style guide; never reachable in production builds.
const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));
// Dev-only F09 reference page and a route that needs a permission, to prove the guard.
const SamplePage = lazy(() => import('@/pages/SamplePage'));
const RestrictedSamplePage = lazy(() => import('@/pages/RestrictedSamplePage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));

/** Menu items that have a real page (no placeholder route). */
const REAL_ROUTES = new Set([
  '/dashboard',
  '/audit',
  '/settings',
  '/settings/profile',
  '/settings/branches',
  '/settings/employees',
  '/employees',
  '/inventory/categories',
  '/inventory/products',
]);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Signed-out only */}
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}

          {/* Emailed recovery link landing: reachable regardless of session */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/password/set" element={<SetPasswordPage />} />
          <Route path="/invite/accept" element={<InviteAcceptPage />} />

          {/* Signed-in */}
          <Route element={<RequireAuth />}>
            <Route element={<RequireSuperAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminShopsPage />} />
                <Route path="/admin/shops/new" element={<CreateShopPage />} />
                <Route path="/admin/shops/:id" element={<SubscriptionPage />} />
              </Route>
            </Route>
            {/* A login with several shops picks one here (no shop is active yet) */}
            <Route path="/select-shop" element={<ShopPickerPage />} />

            <Route element={<RequireShop />}>
              {/* The gate: the only page a temp-password user may see */}
              <Route path="/change-password" element={<ChangePasswordPage />} />

              <Route element={<RequirePasswordChanged />}>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route element={<RequirePermission permission="employee.manage" />}>
                    <Route path="/settings/employees" element={<EmployeesPage />} />
                    <Route
                      path="/employees"
                      element={<Navigate to="/settings/employees" replace />}
                    />
                  </Route>
                  <Route element={<RequirePermission permission="org.settings_manage" />}>
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                  <Route element={<RequirePermission permission="org.profile_manage" />}>
                    <Route path="/settings/profile" element={<ShopProfilePage />} />
                  </Route>
                  <Route element={<RequirePermission permission="branch.manage" />}>
                    <Route path="/settings/branches" element={<BranchesPage />} />
                  </Route>
                  <Route path="/inventory/categories" element={<CategoriesPage />} />
                  <Route path="/inventory/products" element={<ProductsPage />} />
                  {import.meta.env.DEV && <Route path="/sample" element={<SamplePage />} />}
                  {import.meta.env.DEV && (
                    <Route element={<RequirePermission permission="audit.view" />}>
                      <Route path="/sample/restricted" element={<RestrictedSamplePage />} />
                    </Route>
                  )}
                  {/* F07: typing the URL without audit.view shows the 403 page. */}
                  <Route element={<RequirePermission permission="audit.view" />}>
                    <Route path="/audit" element={<AuditPage />} />
                  </Route>
                  {/* Real modules replace these placeholders (one route per menu item) */}
                  {navLeaves()
                    .filter((i) => i.to && !REAL_ROUTES.has(i.to))
                    .map((i) => (
                      <Route
                        key={i.id}
                        path={i.to}
                        element={
                          <RequireNavItem item={i}>
                            <ModulePlaceholderPage />
                          </RequireNavItem>
                        }
                      />
                    ))}
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
