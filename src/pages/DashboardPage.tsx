import { useNavigate } from "react-router-dom";
import { authApi } from "@/services/authApi";
import { useAuthStore } from "@/store/authStore";
import { ROLE_LABELS } from "@/types/auth";

/** Placeholder so the auth flow has somewhere to land. Replace with the app shell. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold">لوحة التحكم</h1>
          <p className="text-ink-mute">
            {user?.username ?? user?.email} · {user ? ROLE_LABELS[user.role] : ""}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => authApi.logout().then(() => navigate("/login", { replace: true }))}
        >
          تسجيل الخروج
        </button>
      </header>
      <p className="mt-8 text-ink-soft">تم تسجيل الدخول بنجاح. وحدات النظام تُضاف هنا.</p>
    </div>
  );
}
