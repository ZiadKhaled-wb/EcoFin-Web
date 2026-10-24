import { MigratedNote } from '@/features/migration/MigratedNote';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type {
  Customer,
  CustomerAccount,
  CustomerContractSummary,
  CustomerPaymentSummary,
} from '@ziadkhaled-wb/contracts';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { cn } from '@/lib/cn';
import {
  formatBusinessDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/lib/format';
import { customerAccountApi, customerAccountKeys } from '@/services/customerAccountApi';
import { customersApi } from '@/services/customersApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import ContractScheduleDrawer from './ContractScheduleDrawer';
import { LegalFlagBadge } from '../legal/legalShared';
import CustomerGuarantorsCard from './CustomerGuarantorsCard';

const CONTRACT_TONE: Record<CustomerContractSummary['status'], BadgeTone> = {
  active: 'brand',
  completed: 'success',
  rescheduled: 'warning',
  written_off: 'danger',
  returned: 'neutral',
};
const AGING = ['not_yet_due', 'late_1_30', 'late_31_60', 'late_61_90', 'late_90_plus'] as const;

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/** A money string the server sent is zero (never parsed into a JS number). */
const isZero = (value: string) => /^-?0+(\.0+)?$/.test(value);
const money = (value: string) => <span className="num">{formatMoney(value)}</span>;

function Figure({
  label,
  large,
  tone,
  children,
}: {
  label: string;
  large?: boolean;
  tone?: 'danger';
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd className={cn(large && 'type-section-title', tone === 'danger' && 'text-danger-600')}>
        {children}
      </dd>
    </div>
  );
}

function BalanceCard({ account }: { account: CustomerAccount }) {
  const b = account.balance;
  return (
    <Card
      title={t('customerAccount.balance.title')}
      description={t('customerAccount.balance.hint')}
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Figure label={t('customerAccount.balance.openBalance')} large>
          {money(b.open_balance)}
        </Figure>
        <Figure
          label={t('customerAccount.balance.feesDue')}
          {...(isZero(b.fees_due) ? {} : { tone: 'danger' as const })}
        >
          {money(b.fees_due)}
        </Figure>
        <Figure label={t('customerAccount.balance.totalDue')} large>
          {money(b.total_due)}
        </Figure>
        <Figure label={t('customerAccount.balance.storeCredit')}>{money(b.store_credit)}</Figure>
        <Figure label={t('customerAccount.balance.available')}>{money(b.available)}</Figure>
      </dl>
      <p className="type-caption mt-3">
        {t('customerAccount.balance.formula', {
          totals: formatMoney(b.contract_totals),
          payments: formatMoney(b.payments),
          returns: formatMoney(b.returns),
        })}
      </p>
    </Card>
  );
}

function OverdueCard({ account }: { account: CustomerAccount }) {
  const o = account.overdue;
  return (
    <Card title={t('customerAccount.overdue.title')}>
      {o.overdue_lines === 0 && o.next_due_date === null ? (
        <p>{t('customerAccount.overdue.none')}</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={t('customerAccount.overdue.amount')}
              {...(o.overdue_lines > 0 ? { tone: 'danger' as const } : {})}
            >
              {money(o.overdue_amount)}
            </Figure>
            <Figure label={t('customerAccount.overdue.lines')}>
              {formatNumber(o.overdue_lines)}
            </Figure>
            <Figure label={t('customerAccount.overdue.maxDaysLate')}>
              {o.max_days_late === null
                ? '—'
                : t('customerAccount.overdue.daysValue', { count: formatNumber(o.max_days_late) })}
            </Figure>
            <Figure label={t('customerAccount.overdue.nextDue')}>
              {o.next_due_date === null
                ? '—'
                : t('customerAccount.overdue.nextDueValue', {
                    amount: formatMoney(o.next_due_amount ?? '0.00'),
                    date: formatBusinessDate(o.next_due_date),
                  })}
            </Figure>
          </dl>
          <div>
            <h3 className="type-label mb-2">{t('customerAccount.overdue.aging')}</h3>
            <dl className="grid gap-3 sm:grid-cols-5">
              {AGING.map((bucket) => (
                <Figure
                  key={bucket}
                  label={t(`customerAccount.overdue.bucket.${bucket}`)}
                  {...(bucket !== 'not_yet_due' && !isZero(o.aging[bucket])
                    ? { tone: 'danger' as const }
                    : {})}
                >
                  {money(o.aging[bucket])}
                </Figure>
              ))}
            </dl>
          </div>
        </div>
      )}
    </Card>
  );
}

function TotalsCard({ account }: { account: CustomerAccount }) {
  const x = account.totals;
  return (
    <Card title={t('customerAccount.totals.title')}>
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label={t('customerAccount.totals.purchases')}>
          {t('customerAccount.totals.purchasesValue', {
            count: formatNumber(x.purchases_count),
            amount: formatMoney(x.purchases_total),
          })}
        </Figure>
        <Figure label={t('customerAccount.totals.returns')}>
          {t('customerAccount.totals.purchasesValue', {
            count: formatNumber(x.returns_count),
            amount: formatMoney(x.returns_total),
          })}
        </Figure>
        <Figure label={t('customerAccount.totals.paymentsIn')}>{money(x.payments_in)}</Figure>
        <Figure label={t('customerAccount.totals.paymentsOut')}>{money(x.payments_out)}</Figure>
        <Figure label={t('customerAccount.totals.lastPurchase')}>
          {x.last_purchase_at ? formatDate(x.last_purchase_at) : t('customerAccount.totals.never')}
        </Figure>
        <Figure label={t('customerAccount.totals.lastPayment')}>
          {x.last_payment_at ? formatDate(x.last_payment_at) : t('customerAccount.totals.never')}
        </Figure>
      </dl>
    </Card>
  );
}

function ContractsCard({
  account,
  onOpen,
}: {
  account: CustomerAccount;
  onOpen: (contract: CustomerContractSummary) => void;
}) {
  if (account.contracts.length === 0) {
    return (
      <Card title={t('customerAccount.contracts.title')}>
        <p>{t('customerAccount.contracts.empty')}</p>
      </Card>
    );
  }
  return (
    <Card title={t('customerAccount.contracts.title')} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{t('customerAccount.contracts.caption')}</caption>
          <thead className="border-b border-line bg-paper">
            <tr>
              <th className={th}>{t('customerAccount.contracts.number')}</th>
              <th className={th}>{t('customerAccount.contracts.issued')}</th>
              <th className={thNum}>{t('customerAccount.contracts.total')}</th>
              <th className={thNum}>{t('customerAccount.contracts.paid')}</th>
              <th className={thNum}>{t('customerAccount.contracts.remaining')}</th>
              <th className={thNum}>{t('customerAccount.contracts.overdue')}</th>
              <th className={th}>{t('customerAccount.contracts.nextDue')}</th>
              <th className={th}>{t('customerAccount.contracts.statusLabel')}</th>
              <th className={th}>
                <span className="sr-only">{t('customerAccount.contracts.schedule')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {account.contracts.map((c) => (
              <tr key={c.id} className="border-b border-line hover:bg-paper">
                <td className={td}>
                  <Link
                    to={`/contracts/${c.id}`}
                    className="text-brand-700 hover:underline"
                    dir="ltr"
                  >
                    {c.number}
                  </Link>
                  {c.migration_source ? (
                    <MigratedNote source={c.migration_source} />
                  ) : (
                    c.is_migrated && (
                      <span className="type-caption block">
                        {t('customerAccount.contracts.migrated')}
                      </span>
                    )
                  )}
                </td>
                <td className={cn(td, 'whitespace-nowrap')}>{formatDate(c.issued_at)}</td>
                <td className={tdNum}>{money(c.contract_total)}</td>
                <td className={tdNum}>{money(c.paid)}</td>
                <td className={tdNum}>{money(c.remaining)}</td>
                <td className={cn(tdNum, c.overdue_lines > 0 && 'text-danger-600')}>
                  {money(c.overdue_amount)}
                </td>
                <td className={cn(td, 'whitespace-nowrap')}>
                  {c.next_due_date ? formatBusinessDate(c.next_due_date) : '—'}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={CONTRACT_TONE[c.status]}>
                      {t(`customerAccount.contracts.status.${c.status}`)}
                    </Badge>
                    {/* N09: the contract's open legal case. */}
                    <LegalFlagBadge legalCase={c.legal_case} />
                  </div>
                </td>
                <td className={td}>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(c)}>
                    {t('customerAccount.contracts.schedule')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function allocationText(p: CustomerPaymentSummary) {
  return p.allocated_to
    .map((a) =>
      t(`customerAccount.payments.allocation.${a.kind}`, { number: a.document_number ?? '' }),
    )
    .join('، ');
}

function PaymentsCard({ account }: { account: CustomerAccount }) {
  if (account.recent_payments.length === 0) {
    return (
      <Card title={t('customerAccount.payments.title')}>
        <p>{t('customerAccount.payments.empty')}</p>
      </Card>
    );
  }
  return (
    <Card title={t('customerAccount.payments.title')} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{t('customerAccount.payments.caption')}</caption>
          <thead className="border-b border-line bg-paper">
            <tr>
              <th className={th}>{t('customerAccount.payments.date')}</th>
              <th className={th}>{t('customerAccount.payments.number')}</th>
              <th className={th}>{t('customerAccount.payments.method')}</th>
              <th className={th}>{t('customerAccount.payments.for')}</th>
              <th className={thNum}>{t('customerAccount.payments.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {account.recent_payments.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className={cn(td, 'whitespace-nowrap')}>{formatDateTime(p.received_at)}</td>
                <td className={td}>
                  <span dir="ltr">{p.number}</span>
                  {p.direction === 'out' && (
                    <Badge tone="warning" className="ms-2">
                      {t('customerAccount.payments.out')}
                    </Badge>
                  )}
                </td>
                <td className={td}>
                  {t(`customerAccount.payments.methodName.${p.method}`)}
                  {p.reference && (
                    <span className="type-caption block" dir="ltr">
                      {p.reference}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <span dir="auto">{allocationText(p)}</span>
                </td>
                <td className={tdNum}>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReturnsCard({ account }: { account: CustomerAccount }) {
  return (
    <Card title={t('customerAccount.returns.title')}>
      {account.recent_returns.length === 0 ? (
        <p>{t('customerAccount.returns.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {account.recent_returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{t(`customerAccount.returns.kind.${r.kind}`)}</span>{' '}
                <span dir="ltr">{r.number}</span>{' '}
                <Link to={`/sales/${r.sale_id}`} className="text-brand-700 hover:underline">
                  {t('customerAccount.returns.ofSale', { number: r.sale_number })}
                </Link>
                <span className="type-caption block">
                  {formatBusinessDate(r.business_date)} ·{' '}
                  {t(`customerAccount.returns.refund.${r.refund_method}`)}
                </span>
              </span>
              {money(r.total)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PurchasesCard({ customerId }: { customerId: string }) {
  const orgId = useAuthStore((s) => s.orgId);
  // S07's sales history answers sale.create or report.view; the account itself is wider.
  const canSell = useCan('sale.create');
  const canReport = useCan('report.view');
  const allowed = canSell || canReport;
  const sales = useQuery({
    queryKey: ['customers', orgId, 'account', customerId, 'purchases'],
    queryFn: () => salesHistoryApi.list({ customer_id: customerId, page: 1, page_size: 10 }),
    enabled: allowed,
  });
  return (
    <Card title={t('customerAccount.purchases.title')}>
      {!allowed ? (
        <p role="note">{t('customerAccount.purchases.hidden')}</p>
      ) : sales.isError ? (
        <ErrorState
          title={t('customerAccount.purchases.loadFailed')}
          onRetry={() => void sales.refetch()}
        />
      ) : !sales.data ? (
        <LoadingState />
      ) : sales.data.items.length === 0 ? (
        <p>{t('customerAccount.purchases.empty')}</p>
      ) : (
        <ul className="divide-y divide-line" aria-label={t('customerAccount.purchases.caption')}>
          {sales.data.items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link to={`/sales/${s.id}`} className="text-brand-700 hover:underline" dir="ltr">
                  {s.number}
                </Link>
                <span className="type-caption ms-2">{formatBusinessDate(s.business_date)}</span>
                {s.status !== 'completed' && (
                  <Badge tone="neutral" className="ms-2">
                    {t(`sales.history.status.${s.status}` as TranslationKey)}
                  </Badge>
                )}
              </span>
              {money(s.total)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DocumentsCard({ account }: { account: CustomerAccount }) {
  const orgId = useAuthStore((s) => s.orgId);
  const contracts = account.contracts.map((c) => ({ id: c.id, number: c.number }));
  const docs = useQuery({
    queryKey: customerAccountKeys.documents(orgId, account.customer.id),
    queryFn: () => customerAccountApi.documents(account.customer.id, contracts),
    enabled: account.documents_count > 0,
  });
  async function open(fileId: string) {
    try {
      const { url } = await customersApi.photoUrl(fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      notify.error(t('customerAccount.documents.loadFailed'));
    }
  }
  return (
    <Card
      title={t('customerAccount.documents.title')}
      actions={
        <span className="type-caption">
          {t('customerAccount.documents.count', { count: formatNumber(account.documents_count) })}
        </span>
      }
    >
      {account.documents_count === 0 ? (
        <p>{t('customerAccount.documents.empty')}</p>
      ) : docs.isError ? (
        <ErrorState
          title={t('customerAccount.documents.loadFailed')}
          onRetry={() => void docs.refetch()}
        />
      ) : !docs.data ? (
        <LoadingState />
      ) : docs.data.length === 0 ? (
        <p>{t('customerAccount.documents.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {docs.data.map(({ file, contractNumber }) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {t(documentLabel(file.purpose))}
                <span className="type-caption ms-2">
                  {contractNumber
                    ? t('customerAccount.documents.ofContract', { number: contractNumber })
                    : t('customerAccount.documents.ofCustomer')}{' '}
                  · {formatDate(file.createdAt)}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void open(file.id)}>
                {t('customerAccount.documents.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const DOCUMENT_PURPOSES = ['customer_id', 'contract_pdf', 'promissory_note', 'signature'] as const;
function documentLabel(purpose: string): TranslationKey {
  return (DOCUMENT_PURPOSES as readonly string[]).includes(purpose)
    ? (`customerAccount.documents.purpose.${purpose}` as TranslationKey)
    : 'customerAccount.documents.purpose.other';
}

/**
 * R02 (D74): the customer's money in one place. Every number comes from the server; nothing is
 * added up here. The statement opens on its own page so it can be printed.
 */
export default function CustomerAccountTab({ customer }: { customer: Customer }) {
  const orgId = useAuthStore((s) => s.orgId);
  // N03: collect from the customer's open contracts.
  const canCollect = useCan('collection.create');
  const [openContract, setOpenContract] = useState<CustomerContractSummary | null>(null);
  const account = useQuery({
    queryKey: customerAccountKeys.account(orgId, customer.id),
    queryFn: () => customerAccountApi.account(customer.id),
  });

  if (account.isError && !account.data) {
    return (
      <ErrorState title={t('customerAccount.loadFailed')} onRetry={() => void account.refetch()} />
    );
  }
  const data = account.data;
  if (!data) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {canCollect &&
          data.contracts.some((c) => c.status === 'active' || c.status === 'rescheduled') && (
            <Link to={`/collections/new?customer=${customer.id}`} className="btn btn-primary">
              {t('collections.search.collect')}
            </Link>
          )}
        <Link to={`/customers/${customer.id}/statement`} className="btn btn-secondary">
          {t('customerAccount.statement.open')}
        </Link>
      </div>
      <BalanceCard account={data} />
      <OverdueCard account={data} />
      <TotalsCard account={data} />
      <ContractsCard account={data} onOpen={setOpenContract} />
      <PurchasesCard customerId={customer.id} />
      <PaymentsCard account={data} />
      <ReturnsCard account={data} />
      <DocumentsCard account={data} />
      <CustomerGuarantorsCard customer={customer} />
      <ContractScheduleDrawer
        customerId={customer.id}
        contract={openContract}
        onClose={() => setOpenContract(null)}
      />
    </div>
  );
}
