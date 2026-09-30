import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import GuestOnly from "@/components/guards/GuestOnly";
import RequireAuth from "@/components/guards/RequireAuth";
import RequirePasswordChanged from "@/components/guards/RequirePasswordChanged";
import ActivationPage from "@/pages/auth/ActivationPage";
import ActivateWorkspacePage from "@/pages/auth/ActivateWorkspacePage";
import LoginPage from "@/pages/auth/LoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage";
import DashboardPage from "@/pages/DashboardPage";

// Dev-only living style guide; never reachable in production builds.
const DesignSystemPage = lazy(() => import("@/pages/DesignSystemPage"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
      <Routes>
        {/* Signed-out only */}
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<ActivationPage />} />
          <Route path="/activate-workspace" element={<ActivateWorkspacePage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}

        {/* Supabase magic-link landing: reachable regardless of session */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Signed-in */}
        <Route element={<RequireAuth />}>
          {/* The gate: the only page a temp-password user may see */}
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route element={<RequirePasswordChanged />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            {/* Future ERP/POS modules mount here, e.g. /pos, /inventory */}
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}