import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InviteLookupResponse } from '@ziadkhaled-wb/contracts';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { inviteApi } from '@/services/shopApi';
import { useAuthStore } from '@/store/authStore';
import { loginErrorMessage, validateNewPassword } from './authErrors';
type Status = 'checking' | 'ready' | 'invalid' | 'expired' | 'failed';
const inviteState = (error: unknown): Status =>
  error instanceof ApiError
    ? error.code === 'INVITE_EXPIRED'
      ? 'expired'
      : ['INVITE_NOT_FOUND', 'INVITE_USED'].includes(error.code)
        ? 'invalid'
        : 'failed'
    : 'failed';
export default function InviteAcceptPage() {
  const navigate = useNavigate();
  const token = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>('checking');
  const [person, setPerson] = useState<InviteLookupResponse | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
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
    void inviteApi.lookup(token.current).then(
      (value) => {
        if (active) {
          setPerson(value);
          setStatus('ready');
        }
      },
      (failure: unknown) => {
        if (active) setStatus(inviteState(failure));
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!person || !token.current) return;
    const next = person.account_exists
      ? password
        ? {}
        : { password: t('shops.validation') }
      : validateNewPassword(password, confirm);
    setErrors(next);
    if (next.password || ('confirm' in next && next.confirm)) return;
    setSending(true);
    try {
      const result = await inviteApi.accept({ token: token.current, password });
      useAuthStore.getState().clearSession();
      useAuthStore.getState().setTenantSlug(result.tenant_slug);
      token.current = '';
      navigate('/login', {
        replace: true,
        // P02: the first login after the invite opens the setup wizard (owners only; the wizard
        // sends anyone else to the dashboard).
        state: { notice: 'invite', prefillEmail: person.login, afterLogin: 'onboarding' },
      });
    } catch (failure) {
      const state = inviteState(failure);
      if (state === 'invalid' || state === 'expired') setStatus(state);
      else setError(loginErrorMessage(failure));
    } finally {
      setSending(false);
    }
  };
  return (
    <AuthLayout title={t('shops.invite.title')} subtitle={person?.shop_name}>
      {status === 'checking' && <p role="status">{t('shops.invite.checking')}</p>}
      {(status === 'invalid' || status === 'expired') && (
        <p role="alert" className="notice notice-error">
          {t(`shops.invite.${status}`)}
        </p>
      )}
      {status === 'failed' && <p role="alert">{t('errors.unknown')}</p>}
      {status === 'ready' && person && (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-1">
            <p className="font-bold">{person.full_name}</p>
            <p dir="ltr" className="text-start">
              {person.login}
            </p>
          </div>
          <p>{t(person.account_exists ? 'shops.invite.existing' : 'shops.invite.newAccount')}</p>
          <FormField
            label={t('shops.invite.password')}
            type="password"
            autoComplete={person.account_exists ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          {!person.account_exists && (
            <FormField
              label={t('shops.invite.confirm')}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm}
            />
          )}
          <FormError message={error} />
          <SubmitButton
            label={t('shops.invite.accept')}
            loadingLabel={t('shops.invite.accepting')}
            loading={sending}
          />
        </form>
      )}
      {status !== 'checking' && status !== 'ready' && (
        <Link to="/login" className="btn-link">
          {t('common.backToLogin')}
        </Link>
      )}
    </AuthLayout>
  );
}
