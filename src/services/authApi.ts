import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type {
  ActivateWorkspaceResponse,
  CheckLicenseResponse,
  LoginResponse,
} from "@/types/auth";

// ASSUMPTION: the backend returns payloads at the top level of response.data.
// If it wraps them ({ data: ... }), unwrap in these functions only.
export const authApi = {
  checkLicense: (license_key: string) =>
    api
      .post<CheckLicenseResponse>("/api/auth/check-license", { license_key }, { skipAuth: true })
      .then((r) => r.data),

  activateWorkspace: (body: {
    license_key: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) =>
    api
      .post<ActivateWorkspaceResponse>("/api/auth/activate-workspace", body, { skipAuth: true })
      .then((r) => r.data),

  login: (body: { tenant_slug: string; identifier: string; password: string }) =>
    api.post<LoginResponse>("/api/auth/login", body, { skipAuth: true }).then((r) => r.data),

  forgotPassword: (body: { tenant_slug: string; identifier: string }) =>
    api
      .post<{ success: true }>("/api/auth/forgot-password", body, { skipAuth: true })
      .then((r) => r.data),

  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => api.post<{ success: true }>("/api/auth/change-password", body).then((r) => r.data),

  /** Logout is client-side today (ADR-0004): tell the server, then always clear. */
  async logout() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore: we clear locally regardless */
    } finally {
      useAuthStore.getState().clearSession();
    }
  },
};
