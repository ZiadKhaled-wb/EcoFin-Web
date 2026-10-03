import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import { LockIcon } from '@/components/ui/Icons';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { supabase } from '@/lib/supabase'; // deliberate: see lib/supabase.ts
import { validateNewPassword } from '@/lib/validation';

type Status = 'checking' | 'ready' | 'invalid';

/**
 * Landing page of the Supabase recovery email (#access_token=...&type=recovery).
 * Uses the Supabase client directly, NOT our backend. Deliberate exception.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready');
    });
    // getSession resolves after Supabase has processed the URL fragment.
    // No token / expired token / error params => no session => invalid.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus((prev) => (session ? 'ready' : prev === 'ready' ? prev : 'invalid'));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const v = validateNewPassword(password, confirm);
    setErrors(v);
    if (v.password || v.confirm) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFormError('تعذر تحديث كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.');
      setSubmitting(false);
      return;
    }
    await supabase.auth.signOut();
    navigate('/login', { replace: true, state: { notice: 'reset' } });
  };

  return (
    <AuthLayout
      title="كلمة مرور جديدة"
      subtitle="اختر كلمة مرور جديدة لحسابك."
      loading={status === 'checking'}
      loadingLabel="جارٍ التحقق من الرابط..."
      terminalError={
        status === 'invalid'
          ? {
              message: 'انتهت صلاحية هذا الرابط أو أنه غير صالح. اطلب رابطًا جديدًا.',
              actionLabel: 'طلب رابط جديد',
              onAction: () => navigate('/forgot-password', { replace: true }),
            }
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormField
          label="كلمة المرور الجديدة"
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
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <FormError message={formError} />
        <SubmitButton label="حفظ كلمة المرور" loadingLabel="جارٍ الحفظ..." loading={submitting} />
        <p className="text-center text-sm">
          <Link to="/login" className="btn-link">
            العودة إلى تسجيل الدخول
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
