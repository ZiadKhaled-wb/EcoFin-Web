import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import FormField from "@/components/ui/FormField";
import { LockIcon } from "@/components/ui/icons";
import FormError from "@/components/ui/FormError";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { ApiError, getErrorMessage } from "@/lib/api";
import { validateNewPassword } from "@/lib/validation";
import { authApi } from "@/services/authApi";
import { useAuthStore } from "@/store/authStore";

type Errors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

/**
 * THE GATE. A temp-password user can reach only this page and logout
 * (ADR-0004 D5). Not linked from any nav. Calm and quick, never celebratory.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const setLogin = useAuthStore((s) => s.setLogin);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    const next: Errors = {};
    if (!currentPassword) next.currentPassword = "أدخل كلمة المرور الحالية.";
    const v = validateNewPassword(newPassword, confirmPassword);
    if (v.password) next.newPassword = v.password;
    if (v.confirm) next.confirmPassword = v.confirm;
    if (!next.newPassword && newPassword === currentPassword)
      next.newPassword = "كلمة المرور الجديدة يجب أن تختلف عن الحالية.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword });

      // Silent re-login for a fresh token that no longer carries the flag.
      try {
        const res = await authApi.login({
          tenant_slug: tenantSlug ?? "",
          identifier: user?.username ?? user?.email ?? "",
          password: newPassword,
        });
        setLogin(res.user, res.session, res.must_change_password);
        setDone(true);
        setTimeout(() => navigate("/dashboard", { replace: true }), 800);
      } catch {
        clearSession();
        navigate("/login", { replace: true, state: { notice: "changed" } });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return void setErrors({ currentPassword: "كلمة المرور الحالية غير صحيحة." });
        if (err.code === "VALIDATION_FAILED" && err.fields) return void setErrors(err.fields as Errors);
        if (err.status === 403) {
          // Should not happen on this page. Log and force a clean re-login.
          console.error("Unexpected 403 on change-password", err);
          clearSession();
          return void navigate("/login", { replace: true });
        }
      }
      setFormError(getErrorMessage(err, "تعذر تغيير كلمة المرور. حاول مرة أخرى."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="غيّر كلمة المرور المؤقتة"
      subtitle="لأمان حسابك، اختر كلمة مرور جديدة قبل المتابعة."
    >
      {done ? (
        <Notice tone="success">تم تغيير كلمة المرور. جارٍ الانتقال...</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormField
            label="كلمة المرور الحالية"
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword}
          />
          <FormField
            label="كلمة المرور الجديدة"
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            error={errors.newPassword}
            help="8 أحرف على الأقل."
          />
          <FormField
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirmPassword}
          />
          <FormError message={formError} />
          <SubmitButton label="حفظ كلمة المرور" loadingLabel="جارٍ الحفظ..." loading={submitting} />
          <button
            type="button"
            className="btn-link mx-auto block text-sm"
            onClick={() => authApi.logout().then(() => navigate("/login", { replace: true }))}
          >
            تسجيل الخروج
          </button>
        </form>
      )}
    </AuthLayout>
  );
}