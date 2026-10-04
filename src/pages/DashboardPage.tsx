import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

/** Placeholder landing page. Replace with real metrics when the reporting module lands. */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageContainer>
      <PageHeader
        title={t('nav.dashboard')}
        description={t('shell.dashboard.welcome', { name: user?.username ?? user?.email ?? '' })}
      />
      <Card
        title={t('shell.dashboard.cardTitle')}
        description={t('shell.dashboard.cardDescription')}
      >
        <p className="type-body">{t('shell.dashboard.signedIn')}</p>
      </Card>
    </PageContainer>
  );
}
