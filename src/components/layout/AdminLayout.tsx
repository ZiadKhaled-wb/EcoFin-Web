import { Link, Outlet, useNavigate } from 'react-router-dom';
import LanguageSwitch from './LanguageSwitch';
import Button from '@/components/ui/Button';
import PageContainer from '@/components/ui/PageContainer';
import { t } from '@/i18n';
import { authApi } from '@/services/authApi';
export default function AdminLayout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <PageContainer className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/admin" className="font-bold">
            {t('shops.admin')}
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <Button
              variant="ghost"
              onClick={() =>
                void authApi.logout().then(() => navigate('/login', { replace: true }))
              }
            >
              {t('common.logout')}
            </Button>
          </div>
        </PageContainer>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
