import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { compareMoney, type WalletRow } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import Can from '@/features/me/Can';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { walletKeys, walletsApi } from '@/services/walletsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import SettleWalletDialog from './SettleWalletDialog';

const th = 'type-label px-3 py-2 text-start';
const thNum = 'type-label px-3 py-2 text-end';
const td = 'type-body px-3 py-2 text-start';
const tdNum = 'type-body whitespace-nowrap px-3 py-2 text-end num';

/**
 * N06 (D81): every collector's wallet with its balance, the oldest cash still in it and the last
 * settlement; a wallet opens its ledger, and a manager (collector.settle) settles it into a safe.
 * Collectors are salaried: there is no commission anywhere.
 */
export default function WalletsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const list = useQuery({ queryKey: walletKeys.list(orgId), queryFn: walletsApi.list });
  const [settling, setSettling] = useState<WalletRow | null>(null);
  const rows = list.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader title={t('wallets.list.title')} description={t('wallets.list.description')} />
      <Card>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <ErrorState title={t('wallets.list.loadFailed')} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('wallets.list.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>{t('wallets.list.columns.collector')}</th>
                  <th className={th}>{t('wallets.list.columns.branch')}</th>
                  <th className={thNum}>{t('wallets.list.columns.balance')}</th>
                  <th className={th}>{t('wallets.list.columns.oldest')}</th>
                  <th className={th}>{t('wallets.list.columns.last')}</th>
                  <th className={th}>
                    <span className="sr-only">{t('wallets.list.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="border-b border-line last:border-0" data-wallet={w.id}>
                    <td className={td} dir="auto">
                      {w.collector.name}
                    </td>
                    <td className={td} dir="auto">
                      {w.branch_name ?? '—'}
                    </td>
                    <td className={tdNum}>{formatMoney(w.balance)}</td>
                    <td className={td}>
                      {w.oldest_unsettled_date ? formatBusinessDate(w.oldest_unsettled_date) : '—'}
                    </td>
                    <td className={td}>
                      {w.last_settlement
                        ? `${formatMoney(w.last_settlement.handed)} · ${formatBusinessDate(w.last_settlement.business_date)}`
                        : t('wallets.list.none')}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <Link className="btn btn-secondary" to={`/installments/wallets/${w.id}`}>
                          {t('wallets.list.open')}
                        </Link>
                        <Can permission="collector.settle">
                          <Button
                            disabled={compareMoney(w.balance, '0.00') <= 0}
                            onClick={() => setSettling(w)}
                          >
                            {t('wallets.list.settle')}
                          </Button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {settling && (
        <SettleWalletDialog
          key={`${settling.id}-${settling.balance}`}
          wallet={rows.find((w) => w.id === settling.id) ?? settling}
          onClose={() => setSettling(null)}
          onSettled={() => undefined}
        />
      )}
    </PageContainer>
  );
}
