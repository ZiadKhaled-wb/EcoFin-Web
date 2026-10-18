import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ContractChangeKind, ContractChangeListQueryInput } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DateInput from '@/components/ui/DateInput';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { contractChangeKeys, contractChangesApi } from '@/services/contractChangesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const KINDS = ['early_settlement', 'reschedule', 'write_off'] as const;
const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/**
 * N05 (D80): the shop's early settlements, reschedules and write-offs, newest first, with what
 * each carried and the profit waived; totals per kind for the filters (the write-off and waiver
 * figures the reports read). No figure is ever called interest or a promised discount.
 */
export default function ContractChangesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const fromId = useId();
  const toId = useId();
  const [kind, setKind] = useState<'' | ContractChangeKind>('');
  const [branch, setBranch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const datesOk = !from || !to || from <= to;
  const filters: ContractChangeListQueryInput = {
    ...(kind ? { kind } : {}),
    ...(branch ? { branch_id: branch } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: contractChangeKeys.list(orgId, filters),
    queryFn: ({ pageParam }) =>
      contractChangesApi.list({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled: datesOk,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = list.data?.pages[0]?.totals ?? [];
  const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? '—';

  return (
    <PageContainer>
      <PageHeader
        title={t('contractChanges.list.title')}
        description={t('contractChanges.list.description')}
      />
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <Select
                label={t('contractChanges.list.kind')}
                options={[
                  { value: '', label: t('contractChanges.list.allKinds') },
                  ...KINDS.map((k) => ({ value: k, label: t(`contractChanges.kind.${k}`) })),
                ]}
                value={kind}
                onChange={(e) => setKind(e.target.value as '' | ContractChangeKind)}
              />
            </div>
            <div className="w-48">
              <Select
                label={t('overdue.filters.branch')}
                options={[
                  { value: '', label: t('overdue.filters.allBranches') },
                  ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
                ]}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor={fromId}>
                {t('contractChanges.list.from')}
              </label>
              <DateInput id={fromId} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor={toId}>
                {t('contractChanges.list.to')}
              </label>
              <DateInput
                id={toId}
                value={to}
                invalid={!datesOk}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          {totals.length > 0 && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="change-totals">
              {totals
                .filter((x) => x.kind !== 'return_adjustment')
                .map((x) => (
                  <div key={x.kind}>
                    <dt className="type-caption">
                      {t(`contractChanges.kind.${x.kind}`)} · {formatNumber(x.count)}
                    </dt>
                    <dd className="num">{formatMoney(x.amount)}</dd>
                    {x.kind === 'early_settlement' && (
                      <dd className="type-caption">
                        {t('contractChanges.list.waived', {
                          amount: formatMoney(x.profit_waived),
                        })}
                      </dd>
                    )}
                  </div>
                ))}
            </dl>
          )}
        </Card>

        <Card padded={false}>
          {list.isPending && datesOk ? (
            <div className="p-4">
              <Skeleton className="h-32" />
            </div>
          ) : list.isError ? (
            <ErrorState
              title={t('contractChanges.list.loadFailed')}
              onRetry={() => void list.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState title={t('contractChanges.list.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('contractChanges.list.caption')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('contractChanges.list.date')}</th>
                    <th className={th}>{t('contractChanges.list.kind')}</th>
                    <th className={th}>{t('contractChanges.list.contract')}</th>
                    <th className={th}>{t('contractChanges.list.customer')}</th>
                    <th className={th}>{t('overdue.filters.branch')}</th>
                    <th className={thNum}>{t('contractChanges.list.amount')}</th>
                    <th className={thNum}>{t('contractChanges.list.profitWaived')}</th>
                    <th className={th}>{t('contractChanges.list.reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id} className="border-b border-line">
                      <td className={td}>
                        {x.business_date ? formatBusinessDate(x.business_date) : '—'}
                      </td>
                      <td className={td}>
                        <Badge tone={x.kind === 'write_off' ? 'danger' : 'neutral'}>
                          {t(`contractChanges.kind.${x.kind}`)}
                        </Badge>
                      </td>
                      <td className={td}>
                        <Link
                          to={`/contracts/${x.contract.id}`}
                          className="text-brand-700 hover:underline"
                          dir="ltr"
                        >
                          {x.contract.number}
                        </Link>
                      </td>
                      <td className={td}>
                        <bdi>{x.customer.name}</bdi>
                      </td>
                      <td className={td}>{branchName(x.contract.branch_id)}</td>
                      <td className={tdNum}>{x.amount ? formatMoney(x.amount) : '—'}</td>
                      <td className={tdNum}>{formatMoney(x.profit_waived)}</td>
                      <td className={td} dir="auto">
                        {x.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.hasNextPage && (
            <div className="p-4">
              <Button
                variant="ghost"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t('contractChanges.list.more')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
