import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import TenantSlugField from '@/components/auth/TenantSlugField';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import SubmitButton from '@/components/ui/SubmitButton';
import { LockIcon, UserIcon } from '@/components/ui/Icons';
import { useCountdown } from '@/hooks/useCountdown';
import { useTenantSlug } from '@/hooks/useTenantSlug';
import { t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
import { authApi, buildLoginBody } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { loginErrorMessage } from './authErrors';

const NOTICES: Record<string, TranslationKey> = {
  reset: 'auth.notice.reset',
  changed: 'auth.notice.changed',
  invite: 'shops.invite.success',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const noticeKey = NOTICES[(location.state as { notice?: string } | null)?.notice ?? ''];

  const tenant = useTenantSlug();
  const setLogin = useAuthStore((s) => s.setLogin);

  const [identifier, setIdentifier] = useState(
    (location.state as { prefillEmail?: string } | null)?.prefillEmail ?? '',
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shopError, setShopError] = useState('');
  const [loading, setLoading] = useState(false);
  const { seconds, start } = useCountdown();

  // An email names the login on its own; a username is only unique inside one shop.
  const needsShop = identifier.trim() !== '' && !identifier.includes('@');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setShopError('');

    const parsed = buildLoginBody({
      identifier,
      password,
      ...(needsShop ? { tenantSlug: tenant.slug } : {}),
    });
    if (!parsed.success) {
      const missingShop = needsShop && tenant.slug === '';
      if (missingShop) setShopError(t('auth.errors.shopRequired'));
      else setError(t('auth.errors.identifierInvalid'));
      if (missingShop) tenant.unlock();
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login(parsed.data);
      setLogin(res, {
        identifier: parsed.data.identifier,
        tenantSlug: parsed.data.tenantSlug,
      });
      const { orgId, mustChangePassword, isSuperAdmin } = useAuthStore.getState();
      navigate(
        isSuperAdmin
          ? '/admin'
          : !orgId
            ? '/select-shop'
            : mustChangePassword
              ? '/change-password'
              : '/dashboard',
        {
          replace: true,
        },
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.retryAfter) start(err.retryAfter);
      else setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {noticeKey && <Notice tone="success">{t(noticeKey)}</Notice>}

        <FormField
          label={t('auth.login.identifier')}
          ltr
          required
          icon={<UserIcon />}
          invalid={!!error}
          placeholder={t('auth.login.identifierPlaceholder')}
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        {needsShop && (
          <TenantSlugField
            {...tenant}
            error={shopError}
            onChange={tenant.setSlug}
            onUnlock={tenant.unlock}
          />
        )}
        <FormField
          label={t('auth.login.password')}
          type="password"
          required
          icon={<LockIcon />}
          invalid={!!error}
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <FormError message={seconds > 0 ? t('auth.errors.rateLimited', { seconds }) : error} />
        <SubmitButton
          label={t('auth.login.submit')}
          loadingLabel={t('auth.login.submitting')}
          loading={loading}
          disabled={seconds > 0}
        />

        <p className="text-center text-sm">
          <span className="text-ink-mute">{t('auth.login.forgotPrompt')} </span>
          <Link to="/forgot-password" className="btn-link">
            {t('auth.login.forgotLink')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
