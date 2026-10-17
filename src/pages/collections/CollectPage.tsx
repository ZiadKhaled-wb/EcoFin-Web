import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PositiveMoney,
  Uuid,
  compareMoney,
  roundMoney,
  sumMoney,
  type CollectionPreview,
  type ContractListItem,
  type Money,
  type SalePaymentInput,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import Skeleton from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { collectionKeys, collectionsApi } from '@/services/collectionsApi';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import PaymentDialog from '../sales/PaymentDialog';

const ZERO: Money = '0.00';
const positive = (v: string): Money | null => {
  const parsed = PositiveMoney.safeParse(v);
  return parsed.success ? roundMoney(parsed.data) : null;
};
const above0 = (v: string) => compareMoney(v, ZERO) > 0;

/** The codes that mean "what the screen showed is out of date": reload and let the cashier look. */
const STALE: Record<string, 'dueChanged' | 'exceeds' | 'notOpen'> = {
  COLLECTION_DUE_CHANGED: 'dueChanged',
  COLLECTION_EXCEEDS_REMAINING: 'exceeds',
  CONTRACT_NOT_OPEN: 'notOpen',
};

/**
 * N03 (D78): take a payment on one or several contracts of one customer. The cashier ticks the
 * contracts and gives each an amount (quick amounts: the next installment, everything overdue, the
 * whole contract); the server's preview shows which installments it pays (oldest first, profit
 * then principal). More than what is left is refused here and by the server; no late fees ever
 * (Islamic finance rule 4). The payment itself is S02's dialog: cash and bank transfers.
 */
export default function CollectPage() {
  const [params] = useSearchParams();
  const customerId = params.get('customer') ?? '';
  const contractParam = params.get('contract');
  const validCustomer = Uuid.safeParse(customerId).success;
  const ticked = contractParam && Uuid.safeParse(contractParam).success ? contractParam : null;
  const orgId = useAuthStore((s) => s.orgId);
  const current = useQuery({ queryKey: shiftKeys.current(orgId), queryFn: shiftsApi.current });

  if (!validCustomer)
    return (
      <PageContainer>
        <EmptyState role="alert" title={t('collections.collect.notFound')} />
      </PageContainer>
    );

  return (
    <PageContainer>
      <PageHeader
        title={t('collections.collect.title')}
        description={t('collections.collect.description')}
      />
      {current.data?.device_revoked ||
      (current.error instanceof ApiError && current.error.code === 'DEVICE_REVOKED') ? (
        <Notice tone="error">{t('collections.collect.revoked')}</Notice>
      ) : current.isPending ? (
        <Skeleton className="h-40" />
      ) : current.isError ? (
        <ErrorState
          title={t('collections.collect.loadFailed')}
          onRetry={() => void current.refetch()}
        />
      ) : !current.data ? (
        <Card>
          <div className="space-y-3">
            <Notice tone="info">{t('collections.collect.noShift')}</Notice>
            <Link to="/accounting/shifts" className="btn btn-primary">
              {t('collections.collect.noShiftAction')}
            </Link>
          </div>
        </Card>
      ) : (
        <Collect customerId={customerId} ticked={ticked} />
      )}
    </PageContainer>
  );
}

function Collect({ customerId, ticked }: { customerId: string; ticked: string | null }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const contracts = useQuery({
    queryKey: collectionKeys.contracts(orgId, { customer_id: customerId }),
    queryFn: () => collectionsApi.contracts({ customer_id: customerId, limit: 100 }),
  });
  const open = useMemo(
    () => (contracts.data?.items ?? []).filter((c) => above0(c.remaining)),
    [contracts.data],
  );
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /** What each contract's card last heard from the server: what is left (expected_remaining). */
  const [remaining, setRemaining] = useState<Record<string, Money>>({});
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<'dueChanged' | 'exceeds' | 'notOpen' | null>(null);

  // The ticked contract from the link, or the only open one, until the cashier ticks for themself.
  const defaultId =
    ticked && open.some((c) => c.id === ticked) ? ticked : open.length === 1 ? open[0]!.id : null;
  const isPicked = (id: string) => picked[id] ?? id === defaultId;

  const chosen = open.filter((c) => isPicked(c.id));
  const lines = chosen.map((c) => ({ c, amount: positive(amounts[c.id] ?? '') }));
  const valid =
    lines.length > 0 &&
    lines.every(
      ({ c, amount }) =>
        amount !== null &&
        remaining[c.id] !== undefined &&
        compareMoney(amount, remaining[c.id]!) <= 0,
    );
  const total = sumMoney(lines.map((l) => l.amount ?? ZERO));
  // The idempotency key belongs to what is sent: the same collection twice (a double click, a
  // retry after a timeout) is one receipt; changed amounts are a new collection.
  const fingerprint = JSON.stringify(lines.map((l) => [l.c.id, l.amount, remaining[l.c.id]]));
  const [keys] = useState(() => new Map<string, string>());
  const keyOf = (content: string) => {
    if (!keys.has(content)) keys.set(content, crypto.randomUUID());
    return keys.get(content)!;
  };

  async function collect(payments: SalePaymentInput[]) {
    setBusy(true);
    try {
      const receipt = await collectionsApi.collect(
        {
          customer_id: customerId,
          contracts: lines.map(({ c, amount }) => ({
            contract_id: c.id,
            amount: amount!,
            expected_remaining: remaining[c.id]!,
          })),
          payments: payments.filter((p) => p.method !== 'store_credit'),
        },
        keyOf(fingerprint),
      );
      void cache.invalidateQueries({ queryKey: collectionKeys.all(orgId) });
      navigate(`/collections/${receipt.id}`);
      return null;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (STALE[code]) {
        setPaying(false);
        setStale(STALE[code]);
        void cache.invalidateQueries({ queryKey: collectionKeys.all(orgId) });
        return null;
      }
      return err;
    } finally {
      setBusy(false);
    }
  }

  if (contracts.isPending) return <Skeleton className="h-40" />;
  if (contracts.isError)
    return (
      <ErrorState
        title={t('collections.collect.loadFailed')}
        onRetry={() => void contracts.refetch()}
      />
    );
  if (open.length === 0) return <EmptyState title={t('collections.collect.noOpenContracts')} />;

  return (
    <div className="space-y-4">
      <p className="type-section-title" dir="auto">
        {t('collections.collect.customer', { name: open[0]!.customer.name })}
      </p>
      {stale && <Notice tone="error">{t(`collections.collect.errors.${stale}`)}</Notice>}
      {open.map((c) => (
        <ContractCard
          key={c.id}
          contract={c}
          picked={isPicked(c.id)}
          amount={amounts[c.id] ?? ''}
          onPick={(v) => setPicked((was) => ({ ...was, [c.id]: v }))}
          onAmount={(v) => setAmounts((was) => ({ ...was, [c.id]: v }))}
          onRemaining={(v) =>
            setRemaining((was) => (was[c.id] === v ? was : { ...was, [c.id]: v }))
          }
        />
      ))}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="type-caption">{t('collections.collect.total')}</div>
            <div className="num type-section-title" data-testid="collect-total">
              {formatMoney(total)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!valid && <span className="type-caption">{t('collections.collect.pick')}</span>}
            <Button disabled={!valid} onClick={() => setPaying(true)}>
              {t('collections.collect.take')}
            </Button>
          </div>
        </div>
      </Card>
      {paying && (
        <PaymentDialog
          total={total}
          customerId={null}
          storeCreditBalance={null}
          busy={busy}
          purpose="collection"
          onPay={collect}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  );
}

function ContractCard({
  contract,
  picked,
  amount,
  onPick,
  onAmount,
  onRemaining,
}: {
  contract: ContractListItem;
  picked: boolean;
  amount: string;
  onPick: (v: boolean) => void;
  onAmount: (v: string) => void;
  onRemaining: (v: Money) => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(positive(amount) ?? ''), 300);
    return () => clearTimeout(id);
  }, [amount]);
  const due = useQuery({
    queryKey: collectionKeys.preview(orgId, contract.id, ''),
    queryFn: () => collectionsApi.preview(contract.id),
  });
  const preview = useQuery({
    queryKey: collectionKeys.preview(orgId, contract.id, debounced),
    queryFn: () => collectionsApi.preview(contract.id, debounced),
    enabled: picked && debounced !== '',
  });
  const left = due.data?.due.remaining;
  useEffect(() => {
    if (left) onRemaining(left);
    // onRemaining is a state setter of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const typed = positive(amount);
  const above = typed !== null && left !== undefined && compareMoney(typed, left) > 0;
  const d = due.data?.due;
  const quick: [string, Money | undefined][] = d
    ? [
        ['next', above0(d.next_due_amount) ? d.next_due_amount : undefined],
        ['overdue', above0(d.overdue_amount) ? d.overdue_amount : undefined],
        ['all', above0(d.remaining) ? d.remaining : undefined],
      ]
    : [];

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            label={t('collections.collect.pay', { number: contract.number })}
            checked={picked}
            onChange={(e) => onPick(e.target.checked)}
          />
          <Link to={`/contracts/${contract.id}`} className="link type-caption">
            {contract.number}
          </Link>
        </div>
        {d && <DueSummary due={d} />}
        {picked && (
          <>
            <div className="flex flex-wrap gap-2">
              {quick.map(([k, v]) =>
                v ? (
                  <Button key={k} size="sm" variant="secondary" onClick={() => onAmount(v)}>
                    {t(`collections.collect.quick.${k as 'next' | 'overdue' | 'all'}`)} ·{' '}
                    {formatMoney(v)}
                  </Button>
                ) : null,
              )}
            </div>
            <div className="max-w-xs">
              <MoneyInput
                label={t('collections.collect.amount', { number: contract.number })}
                value={amount}
                onValueChange={onAmount}
                {...(above && left
                  ? { error: t('collections.collect.above', { amount: formatMoney(left) }) }
                  : {})}
              />
              {left && (
                <p className="type-caption mt-1">
                  {t('collections.collect.max', { amount: formatMoney(left) })}
                </p>
              )}
            </div>
            {preview.data?.allocation && !preview.data.allocation.exceeds_remaining && (
              <Allocation allocation={preview.data.allocation} />
            )}
            {preview.isFetching && (
              <p className="type-caption">{t('collections.collect.preview.checking')}</p>
            )}
          </>
        )}
        {due.data && <Schedule preview={due.data} number={contract.number} />}
      </div>
    </Card>
  );
}

function DueSummary({ due }: { due: CollectionPreview['due'] }) {
  const cells: [string, string, boolean][] = [
    [
      t('collections.collect.due.overdue'),
      formatMoney(due.overdue_amount),
      above0(due.overdue_amount),
    ],
    [t('collections.collect.due.today'), formatMoney(due.due_today), false],
    [
      t('collections.collect.due.nextDue'),
      due.next_due_date
        ? `${formatMoney(due.next_due_amount)} · ${formatBusinessDate(due.next_due_date)}`
        : t('collections.collect.due.none'),
      false,
    ],
    [t('collections.collect.due.remaining'), formatMoney(due.remaining), false],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
      {cells.map(([label, value, alert]) => (
        <div key={label}>
          <dt className="type-caption">{label}</dt>
          <dd className={`num type-body ${alert ? 'text-danger-600' : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Allocation({ allocation }: { allocation: NonNullable<CollectionPreview['allocation']> }) {
  return (
    <section
      aria-label={t('collections.collect.preview.title')}
      className="rounded-control border border-line p-3"
    >
      <h3 className="type-label mb-2">{t('collections.collect.preview.title')}</h3>
      <ul className="space-y-1">
        {allocation.lines.map((l) => (
          <li key={l.seq} className="type-body">
            {t('collections.collect.preview.line', {
              seq: l.seq,
              date: formatBusinessDate(l.due_date),
              amount: formatMoney(l.amount),
            })}{' '}
            <span className="type-caption">
              (
              {t(
                l.pays_off
                  ? 'collections.collect.preview.paysOff'
                  : 'collections.collect.preview.partly',
              )}
              )
            </span>
          </li>
        ))}
      </ul>
      {allocation.completes_contract && (
        <p className="type-body mt-2 font-semibold">{t('collections.collect.preview.completes')}</p>
      )}
      <details className="mt-2">
        <summary className="type-caption cursor-pointer">
          {t('collections.collect.preview.details')}
        </summary>
        <ul className="mt-1 space-y-1">
          {allocation.lines.map((l) => (
            <li key={l.seq} className="type-caption">
              #{l.seq}:{' '}
              {t('collections.collect.preview.split', {
                profit: formatMoney(l.profit),
                principal: formatMoney(l.principal),
              })}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Schedule({ preview, number }: { preview: CollectionPreview; number: string }) {
  const th = 'type-label px-3 py-2 text-start';
  const td = 'type-body px-3 py-2 text-start';
  const tdNum = 'type-body whitespace-nowrap px-3 py-2 text-end num';
  return (
    <details>
      <summary className="type-caption cursor-pointer">
        {t('collections.collect.schedule.title', { number })}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>{t('collections.collect.schedule.seq')}</th>
              <th className={th}>{t('collections.collect.schedule.dueDate')}</th>
              <th className={th}>{t('collections.collect.schedule.amount')}</th>
              <th className={th}>{t('collections.collect.schedule.paid')}</th>
              <th className={th}>{t('collections.collect.schedule.remaining')}</th>
              <th className={th}>{t('collections.collect.schedule.status')}</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((l) => (
              <tr
                key={l.seq}
                className={`border-b border-line last:border-0 ${l.status === 'overdue' ? 'bg-danger-50' : ''}`}
              >
                <td className={td}>{l.seq}</td>
                <td className={td}>{formatBusinessDate(l.due_date)}</td>
                <td className={tdNum}>{formatMoney(l.amount)}</td>
                <td className={tdNum}>{formatMoney(l.paid)}</td>
                <td className={tdNum}>{formatMoney(l.remaining)}</td>
                <td className={td}>
                  {t(`customerAccount.schedule.status.${l.status}`)}
                  {l.days_late > 0 && (
                    <span className="type-caption">
                      {' '}
                      · {t('collections.collect.schedule.daysLate', { days: l.days_late })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
