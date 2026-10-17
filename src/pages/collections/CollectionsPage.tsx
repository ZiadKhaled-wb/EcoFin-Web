import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ContractListQueryInput } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import SearchInput from '@/components/ui/SearchInput';
import Skeleton from '@/components/ui/Skeleton';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { collectionKeys, collectionsApi } from '@/services/collectionsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/**
 * N03 (D78): find a contract or a customer to collect from: contract number, name, phone or the
 * exact national ID, across every branch (a customer may pay anywhere). A row opens the collect
 * screen with that contract ticked.
 */
export default function CollectionsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const filters: ContractListQueryInput = {
    ...(q ? { q } : {}),
    ...(overdue ? { overdue: 'true' as const } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: collectionKeys.contracts(orgId, filters),
    queryFn: ({ pageParam }) =>
      collectionsApi.contracts({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('collections.search.title')}
        description={t('collections.search.description')}
      />
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <SearchInput
              value={input}
              onValueChange={setInput}
              placeholder={t('collections.search.placeholder')}
              aria-label={t('collections.search.placeholder')}
            />
          </div>
          <Checkbox
            label={t('collections.search.overdueOnly')}
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />
        </div>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <ErrorState
            title={t('collections.search.loadFailed')}
            onRetry={() => void list.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState title={t('collections.search.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>{t('collections.search.columns.contract')}</th>
                  <th className={th}>{t('collections.search.columns.customer')}</th>
                  <th className={th}>{t('collections.search.columns.phone')}</th>
                  <th className={thNum}>{t('collections.search.columns.remaining')}</th>
                  <th className={thNum}>{t('collections.search.columns.overdue')}</th>
                  <th className={thNum}>{t('collections.search.columns.daysLate')}</th>
                  <th className={th}>{t('collections.search.columns.nextDue')}</th>
                  <th className={th}>
                    <span className="sr-only">{t('collections.search.collect')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className={td}>
                      <Link to={`/contracts/${c.id}`} className="link num" dir="ltr">
                        {c.number}
                      </Link>
                    </td>
                    <td className={td} dir="auto">
                      {c.customer.name}
                    </td>
                    <td className={td}>
                      <span dir="ltr">{c.customer.phone ?? '—'}</span>
                    </td>
                    <td className={tdNum}>
                      <span className="num">{formatMoney(c.remaining)}</span>
                    </td>
                    <td
                      className={`${tdNum} ${c.overdue_amount !== '0.00' ? 'text-danger-600' : ''}`}
                    >
                      <span className="num">{formatMoney(c.overdue_amount)}</span>
                    </td>
                    <td className={tdNum}>
                      <span className="num">
                        {c.max_days_late ? formatNumber(c.max_days_late) : '—'}
                      </span>
                    </td>
                    <td className={td}>
                      {c.next_due_date ? formatBusinessDate(c.next_due_date) : '—'}
                    </td>
                    <td className={td}>
                      <Link
                        to={`/collections/new?customer=${c.customer.id}&contract=${c.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        {t('collections.search.collect')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.hasNextPage && (
              <div className="mt-4">
                <Button
                  variant="secondary"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  {t('collections.search.more')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
