import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SubscriptionState } from '@ziadkhaled-wb/contracts';
import { useAuthStore } from '@/store/authStore';
import { subscriptionApi } from '@/services/subscriptionApi';
import { t } from '@/i18n';
export function SubscriptionBannerView({
  state,
  daysLeft,
  end,
}: {
  state: SubscriptionState;
  daysLeft: number | null;
  end: string | null;
}) {
  if (state === 'expiring')
    return (
      <p
        role="status"
        className="mx-4 my-3 rounded-control border border-amber-400 bg-amber-50 p-3 text-amber-900"
      >
        {t('subscriptions.expiring', { days: daysLeft ?? 0, date: end ?? '' })}
      </p>
    );
  if (state === 'expired')
    return (
      <p
        role="alert"
        className="mx-4 my-3 rounded-control border border-red-400 bg-red-50 p-3 text-red-900"
      >
        {t('subscriptions.expired')}{' '}
        {/* M03: export.data works in an expired shop; the page checks the permission. */}
        <Link to="/settings/export" className="font-semibold underline">
          {t('subscriptions.downloadData')}
        </Link>
      </p>
    );
  return null;
}
export default function SubscriptionBanner() {
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: ['subscription', orgId],
    queryFn: subscriptionApi.status,
    enabled: !!orgId,
    staleTime: 0,
  });
  return query.data ? (
    <SubscriptionBannerView
      state={query.data.state}
      daysLeft={query.data.days_left}
      end={query.data.subscription_end}
    />
  ) : null;
}
