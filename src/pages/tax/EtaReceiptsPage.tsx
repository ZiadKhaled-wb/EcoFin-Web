import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  FiscalSituationFilter,
  type FiscalListItem,
  type FiscalListQuery,
  type FiscalRetryManyResult,
} from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import DataTable from '@/components/ui/DataTable';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import PageContainer from '@/components/ui/PageContainer';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import PageHeader from '@/components/layout/PageHeader';
import { useCan } from '@/features/me/useCan';
import { useBranches } from '@/features/me/useBranches';
import { useMe } from '@/features/me/useMe';
import {
  SITUATION_TONE,
  fiscalErrorText,
  relativeTime,
  skipReasonText,
} from '@/features/fiscal/fiscalText';
import { useFiscalAction, useFiscalList, useFiscalSummary } from '@/features/fiscal/useFiscal';
import { fiscalApi } from '@/services/fiscalApi';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import FiscalDrawer from './FiscalDrawer';

const PAGE_SIZE = 20;
type CardKey = 'blocked' | 'send_failed' | 'rejected' | 'due_soon' | 'overdue' | 'accepted_today';
const CARDS: CardKey[] = [
  'blocked',
  'send_failed',
  'rejected',
  'due_soon',
  'overdue',
  'accepted_today',
];
const TONE: Record<CardKey, string> = {
  blocked: 'text-ochre-700',
  send_failed: 'text-danger-600',
  rejected: 'text-danger-600',
  due_soon: 'text-ochre-700',
  overdue: 'text-danger-600',
  accepted_today: 'text-success-700',
};

function today(zone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Tax -> ETA receipts (T03, EC-91): every receipt with its situation and deadline, and the way to fix the ones that need a person. */
export default function EtaReceiptsPage() {
  const [params] = useSearchParams();
  const canRetry = useCan('fiscal.retry');
  const branches = useBranches();
  const me = useMe();
  const summary = useFiscalSummary();
  const initial = FiscalSituationFilter.safeParse(params.get('situation'));
  const [q, setQ] = useState('');
  // K04: the day close links here with the branch and the day.
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [branch, setBranch] = useState(params.get('branch_id') ?? '');
  const [situation, setSituation] = useState<string>(initial.success ? initial.data : '');
  // The two deadline cards filter what is on the page (the server filters by situation).
  const [deadline, setDeadline] = useState<'due_soon' | 'overdue' | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalRetryManyResult | null>(null);

  const valid = !from || !to || from <= to;
  const query: FiscalListQuery = {
    limit: deadline ? 100 : PAGE_SIZE,
    offset: deadline ? 0 : (page - 1) * PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(branch ? { branch_id: branch } : {}),
    ...(situation ? { situation: FiscalSituationFilter.parse(situation) } : {}),
  };
  const list = useFiscalList(valid ? query : { limit: PAGE_SIZE, offset: 0 });
  const items = (list.data?.items ?? []).filter((i) => !deadline || i.deadline_state === deadline);
  const retryMany = useFiscalAction((ids: string[]) => fiscalApi.retryMany(ids));

  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setDeadline(null);
    setPage(1);
    setSelected([]);
  };
  function pickCard(card: CardKey) {
    setPage(1);
    setSelected([]);
    setQ('');
    if (card === 'due_soon' || card === 'overdue') {
      setSituation('');
      setFrom('');
      setTo('');
      setDeadline(card);
    } else if (card === 'accepted_today') {
      const day = today(me.data?.org.timezone ?? 'Africa/Cairo');
      setDeadline(null);
      setSituation('accepted');
      setFrom(day);
      setTo(day);
    } else {
      setDeadline(null);
      setSituation(card);
      setFrom('');
      setTo('');
    }
  }
  const activeCard: CardKey | null = deadline
    ? deadline
    : situation === 'accepted' && from
      ? 'accepted_today'
      : (CARDS.find((c) => c === situation) ?? null);

  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  const names = new Map(items.map((i) => [i.id, i.sale_number]));

  function retrySelected() {
    const ids = selected;
    retryMany.mutate(ids, {
      onSuccess: (done) => {
        setResult({
          ...done,
          skipped: done.skipped.map((s) => ({ ...s })),
        });
        setSelected([]);
      },
      onError: (e) => notify.error(fiscalErrorText(e)),
    });
  }

  const columns: ColumnDef<FiscalListItem>[] = [
    ...(canRetry
      ? [
          {
            id: 'select',
            header: t('fiscal.columns.select'),
            cell: ({ row }) => (
              <Checkbox
                label={<span className="sr-only">{row.original.sale_number}</span>}
                checked={selected.includes(row.original.id)}
                onChange={() => toggle(row.original.id)}
              />
            ),
          } satisfies ColumnDef<FiscalListItem>,
        ]
      : []),
    {
      id: 'sale',
      header: t('fiscal.columns.sale'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link className="btn-link" to={`/sales/${row.original.sale_id}`}>
            {row.original.sale_number}
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(row.original.id)}
            aria-label={t('fiscal.drawer.title', { sale: row.original.sale_number })}
          >
            {t('fiscal.columns.details')}
          </Button>
        </span>
      ),
    },
    {
      accessorKey: 'issued_at',
      header: t('fiscal.columns.time'),
      cell: ({ row }) => formatDateTime(row.original.issued_at),
    },
    {
      id: 'branch',
      header: t('fiscal.columns.branch'),
      cell: ({ row }) => row.original.branch_name,
    },
    {
      id: 'device',
      header: t('fiscal.columns.device'),
      cell: ({ row }) => row.original.device_name ?? t('fiscal.noDevice'),
    },
    {
      accessorKey: 'total',
      header: t('fiscal.columns.total'),
      meta: { numeric: true },
      cell: ({ row }) => (row.original.total ? formatMoney(row.original.total) : '-'),
    },
    {
      id: 'situation',
      header: t('fiscal.columns.situation'),
      cell: ({ row }) => (
        <Badge tone={SITUATION_TONE[row.original.situation]}>
          {t(`fiscal.situation.${row.original.situation}`)}
        </Badge>
      ),
    },
    {
      id: 'error',
      header: t('fiscal.columns.error'),
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-64 break-words">{row.original.short_error ?? ''}</span>
      ),
    },
    {
      id: 'deadline',
      header: t('fiscal.columns.deadline'),
      cell: ({ row }) => {
        const { deadline_at: at, deadline_state: state } = row.original;
        if (!at) return t('fiscal.deadline.none');
        return (
          <span
            className={cn(
              state === 'overdue' && 'font-medium text-danger-600',
              state === 'due_soon' && 'text-ochre-700',
            )}
            data-deadline={state}
          >
            {relativeTime(at)}
          </span>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader title={t('fiscal.title')} description={t('fiscal.subtitle')} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {CARDS.map((card) => (
          <button
            key={card}
            type="button"
            onClick={() => pickCard(card)}
            aria-pressed={activeCard === card}
            className={cn('card text-start', activeCard === card && 'ring-2 ring-brand-600')}
          >
            <span className="type-caption block">{t(`fiscal.cards.${card}`)}</span>
            <span className={cn('num block text-2xl font-semibold', TONE[card])}>
              {summary.data?.[card] ?? '-'}
            </span>
          </button>
        ))}
      </div>
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            label={t('fiscal.filters.search')}
            value={q}
            onChange={(e) => change(setQ, e.target.value)}
          />
          <FormField
            label={t('fiscal.filters.from')}
            type="date"
            value={from}
            onChange={(e) => change(setFrom, e.target.value)}
          />
          <FormField
            label={t('fiscal.filters.to')}
            type="date"
            value={to}
            onChange={(e) => change(setTo, e.target.value)}
          />
          <Select
            label={t('fiscal.filters.branch')}
            value={branch}
            onChange={(e) => change(setBranch, e.target.value)}
            options={[
              { value: '', label: t('fiscal.filters.all') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <Select
            label={t('fiscal.filters.situation')}
            value={situation}
            onChange={(e) => change(setSituation, e.target.value)}
            options={[
              { value: '', label: t('fiscal.filters.all') },
              { value: 'problem', label: t('fiscal.filters.problem') },
              ...(
                ['waiting', 'accepted', 'cancelled', 'blocked', 'send_failed', 'rejected'] as const
              ).map((s) => ({ value: s, label: t(`fiscal.situation.${s}`) })),
            ]}
          />
        </div>
        <FormError message={!valid ? t('fiscal.filters.dateInvalid') : ''} />
      </Card>

      {canRetry && (
        <div className="mb-3 flex items-center gap-3">
          <Button
            variant="secondary"
            disabled={selected.length === 0}
            loading={retryMany.isPending}
            onClick={retrySelected}
          >
            {selected.length > 0
              ? t('fiscal.retrySelectedCount', { count: selected.length })
              : t('fiscal.retrySelected')}
          </Button>
        </div>
      )}
      {result && (
        <div className="mb-3 space-y-2" data-testid="bulk-result">
          <Notice tone="success">{t('fiscal.bulk.done', { count: result.done })}</Notice>
          {result.skipped.length > 0 && (
            <Notice tone="error">
              {t('fiscal.bulk.skipped', { count: result.skipped.length })}
              <ul className="list-disc ps-5">
                {result.skipped.map((s) => (
                  <li key={s.id}>
                    {t('fiscal.bulk.skippedRow', {
                      sale: names.get(s.id) ?? t('fiscal.bulk.unknownSale'),
                      reason: skipReasonText(s.reason),
                    })}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      )}

      <DataTable
        caption={t('fiscal.title')}
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={{ title: t('fiscal.empty') }}
        server={{
          page: deadline ? 1 : page,
          pageSize: deadline ? 100 : PAGE_SIZE,
          total: deadline ? items.length : (list.data?.total_count ?? 0),
          onPageChange: (next) => {
            setPage(next);
            setSelected([]);
          },
        }}
      />
      <FiscalDrawer key={open ?? 'none'} id={open} onClose={() => setOpen(null)} />
    </PageContainer>
  );
}
