import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { KeyIcon, LockIcon, MailIcon, UserIcon } from '@/components/ui/Icons';
import { ApiError, getErrorMessage } from '@/lib/api';
import { USERNAME_MIN, validateNewPassword } from '@/lib/validation';
import { authApi } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';

type Status = 'loading' | 'ready' | 'unavailable';
type Errors = Partial<Record<'email' | 'username' | 'password' | 'confirmPassword', string>>;

export default function ActivateWorkspacePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const licenseKey = (params.get('key') ?? '').toUpperCase();
  const setTenantSlug = useAuthStore((s) => s.setTenantSlug);

  const [status, setStatus] = useState<Status>('loading');
  const [pageError, setPageError] = useState('');
  const [orgName, setOrgName] = useState('');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!licenseKey) {
      navigate('/activate', { replace: true });
      return;
    }
    let cancelled = false;
    authApi
      .checkLicense(licenseKey)
      .then((data) => {
        if (cancelled) return;
        if (data.is_used) {
          navigate('/login', { replace: true });
        } else if (!data.org_name) {
          setPageError('لا توجد منشأة مسجلة لهذا الكود. تواصل مع الدعم.');
          setStatus('unavailable');
        } else {
          setOrgName(data.org_name);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPageError(getErrorMessage(err, 'تعذر التحقق من كود التفعيل.'));
        setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [licenseKey, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const next: Errors = {};
    if (!email.trim()) next.email = 'أدخل البريد الإلكتروني المسجل لهذه المنشأة.';
    if (username.trim().length < USERNAME_MIN)
      next.username = `اسم المستخدم يجب ألا يقل عن ${USERNAME_MIN} أحرف.`;
    const pw = validateNewPassword(password, confirmPassword);
    if (pw.password) next.password = pw.password;
    if (pw.confirm) next.confirmPassword = pw.confirm;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const res = await authApi.activateWorkspace({
        license_key: licenseKey,
        email: email.trim(),
        username: username.trim(),
        password,
        confirmPassword,
      });
      setTenantSlug(res.tenant_slug);
      navigate('/login', { replace: true, state: { notice: 'activated' } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'LICENSE_USED') return void navigate('/login', { replace: true });
        if (err.code === 'LICENSE_EXPIRED') {
          setPageError('انتهت صلاحية كود التفعيل. تواصل مع الدعم لتجديده.');
          return void setStatus('unavailable');
        }
        if (err.status === 401) {
          // INVALID_CREDENTIALS here means the email doesn't match the license.
          return void setErrors({ email: 'هذا البريد لا يطابق البريد المسجل لهذا الكود.' });
        }
        if (err.code === 'VALIDATION_FAILED' && err.fields) {
          return void setErrors(err.fields as Errors);
        }
      }
      setFormError(getErrorMessage(err, 'تعذر تفعيل المنشأة. حاول مرة أخرى.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      wide
      title="إعداد حساب المالك"
      subtitle="أدخل بياناتك لإكمال تفعيل المنشأة."
      context={
        orgName && (
          <div className="notice notice-info">
            <p className="text-sm">المنشأة</p>
            <p className="text-xl font-bold">{orgName}</p>
          </div>
        )
      }
      loading={status === 'loading'}
      loadingLabel="جارٍ التحقق من الكود..."
      terminalError={
        status === 'unavailable'
          ? {
              message: pageError,
              actionLabel: 'العودة إلى صفحة التفعيل',
              onAction: () => navigate('/activate', { replace: true }),
            }
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormField label="كود التفعيل" ltr readOnly icon={<KeyIcon />} value={licenseKey} />
        <FormField
          label="البريد الإلكتروني"
          type="email"
          ltr
          icon={<MailIcon />}
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          help="اكتب البريد الذي سُجّلت به المنشأة."
        />
        <FormField
          label="اسم المستخدم"
          ltr
          icon={<UserIcon />}
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          help={`${USERNAME_MIN} أحرف على الأقل.`}
        />
        <FormField
          label="كلمة المرور"
          type="password"
          icon={<LockIcon />}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          help="8 أحرف على الأقل."
        />
        <FormField
          label="تأكيد كلمة المرور"
          type="password"
          icon={<LockIcon />}
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />
        <FormError message={formError} />
        <SubmitButton label="تفعيل المنشأة" loadingLabel="جارٍ التفعيل..." loading={submitting} />
      </form>
    </AuthLayout>
  );
}
