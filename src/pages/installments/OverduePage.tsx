import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  WARNING_OUTCOMES,
  type OverdueAction,
  type OverdueListQueryInput,
  type WarningOutcome,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Textarea from '@/components/ui/Textarea';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { useCollectorOptions } from './walletShared';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { overdueApi, overdueKeys } from '@/services/overdueApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

const TABS = ['contracts', 'warnings', 'referrals'] as const;
type Tab = (typeof TABS)[number];

/**
 * N04 (D79): overdue tracking. The nightly check (00:30 shop time) marks what late contracts need:
 * a warning the first day and every few days after, a ban past the shop's ban days, a legal
 * referral past the legal days. Nothing is ever added to what a customer owes (no late fees,
 * Islamic finance rule 4). Every branch of the shop is listed (overdue.view).
 */
export default function OverduePage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get('tab') as Tab | null;
    return requested && TABS.includes(requested) ? requested : 'contracts';
  });
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  return (
    <PageContainer>
      <PageHeader
        title={t('overdue.title')}
        description={t('overdue.description')}
        actions={isOwner ? <RunCheckButton /> : undefined}
      />
      <div
        role="tablist"
        aria-label={t('overdue.title')}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((id, index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            id={`overdue-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`overdue-panel-${id}`}
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
            {t(`overdue.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`overdue-panel-${tab}`} aria-labelledby={`overdue-tab-${tab}`}>
        {tab === 'contracts' && <ContractsTab />}
        {tab === 'warnings' && <WarningsTab />}
        {tab === 'referrals' && <ReferralsTab isOwner={isOwner} />}
      </div>
    </PageContainer>
  );
}

function RunCheckButton() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await overdueApi.run();
      setMessage({
        tone: 'success',
        text: t('overdue.run.done', {
          warnings: formatNumber(r.warnings_created),
          blocked: formatNumber(r.customers_blocked),
          referrals: formatNumber(r.legal_referrals),
        }),
      });
      void cache.invalidateQueries({ queryKey: overdueKeys.all(orgId) });
    } catch {
      setMessage({ tone: 'error', text: t('overdue.run.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="secondary" loading={busy} onClick={() => void run()}>
        {t('overdue.run.button')}
      </Button>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}

function useBranchOptions() {
  const branches = useBranches();
  return [
    { value: '', label: t('overdue.filters.allBranches') },
    ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
}

function branchName(branches: { id: string; name: string }[] | undefined, id: string) {
  return branches?.find((b) => b.id === id)?.name ?? '—';
}

function ContractsTab() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const branchOptions = useBranchOptions();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [minDays, setMinDays] = useState('');
  // N06: managers filter by collector; a collector already sees only their own customers.
  const canFilterCollector = useCan('collector.settle');
  const collectorOptions = useCollectorOptions(canFilterCollector);
  const [collector, setCollector] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const min = Number(minDays);
  const filters: OverdueListQueryInput = {
    ...(q ? { q } : {}),
    ...(branch ? { branch_id: branch } : {}),
    ...(collector ? { collector_id: collector } : {}),
    ...(Number.isInteger(min) && min >= 1 ? { min_days: min } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: overdueKeys.list(orgId, filters),
    queryFn: ({ pageParam }) =>
      overdueApi.list({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = list.data?.pages[0]?.totals;

  return (
    <div className="space-y-6">
      {totals && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Stat label={t('overdue.totals.contracts')} value={formatNumber(totals.contracts)} />
          <Stat
            label={t('overdue.totals.overdueAmount')}
            value={formatMoney(totals.overdue_amount)}
            danger={totals.overdue_amount !== '0.00'}
          />
          <Stat label={t('overdue.totals.late_1_30')} value={formatMoney(totals.late_1_30)} />
          <Stat label={t('overdue.totals.late_31_60')} value={formatMoney(totals.late_31_60)} />
          <Stat label={t('overdue.totals.late_61_90')} value={formatMoney(totals.late_61_90)} />
          <Stat label={t('overdue.totals.late_90_plus')} value={formatMoney(totals.late_90_plus)} />
        </div>
      )}
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <SearchInput
              value={input}
              onValueChange={setInput}
              placeholder={t('overdue.filters.search')}
              aria-label={t('overdue.filters.search')}
            />
          </div>
          <div className="w-48">
            <Select
              label={t('overdue.filters.branch')}
              options={branchOptions}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          {canFilterCollector && (
            <div className="w-48">
              <Select
                label={t('wallets.overdue.collector')}
                options={[
                  { value: '', label: t('wallets.overdue.allCollectors') },
                  ...collectorOptions.options,
                ]}
                value={collector}
                onChange={(e) => setCollector(e.target.value)}
              />
            </div>
          )}
          <div className="w-36">
            <NumberInput
              label={t('overdue.filters.minDays')}
              decimals={0}
              value={minDays}
              onValueChange={setMinDays}
            />
          </div>
        </div>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <ErrorState title={t('overdue.loadFailed')} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('overdue.contracts.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>{t('overdue.columns.contract')}</th>
                  <th className={th}>{t('overdue.columns.customer')}</th>
                  <th className={th}>{t('overdue.columns.branch')}</th>
                  <th className={thNum}>{t('overdue.columns.overdueAmount')}</th>
                  <th className={thNum}>{t('overdue.columns.daysLate')}</th>
                  <th className={th}>{t('overdue.columns.oldestDue')}</th>
                  <th className={thNum}>{t('overdue.columns.remaining')}</th>
                  <th className={th}>{t('overdue.columns.flags')}</th>
                  <th className={th}>
                    <span className="sr-only">{t('overdue.contracts.collect')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.contract.id} className="border-b border-line last:border-0">
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
                    </td>
                    <td className={td}>{branchName(branches.data, row.contract.branch_id)}</td>
                    <td className={`${tdNum} text-danger-600`}>
                      <span className="num">{formatMoney(row.overdue_amount)}</span>
                    </td>
                    <td className={tdNum}>
                      <span className="num">{formatNumber(row.max_days_late)}</span>
                    </td>
                    <td className={td}>{formatBusinessDate(row.oldest_due_date)}</td>
                    <td className={tdNum}>
                      <span className="num">{formatMoney(row.remaining)}</span>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {row.customer.status === 'blocked' && (
                          <Badge tone="danger">{t('overdue.flags.blocked')}</Badge>
                        )}
                        {row.open_warning && (
                          <Badge tone="warning">{t('overdue.flags.warning')}</Badge>
                        )}
                        {row.legal_referral && (
                          <Badge tone="danger">
                            {t(`overdue.flags.legal.${row.legal_referral.status}`)}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={td}>
                      <Link
                        to={`/collections/new?customer=${row.customer.id}&contract=${row.contract.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        {t('overdue.contracts.collect')}
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
                  {t('overdue.more')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <div className="type-caption">{label}</div>
      <div className={cn('type-section-title num mt-1', danger && 'text-danger-600')}>{value}</div>
    </Card>
  );
}

/** Warnings and legal referrals share one table: the record, then what the row can do. */
function ActionsTable({
  items,
  kind,
  action,
}: {
  items: OverdueAction[];
  kind: 'warnings' | 'referrals';
  action: (a: OverdueAction) => ReactNode;
}) {
  const branches = useBranches();
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>{t('overdue.columns.date')}</th>
            <th className={th}>{t('overdue.columns.contract')}</th>
            <th className={th}>{t('overdue.columns.customer')}</th>
            <th className={th}>{t('overdue.columns.branch')}</th>
            <th className={thNum}>{t('overdue.columns.daysLateThen')}</th>
            <th className={thNum}>{t('overdue.columns.overdueNow')}</th>
            <th className={th}>{t('overdue.columns.status')}</th>
            <th className={th}>
              <span className="sr-only">{t(`overdue.${kind}.actions`)}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0 align-top">
              <td className={td}>{formatBusinessDate(a.business_date)}</td>
              <td className={td}>
                <Link
                  to={`/contracts/${a.contract.id}`}
                  className="link num whitespace-nowrap"
                  dir="ltr"
                >
                  {a.contract.number}
                </Link>
              </td>
              <td className={td}>
                <div dir="auto">{a.customer.name}</div>
                <div className="type-caption" dir="ltr">
                  {a.customer.phone ?? '—'}
                </div>
              </td>
              <td className={td}>{branchName(branches.data, a.contract.branch_id)}</td>
              <td className={tdNum}>
                <span className="num">{formatNumber(a.days_late)}</span>
              </td>
              <td className={tdNum}>
                <span className="num">{formatMoney(a.current.overdue_amount)}</span>
              </td>
              <td className={td}>
                <div>{t(`overdue.status.${a.status}`)}</div>
                {a.outcome && (
                  <div className="type-caption">{t(`overdue.outcomes.${a.outcome}`)}</div>
                )}
                {a.note && (
                  <div className="type-caption" dir="auto">
                    {a.note}
                  </div>
                )}
                {a.handled_by_name && (
                  <div className="type-caption" dir="auto">
                    {a.handled_by_name}
                  </div>
                )}
              </td>
              <td className={td}>{action(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarningsTab() {
  const orgId = useAuthStore((s) => s.orgId);
  const canHandle = useCan('overdue.handle');
  const branchOptions = useBranchOptions();
  const [status, setStatus] = useState<'open' | 'handled' | 'all'>('open');
  const [branch, setBranch] = useState('');
  const [handling, setHandling] = useState<OverdueAction | null>(null);
  const [done, setDone] = useState('');
  const filters = { status, ...(branch ? { branch_id: branch } : {}) };
  const list = useInfiniteQuery({
    queryKey: overdueKeys.warnings(orgId, filters),
    queryFn: ({ pageParam }) =>
      overdueApi.warnings({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card>
      <p className="type-caption mb-4">{t('overdue.warnings.help')}</p>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Select
            label={t('overdue.filters.status')}
            options={(['open', 'handled', 'all'] as const).map((v) => ({
              value: v,
              label: t(`overdue.warnings.filter.${v}`),
            }))}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          />
        </div>
        <div className="w-48">
          <Select
            label={t('overdue.filters.branch')}
            options={branchOptions}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
      </div>
      {done && (
        <div className="mb-4">
          <Notice tone="success">{done}</Notice>
        </div>
      )}
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <ErrorState title={t('overdue.loadFailed')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('overdue.warnings.empty')} />
      ) : (
        <>
          <ActionsTable
            items={items}
            kind="warnings"
            action={(a) =>
              canHandle && a.status === 'open' ? (
                <Button size="sm" className="whitespace-nowrap" onClick={() => setHandling(a)}>
                  {t('overdue.warnings.handle')}
                </Button>
              ) : null
            }
          />
          {list.hasNextPage && (
            <div className="mt-4">
              <Button
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t('overdue.more')}
              </Button>
            </div>
          )}
        </>
      )}
      {handling && (
        <HandleDialog
          warning={handling}
          onClose={() => setHandling(null)}
          onDone={() => {
            setHandling(null);
            setDone(t('overdue.warnings.done'));
          }}
        />
      )}
    </Card>
  );
}

function HandleDialog({
  warning,
  onClose,
  onDone,
}: {
  warning: OverdueAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [outcome, setOutcome] = useState<WarningOutcome>('contacted');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = outcome !== 'other' || note.trim().length >= 3;

  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      await overdueApi.handleWarning(warning.id, {
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      void cache.invalidateQueries({ queryKey: overdueKeys.all(orgId) });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'OVERDUE_ACTION_NOT_OPEN'
          ? t('overdue.errors.notOpen')
          : t('overdue.errors.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('overdue.warnings.dialogTitle', { number: warning.contract.number })}
      description={t('overdue.warnings.dialogDescription', {
        name: warning.customer.name,
        amount: formatMoney(warning.current.overdue_amount),
      })}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('overdue.cancel')}
          </Button>
          <Button loading={busy} disabled={!ok || busy} onClick={() => void save()}>
            {t('overdue.warnings.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label={t('overdue.warnings.outcome')}
          options={WARNING_OUTCOMES.map((v) => ({ value: v, label: t(`overdue.outcomes.${v}`) }))}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as WarningOutcome)}
        />
        <Textarea
          label={t('overdue.warnings.note')}
          help={outcome === 'other' ? t('overdue.warnings.noteRequired') : t('overdue.optional')}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

function ReferralsTab({ isOwner }: { isOwner: boolean }) {
  const orgId = useAuthStore((s) => s.orgId);
  const branchOptions = useBranchOptions();
  const [status, setStatus] = useState<'open' | 'dismissed' | 'case_opened' | 'all'>('open');
  const [branch, setBranch] = useState('');
  const [dismissing, setDismissing] = useState<OverdueAction | null>(null);
  const [done, setDone] = useState('');
  const filters = { status, ...(branch ? { branch_id: branch } : {}) };
  const list = useInfiniteQuery({
    queryKey: overdueKeys.referrals(orgId, filters),
    queryFn: ({ pageParam }) =>
      overdueApi.referrals({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card>
      <p className="type-caption mb-4">{t('overdue.referrals.help')}</p>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Select
            label={t('overdue.filters.status')}
            options={(['open', 'dismissed', 'case_opened', 'all'] as const).map((v) => ({
              value: v,
              label: t(`overdue.referrals.filter.${v}`),
            }))}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          />
        </div>
        <div className="w-48">
          <Select
            label={t('overdue.filters.branch')}
            options={branchOptions}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
      </div>
      {done && (
        <div className="mb-4">
          <Notice tone="success">{done}</Notice>
        </div>
      )}
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <ErrorState title={t('overdue.loadFailed')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('overdue.referrals.empty')} />
      ) : (
        <>
          <ActionsTable
            items={items}
            kind="referrals"
            action={(a) =>
              isOwner && a.status === 'open' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="whitespace-nowrap"
                  onClick={() => setDismissing(a)}
                >
                  {t('overdue.referrals.dismiss')}
                </Button>
              ) : null
            }
          />
          {list.hasNextPage && (
            <div className="mt-4">
              <Button
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t('overdue.more')}
              </Button>
            </div>
          )}
        </>
      )}
      {dismissing && (
        <DismissDialog
          referral={dismissing}
          onClose={() => setDismissing(null)}
          onDone={() => {
            setDismissing(null);
            setDone(t('overdue.referrals.done'));
          }}
        />
      )}
    </Card>
  );
}

function DismissDialog({
  referral,
  onClose,
  onDone,
}: {
  referral: OverdueAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = reason.trim().length >= 3;

  async function dismiss() {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      await overdueApi.dismissReferral(referral.id, { reason: reason.trim() });
      void cache.invalidateQueries({ queryKey: overdueKeys.all(orgId) });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'OVERDUE_ACTION_NOT_OPEN'
          ? t('overdue.errors.notOpen')
          : t('overdue.errors.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('overdue.referrals.dialogTitle', { number: referral.contract.number })}
      description={t('overdue.referrals.dialogDescription')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('overdue.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ok || busy}
            onClick={() => void dismiss()}
          >
            {t('overdue.referrals.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Textarea
          label={t('overdue.referrals.reason')}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
