import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LegalCaseListQueryInput } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { legalApi, legalKeys } from '@/services/legalApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { hearingIsSoon } from './legalErrors';
import { LegalStatusBadge } from './legalShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

const TABS = ['open', 'closed', 'all'] as const;
type Tab = (typeof TABS)[number];

/**
 * L01 + N09 (D92): the legal cases. The owner sees every case; a lawyer only the cases assigned to
 * them (the server filters). A case never changes what a customer owes: no fee, no cost.
 */
export default function LegalCasesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const [tab, setTab] = useState<Tab>('open');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [lawyer, setLawyer] = useState('');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  // The owner picks a lawyer to filter by; the list is the owner's alone (a lawyer's list is their own).
  const lawyers = useQuery({
    queryKey: legalKeys.lawyers(orgId),
    queryFn: legalApi.lawyers,
    enabled: isOwner,
  });

  const filters: LegalCaseListQueryInput = {
    status: tab,
    ...(q ? { q } : {}),
    ...(isOwner && lawyer ? { lawyer_id: lawyer } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: legalKeys.list(orgId, filters),
    queryFn: ({ pageParam }) =>
      legalApi.list({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const rows = list.data?.pages.flatMap((page) => page.rows) ?? [];

  function onTabKey(event: KeyboardEvent, index: number) {
    const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    const step = event.key === forward ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const moduleMissing = list.error instanceof ApiError && list.error.code === 'MODULE_NOT_IN_PLAN';

  return (
    <PageContainer>
      <PageHeader title={t('legal.title')} description={t('legal.description')} />
      <div
        role="tablist"
        aria-label={t('legal.title')}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((id, index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            id={`legal-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="legal-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, index)}
            className={cn(
              'type-body min-h-11 shrink-0 border-b-2 px-4 whitespace-nowrap transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-mute hover:text-ink',
            )}
          >
            {t(`legal.tabs.${id}`)}
          </button>
        ))}
      </div>
      <Card>
        <div
          role="tabpanel"
          id="legal-panel"
          aria-labelledby={`legal-tab-${tab}`}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-64 flex-1">
              <SearchInput
                value={input}
                onValueChange={setInput}
                placeholder={t('legal.filters.search')}
                aria-label={t('legal.filters.search')}
              />
            </div>
            {isOwner && (
              <div className="w-56">
                <Select
                  label={t('legal.filters.lawyer')}
                  options={[
                    { value: '', label: t('legal.filters.allLawyers') },
                    ...(lawyers.data?.items ?? []).map((l) => ({
                      value: l.id,
                      label: l.full_name,
                    })),
                  ]}
                  value={lawyer}
                  onChange={(e) => setLawyer(e.target.value)}
                />
              </div>
            )}
          </div>
          {list.isPending ? (
            <Skeleton className="h-40" />
          ) : list.isError ? (
            <ErrorState
              title={moduleMissing ? t('legal.errors.MODULE_NOT_IN_PLAN') : t('legal.loadFailed')}
              {...(moduleMissing ? {} : { onRetry: () => void list.refetch() })}
            />
          ) : rows.length === 0 ? (
            <EmptyState title={t(`legal.empty.${tab}`)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>{t('legal.columns.number')}</th>
                    <th className={th}>{t('legal.columns.contract')}</th>
                    <th className={th}>{t('legal.columns.customer')}</th>
                    <th className={th}>{t('legal.columns.lawyer')}</th>
                    <th className={th}>{t('legal.columns.status')}</th>
                    <th className={th}>{t('legal.columns.nextHearing')}</th>
                    <th className={thNum}>{t('legal.columns.claim')}</th>
                    <th className={thNum}>{t('legal.columns.remaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const soon = hearingIsSoon(row.next_hearing_date);
                    return (
                      <tr key={row.id} className="border-b border-line last:border-0 align-top">
                        <td className={td}>
                          <Link
                            to={`/legal/cases/${row.id}`}
                            className="link num whitespace-nowrap"
                            dir="ltr"
                          >
                            {row.number}
                          </Link>
                          {row.case_number && (
                            <div className="type-caption" dir="auto">
                              {t('legal.columns.courtNumber', { number: row.case_number })}
                            </div>
                          )}
                        </td>
                        <td className={td}>
                          <Link
                            to={`/contracts/${row.contract.id}`}
                            className="link num whitespace-nowrap"
                            dir="ltr"
                          >
                            {row.contract.number}
                          </Link>
                        </td>
                        <td className={td}>
                          <div dir="auto">{row.customer.name}</div>
                          <div className="type-caption" dir="ltr">
                            {row.customer.phone ?? '—'}
                          </div>
                          {row.customer.status === 'blocked' && (
                            <Badge tone="danger">{t('legal.blocked')}</Badge>
                          )}
                        </td>
                        <td className={td} dir="auto">
                          {row.lawyer?.name ?? t('legal.noLawyer')}
                        </td>
                        <td className={td}>
                          <LegalStatusBadge status={row.status} />
                        </td>
                        <td className={td}>
                          {row.next_hearing_date ? (
                            <span
                              className={cn(soon && 'font-semibold text-danger-600')}
                              data-soon={soon ? 'true' : undefined}
                            >
                              {formatBusinessDate(row.next_hearing_date)}
                              {soon && (
                                <span className="type-caption block">{t('legal.hearingSoon')}</span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={tdNum}>
                          <span className="num">{formatMoney(row.claim_amount)}</span>
                        </td>
                        <td className={tdNum}>
                          <span className="num">{formatMoney(row.remaining)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {list.hasNextPage && (
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    loading={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {t('legal.more')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}
