import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import TenantSlugField from '@/components/auth/TenantSlugField';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import SubmitButton from '@/components/ui/SubmitButton';
import { CheckCircleIcon, UserIcon } from '@/components/ui/Icons';
import { useTenantSlug } from '@/hooks/useTenantSlug';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { authApi, buildForgotBody } from '@/services/authApi';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const tenant = useTenantSlug();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [shopError, setShopError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const needsShop = identifier.trim() !== '' && !identifier.includes('@');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setShopError('');

    const parsed = buildForgotBody({
      identifier,
      ...(needsShop ? { tenantSlug: tenant.slug } : {}),
    });
    if (!parsed.success) {
      if (needsShop && tenant.slug === '') {
        setShopError(t('auth.errors.shopRequired'));
        tenant.unlock();
      } else setError(t('auth.errors.identifierInvalid'));
      return;
    }

    setLoading(true);
    try {
      await authApi.forgotPassword(parsed.data);
      setSent(true);
    } catch (err) {
      // Same answer for success and failure, so the page never reveals whether an account
      // exists. Only "the server never answered" is shown as a retryable error.
      if (err instanceof ApiError && err.status === 0) setError(t('auth.forgot.failed'));
      else setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title={t('auth.forgot.title')}>
        <div className="space-y-4">
          <div
            role="status"
            className="notice notice-success flex flex-col items-center gap-2 px-5 py-5 text-center"
          >
            <CheckCircleIcon width={28} height={28} />
            <p className="text-base font-medium">{t('auth.forgot.sent')}</p>
            <p className="text-xs text-ink-mute">{t('auth.forgot.sentHint')}</p>
          </div>
          <SubmitButton
            type="button"
            variant="secondary"
            label={t('common.backToLogin')}
            onClick={() => navigate('/login')}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
        <FormError message={error} />
        <SubmitButton
          label={t('auth.forgot.submit')}
          loadingLabel={t('auth.forgot.submitting')}
          loading={loading}
        />
        <p className="text-center text-sm">
          <span className="text-ink-mute">{t('auth.forgot.remember')} </span>
          <Link to="/login" className="btn-link">
            {t('auth.login.title')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
