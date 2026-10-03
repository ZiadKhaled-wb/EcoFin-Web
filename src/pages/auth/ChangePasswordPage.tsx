import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import FormField from '@/components/ui/FormField';
import { LockIcon } from '@/components/ui/Icons';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import SubmitButton from '@/components/ui/SubmitButton';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { authApi, buildLoginBody } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { validateNewPassword } from './authErrors';

type Errors = Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;

/** Silent re-login for a fresh token that no longer carries the must-change flag. */
async function reLogin(newPassword: string) {
  const {
    account,
    tenantSlug,
    orgId: previousOrg,
    setLogin,
    setActiveShop,
  } = useAuthStore.getState();
  const identifier = account?.username ?? account?.email ?? '';
  const parsed = buildLoginBody({
    identifier,
    password: newPassword,
    ...(tenantSlug ? { tenantSlug } : {}),
  });
  if (!parsed.success) throw new Error('re-login body invalid');
  const res = await authApi.login(parsed.data);
  setLogin(res, { identifier, tenantSlug: parsed.data.tenantSlug });
  // Keep the shop the user was working in when the login has several.
  if (
    !useAuthStore.getState().orgId &&
    previousOrg &&
    res.shops.some((s) => s.orgId === previousOrg)
  ) {
    setActiveShop(await authApi.selectShop(previousOrg));
  }
}

/**
 * THE GATE. A temp-password user can reach only this page and logout
 * (ADR-0004 D5). Not linked from any nav. Calm and quick, never celebratory.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const next: Errors = {};
    if (!currentPassword) next.currentPassword = t('auth.change.currentRequired');
    const v = validateNewPassword(newPassword, confirmPassword);
    if (v.password) next.newPassword = v.password;
    if (v.confirm) next.confirmPassword = v.confirm;
    if (!next.newPassword && newPassword === currentPassword)
      next.newPassword = t('auth.change.mustDiffer');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      try {
        await reLogin(newPassword);
        setDone(true);
        setTimeout(() => navigate('/dashboard', { replace: true }), 800);
      } catch {
        clearSession();
        navigate('/login', { replace: true, state: { notice: 'changed' } });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CREDENTIALS')
          return void setErrors({ currentPassword: t('auth.change.currentWrong') });
        if (err.status === 403) {
          // Should not happen on this page. Force a clean re-login.
          clearSession();
          return void navigate('/login', { replace: true });
        }
      }
      setFormError(t('auth.change.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title={t('auth.change.title')} subtitle={t('auth.change.subtitle')}>
      {done ? (
        <Notice tone="success">{t('auth.change.done')}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormField
            label={t('auth.change.current')}
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword}
          />
          <FormField
            label={t('auth.change.new')}
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            error={errors.newPassword}
            help={t('auth.password.help')}
          />
          <FormField
            label={t('auth.change.confirm')}
            type="password"
            icon={<LockIcon />}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirmPassword}
          />
          <FormError message={formError} />
          <SubmitButton
            label={t('auth.change.submit')}
            loadingLabel={t('auth.change.submitting')}
            loading={submitting}
          />
          <button
            type="button"
            className="btn-link mx-auto block text-sm"
            onClick={() => authApi.logout().then(() => navigate('/login', { replace: true }))}
          >
            {t('common.logout')}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
