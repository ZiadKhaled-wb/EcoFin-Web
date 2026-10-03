import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestOnly from '@/components/guards/GuestOnly';
import RequireAuth from '@/components/guards/RequireAuth';
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

// Dev-only living style guide; never reachable in production builds.
const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));
// Dev-only F09 reference page and a route that needs a permission, to prove the guard.
const SamplePage = lazy(() => import('@/pages/SamplePage'));
const RestrictedSamplePage = lazy(() => import('@/pages/RestrictedSamplePage'));

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

          {/* Signed-in */}
          <Route element={<RequireAuth />}>
            {/* A login with several shops picks one here (no shop is active yet) */}
            <Route path="/select-shop" element={<ShopPickerPage />} />

            <Route element={<RequireShop />}>
              {/* The gate: the only page a temp-password user may see */}
              <Route path="/change-password" element={<ChangePasswordPage />} />

              <Route element={<RequirePasswordChanged />}>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  {import.meta.env.DEV && <Route path="/sample" element={<SamplePage />} />}
                  {import.meta.env.DEV && (
                    <Route element={<RequirePermission permission="audit.view" />}>
                      <Route path="/sample/restricted" element={<RestrictedSamplePage />} />
                    </Route>
                  )}
                  {/* Real modules replace these placeholders (one route per menu item) */}
                  {navLeaves()
                    .filter((i) => i.to && i.to !== '/dashboard')
                    .map((i) => (
                      <Route key={i.id} path={i.to} element={<ModulePlaceholderPage />} />
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
