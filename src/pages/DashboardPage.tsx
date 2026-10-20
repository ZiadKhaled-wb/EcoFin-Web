import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import { t } from '@/i18n';
import { useCan } from '@/features/me/useCan';
import LowStockCard from '@/features/stock/LowStockCard';
import DayCloseAlertsCard from '@/features/dayClose/DayCloseAlertsCard';
import { useAuthStore } from '@/store/authStore';
import { readOnboardingProgress, type OnboardingProgress } from '@/features/onboarding/progress';

/** Placeholder landing page. Replace with real metrics when the reporting module lands. */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = useAuthStore((s) => s.orgId);
  // P02: owners see the setup card until the checklist is finished. A newly invited owner lands
  // in the wizard right after the first login (InviteAcceptPage → LoginPage); there is no
  // redirect from here, so an owner on a new device isn't sent away from the dashboard.
  const [setup] = useState<OnboardingProgress>(() => readOnboardingProgress(orgId));
  // I06: products below their min level (stock.view; the server limits the branches).
  const canSeeStock = useCan('stock.view');
  // K04: days not closed and the night check's findings (day.close or cash.view).
  const canCloseDays = useCan('day.close');
  const canSeeCash = useCan('cash.view');
  const canSeeDays = canCloseDays || canSeeCash;
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
      {user?.role === 'OWNER' && !setup.finished && (
        <Card
          title={t(setup.dismissed ? 'onboarding.title' : 'onboarding.stepsTitle')}
          description={t(setup.dismissed ? 'onboarding.resumeNote' : 'onboarding.description')}
          className="mt-6"
        >
          <Link to="/onboarding" className="btn btn-primary">
            {t(setup.started ? 'onboarding.resumeSetup' : 'onboarding.title')}
          </Link>
        </Card>
      )}
      {canSeeStock && <LowStockCard />}
      {canSeeDays && <DayCloseAlertsCard />}
    </PageContainer>
  );
}
