import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CollectorRouteStop } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { walletKeys, walletsApi } from '@/services/walletsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/** A map search for the stop's address (opens the phone's maps app). */
function mapLink(stop: CollectorRouteStop): string | null {
  const place = [stop.customer.address, stop.customer.city].filter(Boolean).join(' ');
  return place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : null;
}

/**
 * N06 (D81): the collector's home on a phone: the cash in their wallet and the customers to visit
 * today (due or overdue), each with a call link, a map link and the field collect screen. There is
 * no commission: a collector is paid a salary.
 */
export default function FieldHomePage() {
  const orgId = useAuthStore((s) => s.orgId);
  const wallet = useQuery({ queryKey: walletKeys.mine(orgId), queryFn: walletsApi.mine });
  const route = useQuery({
    queryKey: walletKeys.route(orgId, {}),
    queryFn: () => walletsApi.route(),
  });

  return (
    <PageContainer>
      <PageHeader title={t('wallets.field.title')} description={t('wallets.field.description')} />
      <div className="space-y-4">
        <Card title={t('wallets.field.wallet.title')}>
          {wallet.isPending ? (
            <Skeleton className="h-24" />
          ) : wallet.isError ? (
            <ErrorState
              title={t('wallets.field.loadFailed')}
              onRetry={() => void wallet.refetch()}
            />
          ) : (
            <div className="space-y-3">
              {wallet.data.wallet === null && (
                <p className="type-caption">{t('wallets.field.wallet.empty')}</p>
              )}
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="type-caption">{t('wallets.field.wallet.balance')}</dt>
                  <dd className="num type-section-title" data-testid="wallet-balance">
                    {formatMoney(wallet.data.balance)}
                  </dd>
                </div>
                <div>
                  <dt className="type-caption">{t('wallets.field.wallet.today')}</dt>
                  <dd className="num type-body">
                    {formatMoney(wallet.data.today.amount)} ·{' '}
                    {t('wallets.field.wallet.todayCount', {
                      count: formatNumber(wallet.data.today.count),
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="type-caption">{t('wallets.field.wallet.oldest')}</dt>
                  <dd className="type-body">
                    {wallet.data.oldest_unsettled_date
                      ? formatBusinessDate(wallet.data.oldest_unsettled_date)
                      : t('wallets.field.wallet.none')}
                  </dd>
                </div>
              </dl>
              <p className="type-caption">
                {wallet.data.last_settlement
                  ? t('wallets.field.wallet.last', {
                      amount: formatMoney(wallet.data.last_settlement.handed),
                      date: formatBusinessDate(wallet.data.last_settlement.business_date),
                    })
                  : t('wallets.field.wallet.hint')}
              </p>
            </div>
          )}
        </Card>

        <Card
          title={t('wallets.field.route.title')}
          description={
            route.data
              ? t('wallets.field.route.date', { date: formatBusinessDate(route.data.date) })
              : ''
          }
        >
          {route.isPending ? (
            <Skeleton className="h-40" />
          ) : route.isError ? (
            <ErrorState
              title={t('wallets.field.loadFailed')}
              onRetry={() => void route.refetch()}
            />
          ) : route.data.stops.length === 0 ? (
            <EmptyState title={t('wallets.field.route.empty')} />
          ) : (
            <>
              <p className="type-caption mb-3">
                {t('wallets.field.route.totals', {
                  customers: formatNumber(route.data.totals.customers),
                  amount: formatMoney(route.data.totals.amount_due),
                })}
              </p>
              <ul className="divide-y divide-line">
                {route.data.stops.map((stop) => (
                  <Stop key={stop.customer.id} stop={stop} />
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}

function Stop({ stop }: { stop: CollectorRouteStop }) {
  const map = mapLink(stop);
  const overdue = stop.amount_overdue !== '0.00';
  return (
    <li className="space-y-2 py-3" data-testid="route-stop">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="type-section-title" dir="auto">
            {stop.customer.name}
          </div>
          <div className="type-caption" dir="auto">
            {[stop.customer.address, stop.customer.city].filter(Boolean).join(' · ') ||
              t('wallets.field.route.noAddress')}
          </div>
        </div>
        <div className="text-end">
          <div className="num type-body">
            {t('wallets.field.route.due')}: {formatMoney(stop.amount_due)}
          </div>
          {overdue && (
            <div className="num type-caption text-danger-600">
              {t('wallets.field.route.overdue')}: {formatMoney(stop.amount_overdue)} ·{' '}
              {t('wallets.field.route.daysLate', { days: formatNumber(stop.max_days_late) })}
            </div>
          )}
          {stop.next_due_date && (
            <div className="type-caption">
              {t('wallets.field.route.next', { date: formatBusinessDate(stop.next_due_date) })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {stop.customer.phone && (
          <a className="btn btn-secondary" href={`tel:${stop.customer.phone}`}>
            {t('wallets.field.route.call')}
          </a>
        )}
        {map && (
          <a className="btn btn-secondary" href={map} target="_blank" rel="noreferrer">
            {t('wallets.field.route.map')}
          </a>
        )}
        <Link
          className="btn btn-primary"
          to={`/collections/new?customer=${stop.customer.id}&mode=field`}
        >
          {t('wallets.field.route.collect')}
        </Link>
      </div>
    </li>
  );
}
