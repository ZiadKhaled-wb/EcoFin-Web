import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import TenantSlugField from "@/components/auth/TenantSlugField";
import FormField from "@/components/ui/FormField";
import FormError from "@/components/ui/FormError";
import SubmitButton from "@/components/ui/SubmitButton";
import { CheckCircleIcon, UserIcon } from "@/components/ui/Icons";
import { ApiError } from "@/lib/api";
import { rateLimitMessage, useCountdown } from "@/hooks/useCountdown";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { authApi } from "@/services/authApi";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const tenant = useTenantSlug();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { seconds, start } = useCountdown();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.forgotPassword({ tenant_slug: tenant.slug, identifier: identifier.trim() });
      setSent(true);
    } catch (err) {
      // Uniformity contract: the backend answers 200 for every input.
      // The only branches allowed here are rate-limit and transport failure.
      if (err instanceof ApiError && err.status === 429) start(err.retryAfter ?? 60);
      else setError("تعذر إرسال الطلب. حاول مرة أخرى بعد قليل.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="استعادة كلمة المرور">
        <div className="space-y-4">
          {/* One message, no variations, no resend that could reveal timing. */}
          <div
            role="status"
            className="notice notice-success flex flex-col items-center gap-2 px-5 py-5 text-center"
          >
            <CheckCircleIcon width={28} height={28} />
            <p className="text-base font-medium">
              إذا كان هناك حساب مطابق، فقد أرسلنا رابط إعادة تعيين كلمة المرور.
            </p>
            <p className="text-xs text-ink-mute">تحقق من صندوق الوارد والبريد المزعج</p>
          </div>
          <SubmitButton
            type="button"
            variant="secondary"
            label="العودة لتسجيل الدخول"
            onClick={() => navigate("/login")}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="استعادة كلمة المرور" subtitle="سنرسل رابط إعادة التعيين إلى بريد الحساب">
      <form onSubmit={onSubmit} className="space-y-5">
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
        <FormError message={seconds > 0 ? rateLimitMessage(seconds) : error} />
        <SubmitButton
          label="إرسال رابط الاستعادة"
          loadingLabel="جارٍ الإرسال..."
          loading={loading}
          disabled={seconds > 0}
        />
        <p className="text-center text-sm">
          <span className="text-ink-mute">تذكرت كلمة المرور؟ </span>
          <Link to="/login" className="btn-link">تسجيل الدخول</Link>
        </p>
      </form>
    </AuthLayout>
  );
}