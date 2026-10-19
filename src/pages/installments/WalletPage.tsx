import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Uuid, compareMoney } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import Can from '@/features/me/Can';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney } from '@/lib/format';
import { walletKeys, walletsApi } from '@/services/walletsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import SettleWalletDialog from './SettleWalletDialog';

const th = 'type-label px-3 py-2 text-start';
const thNum = 'type-label px-3 py-2 text-end';
const td = 'type-body px-3 py-2 text-start';
const tdNum = 'type-body whitespace-nowrap px-3 py-2 text-end num';

/**
 * N06 (D81): one wallet's ledger, newest first with the balance after each movement; a settlement
 * shows what was handed in and the shortage with its reason. Managers settle from here too.
 */
export default function WalletPage() {
  const { id = '' } = useParams();
  const valid = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const [settling, setSettling] = useState(false);
  const ledger = useInfiniteQuery({
    queryKey: walletKeys.ledger(orgId, id, {}),
    queryFn: ({ pageParam }) => walletsApi.ledger(id, pageParam ? { cursor: pageParam } : {}),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: valid,
  });
  const wallet = ledger.data?.pages[0]?.wallet;
  const items = ledger.data?.pages.flatMap((p) => p.items) ?? [];
  const missing = !valid || (ledger.error instanceof ApiError && ledger.error.status === 404);

  return (
    <PageContainer>
      <PageHeader
        title={
          wallet
            ? t('wallets.ledger.title', { name: wallet.collector.name })
            : t('wallets.list.title')
        }
        description={t('wallets.ledger.description')}
        actions={
          <Link to="/installments/wallets" className="btn btn-secondary">
            {t('wallets.ledger.back')}
          </Link>
        }
      />
      {missing ? (
        <EmptyState role="alert" title={t('wallets.errors.WALLET_NOT_FOUND')} />
      ) : ledger.isPending ? (
        <Skeleton className="h-40" />
      ) : ledger.isError ? (
        <ErrorState title={t('wallets.ledger.loadFailed')} onRetry={() => void ledger.refetch()} />
      ) : (
        <div className="space-y-4">
          {wallet && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="type-caption">{t('wallets.ledger.balance')}</div>
                  <div className="num type-section-title" data-testid="wallet-balance">
                    {formatMoney(wallet.balance)}
                  </div>
                  {wallet.oldest_unsettled_date && (
                    <div className="type-caption">
                      {t('wallets.ledger.oldest', {
                        date: formatBusinessDate(wallet.oldest_unsettled_date),
                      })}
                    </div>
                  )}
                </div>
                <Can permission="collector.settle">
                  <Button
                    disabled={compareMoney(wallet.balance, '0.00') <= 0}
                    onClick={() => setSettling(true)}
                  >
                    {t('wallets.list.settle')}
                  </Button>
                </Can>
              </div>
            </Card>
          )}
          <Card>
            {items.length === 0 ? (
              <EmptyState title={t('wallets.ledger.empty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={th}>{t('wallets.ledger.columns.date')}</th>
                      <th className={th}>{t('wallets.ledger.columns.type')}</th>
                      <th className={th}>{t('wallets.ledger.columns.number')}</th>
                      <th className={thNum}>{t('wallets.ledger.columns.amount')}</th>
                      <th className={thNum}>{t('wallets.ledger.columns.balance')}</th>
                      <th className={th}>{t('wallets.ledger.columns.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => (
                      <tr key={m.id} className="border-b border-line last:border-0">
                        <td className={td}>{formatDateTime(m.created_at)}</td>
                        <td className={td}>{t(`cash.ledger.type.${m.type}`)}</td>
                        <td className={td}>
                          <span dir="ltr">{m.source_number ?? '—'}</span>
                        </td>
                        <td className={tdNum}>{formatMoney(m.amount)}</td>
                        <td className={tdNum}>{formatMoney(m.balance_after)}</td>
                        <td className={td} dir="auto">
                          {m.settlement && m.settlement.shortage !== '0.00'
                            ? t('wallets.ledger.shortage', {
                                amount: formatMoney(m.settlement.shortage),
                                reason: m.settlement.reason ?? '',
                              })
                            : (m.note ?? '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ledger.hasNextPage && (
              <div className="mt-4">
                <Button
                  variant="secondary"
                  disabled={ledger.isFetchingNextPage}
                  onClick={() => void ledger.fetchNextPage()}
                >
                  {t('wallets.ledger.more')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
      {settling && wallet && (
        <SettleWalletDialog
          key={wallet.balance}
          wallet={wallet}
          onClose={() => setSettling(false)}
          onSettled={() => undefined}
        />
      )}
    </PageContainer>
  );
}
