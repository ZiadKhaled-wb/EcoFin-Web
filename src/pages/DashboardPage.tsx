import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import PageContainer from '@/components/ui/PageContainer';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import DashboardTiles from '@/features/dashboard/DashboardTiles';
import { visibleTileCount } from '@/features/dashboard/visibleTiles';
import { useDashboardBranch } from '@/features/dashboard/useDashboardBranch';
import { useOwnerDashboard } from '@/features/dashboard/useOwnerDashboard';
import { useCan } from '@/features/me/useCan';
import { useMe } from '@/features/me/useMe';
import LowStockCard from '@/features/stock/LowStockCard';
import DayCloseAlertsCard from '@/features/dayClose/DayCloseAlertsCard';
import { useAuthStore } from '@/store/authStore';
import { readOnboardingProgress, type OnboardingProgress } from '@/features/onboarding/progress';
import { formatBusinessDate, formatDateTime, shopToday } from '@/lib/format';
import { t } from '@/i18n';

const DEFAULT_TIME_ZONE = 'Africa/Cairo';

/**
 * D01 owner dashboard (D87): how the business is doing today, for all branches or one. Every
 * number is the server's (computed in SQL by the same definition as the page it links to); the
 * browser formats them and adds nothing up. Refreshes every minute while the page is visible.
 */
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

  const me = useMe();
  const timeZone = me.data?.org.timezone ?? DEFAULT_TIME_ZONE;
  const { branches, branchId, ready, select } = useDashboardBranch();
  const dashboard = useOwnerDashboard(branchId);
  const data = dashboard.data;
  // The server's business date; the shop's own date (never the browser's) until it answers.
  const date = data?.business_date ?? shopToday(timeZone);

  return (
    <PageContainer>
      <PageHeader
        title={t('nav.dashboard')}
        description={t('shell.dashboard.welcome', { name: user?.username ?? user?.email ?? '' })}
      />
      {user?.role === 'OWNER' && !setup.finished && (
        <Card
          title={t(setup.dismissed ? 'onboarding.title' : 'onboarding.stepsTitle')}
          description={t(setup.dismissed ? 'onboarding.resumeNote' : 'onboarding.description')}
          className="mb-6"
        >
          <Link to="/onboarding" className="btn btn-primary">
            {t(setup.started ? 'onboarding.resumeSetup' : 'onboarding.title')}
          </Link>
        </Card>
      )}

      <section aria-labelledby="dashboard-today" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="dashboard-today" className="type-section-title">
              {t('dashboard.today', { date: formatBusinessDate(date) })}
            </h2>
            <p className="type-caption mt-0.5" aria-live="polite">
              {data
                ? t('dashboard.updated', {
                    time: formatDateTime(data.generated_at, undefined, timeZone),
                  })
                : t('dashboard.loading')}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {branches.length > 1 && (
              <Select
                label={t('dashboard.branch')}
                value={branchId}
                onChange={(e) => select(e.target.value)}
                options={[
                  { value: '', label: t('dashboard.allBranches') },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}
            <Button
              variant="secondary"
              loading={dashboard.isFetching}
              loadingLabel={t('dashboard.refreshing')}
              onClick={() => void dashboard.refetch()}
            >
              {t('dashboard.refresh')}
            </Button>
          </div>
        </div>

        {!ready || (dashboard.isPending && !data) ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : dashboard.isError && !data ? (
          <ErrorState title={t('dashboard.loadFailed')} onRetry={() => void dashboard.refetch()} />
        ) : data && visibleTileCount(data.tiles) === 0 ? (
          <EmptyState title={t('dashboard.empty')} description={t('dashboard.emptyHint')} />
        ) : data ? (
          <DashboardTiles
            tiles={data.tiles}
            date={data.business_date}
            branchId={data.branch_id ?? ''}
            timeZone={timeZone}
          />
        ) : null}
        {dashboard.isError && data && (
          <p role="alert" className="type-caption text-danger-600">
            {t('dashboard.refreshFailed')}
          </p>
        )}
      </section>

      {canSeeStock && <LowStockCard />}
      {canSeeDays && <DayCloseAlertsCard />}
    </PageContainer>
  );
}
