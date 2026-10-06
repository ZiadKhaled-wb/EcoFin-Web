import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PasswordResetLookupResponse } from '@ziadkhaled-wb/contracts';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import SubmitButton from '@/components/ui/SubmitButton';
import { passwordResetApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';
import { validateNewPassword } from './authErrors';
type Status = 'checking' | 'ready' | 'invalid' | 'expired' | 'failed';
const stateOf = (error: unknown): Status =>
  error instanceof ApiError
    ? error.code === 'RESET_EXPIRED'
      ? 'expired'
      : ['RESET_USED', 'RESET_NOT_FOUND'].includes(error.code)
        ? 'invalid'
        : 'failed'
    : 'failed';
export default function SetPasswordPage() {
  const navigate = useNavigate();
  const token = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>('checking');
  const [person, setPerson] = useState<PasswordResetLookupResponse | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (token.current === undefined) {
      token.current = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
    if (!token.current) {
      setStatus('invalid');
      return;
    }
    void passwordResetApi.lookup(token.current).then(
      (value) => {
        if (active) {
          setPerson(value);
          setStatus('ready');
        }
      },
      (e: unknown) => {
        if (active) setStatus(stateOf(e));
      },
    );
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = validateNewPassword(password, confirm);
    setErrors(next);
    if (next.password || next.confirm || !token.current) return;
    setBusy(true);
    try {
      const result = await passwordResetApi.complete({ token: token.current, password });
      token.current = '';
      setPassword('');
      setConfirm('');
      useAuthStore.getState().clearSession();
      useAuthStore.getState().setTenantSlug(result.tenant_slug);
      navigate('/login', { replace: true, state: { notice: 'reset', prefillEmail: result.login } });
    } catch (failure) {
      setStatus(stateOf(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title={t('employees.resetPage.title')} subtitle={person?.shop_name}>
      {status === 'checking' && <p role="status">{t('employees.resetPage.checking')}</p>}
      {['invalid', 'expired', 'failed'].includes(status) && (
        <p role="alert">
          {t(
            status === 'expired'
              ? 'employees.resetPage.expired'
              : status === 'invalid'
                ? 'employees.resetPage.invalid'
                : 'employees.resetPage.failed',
          )}
        </p>
      )}
      {status === 'ready' && person && (
        <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
          <p className="font-bold">{person.full_name}</p>
          <p dir="ltr">{person.login}</p>
          <FormField
            label={t('shops.invite.password')}
            type="password"
            autoComplete="new-password"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormField
            label={t('shops.invite.confirm')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={errors.confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <SubmitButton
            label={t('employees.resetPage.submit')}
            loadingLabel={t('employees.resetPage.sending')}
            loading={busy}
          />
        </form>
      )}
      {status !== 'checking' && status !== 'ready' && (
        <Link to="/login">{t('common.backToLogin')}</Link>
      )}
    </AuthLayout>
  );
}
