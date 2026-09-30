import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import TenantSlugField from "@/components/auth/TenantSlugField";
import FormField from "@/components/ui/FormField";
import FormError from "@/components/ui/FormError";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { LockIcon, UserIcon } from "@/components/ui/Icons";
import { ApiError, getErrorMessage } from "@/lib/api";
import { rateLimitMessage, useCountdown } from "@/hooks/useCountdown";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { authApi } from "@/services/authApi";
import { useAuthStore } from "@/store/authStore";

const NOTICES: Record<string, string> = {
  activated: "تم تفعيل المنشأة. سجّل الدخول للمتابعة.",
  reset: "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.",
  changed: "تم تغيير كلمة المرور. سجّل الدخول من جديد.",
};

// D8: every 401 is the same message. Never branch on the backend's wording.
const GENERIC_CREDENTIALS_ERROR = "بيانات الدخول غير صحيحة.";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = NOTICES[(location.state as { notice?: string } | null)?.notice ?? ""];

  const tenant = useTenantSlug();
  const setLogin = useAuthStore((s) => s.setLogin);
  const setTenantSlug = useAuthStore((s) => s.setTenantSlug);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { seconds, start } = useCountdown();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login({
        tenant_slug: tenant.slug,
        identifier: identifier.trim(),
        password, // never trimmed (ADR-0004 D9)
      });
      setTenantSlug(tenant.slug);
      setLogin(res.user, res.session, res.must_change_password);
      // must_change_password blocks everything else.
      navigate(res.must_change_password ? "/change-password" : "/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) start(err.retryAfter ?? 60);
      else if (err instanceof ApiError && err.status === 401) setError(GENERIC_CREDENTIALS_ERROR);
      else setError(getErrorMessage(err, "تعذر تسجيل الدخول. حاول مرة أخرى."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="تسجيل الدخول" subtitle="أدخل بياناتك للمتابعة">
      <form onSubmit={onSubmit} className="space-y-5">
        {notice && <Notice tone="success">{notice}</Notice>}

        <TenantSlugField {...tenant} onChange={tenant.setSlug} onUnlock={tenant.unlock} />

        <FormField
          label="اسم المستخدم أو البريد الإلكتروني"
          ltr
          required
          icon={<UserIcon />}
          invalid={!!error}
          placeholder="username or email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <FormField
          label="كلمة المرور"
          type="password"
          required
          icon={<LockIcon />}
          invalid={!!error}
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <FormError message={seconds > 0 ? rateLimitMessage(seconds) : error} />
        <SubmitButton
          label="تسجيل الدخول"
          loadingLabel="جارٍ الدخول..."
          loading={loading}
          disabled={seconds > 0}
        />

        <p className="text-center text-sm">
          <span className="text-ink-mute">نسيت كلمة المرور؟ </span>
          <Link to="/forgot-password" className="btn-link">استعادة كلمة المرور</Link>
        </p>
        <p className="text-center text-sm text-ink-mute">
          لم تفعّل منشأتك بعد؟ <Link to="/activate" className="btn-link">فعّل الكود</Link>
        </p>
      </form>
    </AuthLayout>
  );
}