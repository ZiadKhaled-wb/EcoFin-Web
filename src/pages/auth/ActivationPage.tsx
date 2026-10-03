import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { KeyIcon } from '@/components/ui/Icons';
import { ApiError, getErrorMessage } from '@/lib/api';
import { authApi } from '@/services/authApi';
import { rateLimitMessage, useCountdown } from '@/hooks/useCountdown';

export default function ActivationPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const { seconds, start } = useCountdown();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldError('');
    setFormError('');
    setLoading(true);
    try {
      const data = await authApi.checkLicense(key.trim());
      // The key is a one-time credential: it travels in the URL only, never stored.
      if (data.is_used) navigate('/login', { replace: true });
      else navigate(`/activate-workspace?key=${encodeURIComponent(key.trim())}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) start(err.retryAfter ?? 60);
      else if (err instanceof ApiError && err.code === 'LICENSE_INVALID')
        setFieldError('كود التفعيل غير صحيح.');
      else setFormError(getErrorMessage(err, 'تعذر التحقق من الكود. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="تفعيل النظام" subtitle="أدخل كود التفعيل للمتابعة">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormField
          label="كود التفعيل"
          ltr
          required
          autoFocus
          icon={<KeyIcon />}
          invalid={!!formError}
          autoComplete="off"
          spellCheck={false}
          placeholder="ECO-XXXX-XXXX"
          className="text-lg tracking-wider"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          error={fieldError}
        />
        <FormError message={seconds > 0 ? rateLimitMessage(seconds) : formError} />
        <SubmitButton
          label="متابعة"
          loadingLabel="جارٍ التحقق..."
          loading={loading}
          disabled={seconds > 0 || key.trim() === ''}
        />
        <p className="text-center text-sm text-ink-mute">
          فعّلت منشأتك من قبل؟{' '}
          <Link to="/login" className="btn-link">
            سجّل الدخول
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
