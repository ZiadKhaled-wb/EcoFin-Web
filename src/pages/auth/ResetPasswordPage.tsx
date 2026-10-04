import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import { LockIcon } from '@/components/ui/Icons';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase'; // deliberate: see lib/supabase.ts
import { authApi } from '@/services/authApi';
import { validateNewPassword } from './authErrors';

type Status = 'checking' | 'ready' | 'invalid';

/** Drops the in-memory recovery session so it never lingers. */
const dropRecoverySession = () => supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

/**
 * Landing page of the emailed recovery link (#access_token=...&type=recovery).
 * The Supabase client only reads the recovery token from the URL; the password itself is
 * changed through our backend (`POST /api/auth/reset-password { token, newPassword }`).
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const recoveryToken = useRef<string | null>(null);
  const pendingSignOut = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // React StrictMode re-runs effects at once: a sign-out queued by the cleanup is cancelled.
    clearTimeout(pendingSignOut.current);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryToken.current = session.access_token;
        setStatus('ready');
      }
    });
    // getSession resolves after Supabase has processed the URL fragment.
    // No token / expired token / error params => no session => invalid.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        recoveryToken.current ??= session.access_token;
        setStatus('ready');
      } else {
        setStatus((prev) => (prev === 'ready' ? prev : 'invalid'));
        void dropRecoverySession();
      }
    });
    return () => {
      data.subscription.unsubscribe();
      pendingSignOut.current = setTimeout(() => void dropRecoverySession(), 0);
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const v = validateNewPassword(password, confirm);
    setErrors(v);
    const token = recoveryToken.current;
    if (v.password || v.confirm || !token) return;

    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
    } catch (err) {
      if (err instanceof ApiError && ['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(err.code)) {
        setStatus('invalid');
        void dropRecoverySession();
      } else {
        setFormError(t('auth.reset.failed'));
      }
      setSubmitting(false);
      return;
    }
    // Drop the in-memory recovery session; it must never outlive this page.
    await dropRecoverySession();
    navigate('/login', { replace: true, state: { notice: 'reset' } });
  };

  return (
    <AuthLayout
      title={t('auth.reset.title')}
      subtitle={t('auth.reset.subtitle')}
      loading={status === 'checking'}
      loadingLabel={t('auth.reset.checking')}
      terminalError={
        status === 'invalid'
          ? {
              message: t('auth.reset.invalidLink'),
              actionLabel: t('auth.reset.requestNew'),
              onAction: () => navigate('/forgot-password', { replace: true }),
            }
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormField
          label={t('auth.reset.newPassword')}
          type="password"
          icon={<LockIcon />}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          help={t('auth.password.help')}
        />
        <FormField
          label={t('auth.reset.confirm')}
          type="password"
          icon={<LockIcon />}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <FormError message={formError} />
        <SubmitButton
          label={t('auth.reset.submit')}
          loadingLabel={t('auth.reset.submitting')}
          loading={submitting}
        />
        <p className="text-center text-sm">
          <Link to="/login" className="btn-link">
            {t('common.backToLogin')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
