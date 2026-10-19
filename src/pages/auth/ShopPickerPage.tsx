import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/auth/AuthLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FormError from '@/components/ui/FormError';
import { t } from '@/i18n';
import { authApi } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { ROLE_LABELS } from '@/types/auth';
import { selectShopErrorMessage } from './authErrors';

/** Shown when a login belongs to several shops. Choosing one calls select-shop. */
export default function ShopPickerPage() {
  const navigate = useNavigate();
  const shops = useAuthStore((s) => s.shops);
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin);
  const currentOrgId = useAuthStore((s) => s.orgId);
  const setActiveShop = useAuthStore((s) => s.setActiveShop);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const choose = async (orgId: string) => {
    setError('');
    setPending(orgId);
    try {
      const res = await authApi.selectShop(orgId);
      setActiveShop(res);
      navigate(useAuthStore.getState().mustChangePassword ? '/change-password' : '/dashboard', {
        replace: true,
      });
    } catch (err) {
      setError(selectShopErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const logout = () => authApi.logout().then(() => navigate('/login', { replace: true }));
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  // Nothing to choose: the only shop is already the active one.
  if (shops.length === 1 && shops[0]?.orgId === currentOrgId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthLayout title={t('auth.picker.title')} subtitle={t('auth.picker.subtitle')}>
      <div className="space-y-4">
        {shops.length === 0 && <p className="notice notice-info">{t('auth.picker.empty')}</p>}
        <ul className="space-y-3">
          {shops.map((shop) => (
            <li key={shop.orgId}>
              <Button
                variant="secondary"
                fullWidth
                disabled={pending !== null}
                loading={pending === shop.orgId}
                onClick={() => void choose(shop.orgId)}
                aria-current={shop.orgId === currentOrgId ? 'true' : undefined}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-start">
                    <span className="block font-bold">{shop.orgName}</span>
                    <span className="block text-xs text-ink-mute">
                      {t('auth.picker.slug')}{' '}
                      <span className="font-mono" dir="ltr">
                        {shop.tenantSlug}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm text-ink-soft">
                    {shop.orgId === currentOrgId && (
                      <Badge tone="brand">{t('auth.picker.current')}</Badge>
                    )}
                    {ROLE_LABELS[shop.role]}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <FormError message={error} />
        <button
          type="button"
          className="btn-link mx-auto block text-sm"
          onClick={() => void logout()}
        >
          {t('common.logout')}
        </button>
      </div>
    </AuthLayout>
  );
}
