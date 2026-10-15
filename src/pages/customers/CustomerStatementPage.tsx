import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BusinessDate,
  Uuid,
  type CustomerStatement,
  type CustomerStatementQuery,
  type CustomerStatementRow,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import { useMe } from '@/features/me/useMe';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatDateTime, formatMoney } from '@/lib/format';
import { customerAccountApi, customerAccountKeys } from '@/services/customerAccountApi';
import { useAuthStore } from '@/store/authStore';
import { t, directionOf, getLanguage, type TranslationKey } from '@/i18n';
import './CustomerStatementPrint.css';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/** A positive money string the server sent (the customer owes); never parsed into a number. */
const owes = (value: string) => !value.startsWith('-') && !/^0+(\.0+)?$/.test(value);

/** What the details column says: the payment method, the return kind, the sale of a contract. */
function detailOf(row: CustomerStatementRow): string {
  if (row.detail === null) return '';
  switch (row.kind) {
    case 'payment_in':
    case 'payment_out':
    case 'payment_reversal':
      return t(`customerAccount.payments.methodName.${row.detail}` as TranslationKey);
    case 'return':
      return t(`customerAccount.returns.kind.${row.detail}` as TranslationKey);
    case 'contract':
      return t('customerAccount.statement.ofSale', { number: row.detail });
    case 'fee':
      return '';
    default:
      return row.detail;
  }
}

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('customerAccount.statement.notFound')}
        description={t('customerAccount.statement.notFoundHint')}
        action={
          <Link to="/customers" className="btn btn-secondary">
            {t('customers.profile.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

function StatementTable({ data, print }: { data: CustomerStatement; print?: boolean }) {
  const money = (value: string) => <span className="num">{formatMoney(value)}</span>;
  const balance = (value: string) => (
    <span className={cn('num', !print && owes(value) && 'text-danger-600')}>
      {formatMoney(value)}
    </span>
  );
  return (
    <table className={cn('w-full border-collapse text-start', print && 'statement-table')}>
      <caption className="sr-only">{t('customerAccount.statement.caption')}</caption>
      <thead className="border-b border-line bg-paper">
        <tr>
          <th className={th}>{t('customerAccount.statement.columns.date')}</th>
          <th className={th}>{t('customerAccount.statement.columns.type')}</th>
          <th className={th}>{t('customerAccount.statement.columns.number')}</th>
          <th className={th}>{t('customerAccount.statement.columns.detail')}</th>
          <th className={thNum}>{t('customerAccount.statement.columns.debit')}</th>
          <th className={thNum}>{t('customerAccount.statement.columns.credit')}</th>
          <th className={thNum}>{t('customerAccount.statement.columns.balance')}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-line bg-paper/50">
          <th scope="row" colSpan={6} className={td}>
            {t('customerAccount.statement.opening')}
          </th>
          <td className={tdNum}>{balance(data.opening_balance)}</td>
        </tr>
        {data.rows.length === 0 && (
          <tr className="border-b border-line">
            <td colSpan={7} className={cn(td, 'type-caption')}>
              {t('customerAccount.statement.empty')}
            </td>
          </tr>
        )}
        {data.rows.map((row) => (
          <tr key={`${row.kind}-${row.document_id}`} className="border-b border-line">
            <td className={cn(td, 'whitespace-nowrap')}>{formatBusinessDate(row.date)}</td>
            <td className={td}>{t(`customerAccount.statement.kind.${row.kind}`)}</td>
            <td className={cn(td, 'whitespace-nowrap')}>
              {row.kind === 'sale' && !print ? (
                <Link
                  to={`/sales/${row.document_id}`}
                  className="text-brand-700 hover:underline"
                  dir="ltr"
                >
                  {row.number}
                </Link>
              ) : (
                <span dir="ltr">{row.number}</span>
              )}
            </td>
            <td className={td}>
              <span dir="auto">{detailOf(row)}</span>
              {row.reference && (
                <span className="type-caption block" dir="ltr">
                  {row.reference}
                </span>
              )}
            </td>
            <td className={tdNum}>{money(row.debit)}</td>
            <td className={tdNum}>{money(row.credit)}</td>
            <td className={tdNum}>{balance(row.balance)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-line bg-paper">
        <tr>
          <th scope="row" colSpan={4} className={th}>
            {t('customerAccount.statement.closing')}
          </th>
          <td className={tdNum}>{money(data.totals.debit)}</td>
          <td className={tdNum}>{money(data.totals.credit)}</td>
          <td className={tdNum}>{balance(data.closing_balance)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function period(data: CustomerStatement) {
  const today = new Date().toISOString();
  if (!data.from && !data.to) {
    return t('customerAccount.statement.periodAll', { date: formatDateTime(today) });
  }
  return t('customerAccount.statement.period', {
    from: data.from ? formatBusinessDate(data.from) : t('customerAccount.statement.start'),
    to: data.to ? formatBusinessDate(data.to) : t('customerAccount.statement.today'),
  });
}

/** The A4 sheet: shop, customer, period, the rows and the closing balance. */
export function StatementSheet({ data, shop }: { data: CustomerStatement; shop: string }) {
  return (
    <article className="customer-statement" aria-label={t('customerAccount.statement.title')}>
      <header>
        <h1 dir="auto">{shop}</h1>
        <h2>{t('customerAccount.statement.title')}</h2>
        <p dir="auto">{data.customer.full_name}</p>
        {data.customer.phones[0] && <p dir="ltr">{data.customer.phones[0]}</p>}
        <p>{period(data)}</p>
      </header>
      <StatementTable data={data} print />
      <p className="note">{t('customerAccount.statement.owes')}</p>
      <p className="note">
        {t('customerAccount.statement.printedOn', {
          date: formatDateTime(new Date().toISOString()),
        })}
      </p>
    </article>
  );
}

/**
 * R02 (D74): a customer's statement with the running balance, every branch, for an optional date
 * range kept in the URL (at most three years). Print uses the shared print root: only the A4
 * sheet is printed.
 */
export default function CustomerStatementPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const me = useMe();
  const [search, setSearch] = useSearchParams();
  const dateParam = (key: string) => {
    const v = search.get(key) ?? '';
    return BusinessDate.safeParse(v).success ? v : '';
  };
  const from = dateParam('from');
  const to = dateParam('to');
  const query: CustomerStatementQuery = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  const statement = useQuery({
    queryKey: customerAccountKeys.statement(orgId, id, query),
    queryFn: () => customerAccountApi.statement(id, query),
    enabled: validId,
    placeholderData: keepPreviousData,
    retry: (count, err) => !(err instanceof ApiError) && count < 2,
  });

  function setDate(key: 'from' | 'to', value: string) {
    setSearch(
      (p) => {
        const out = new URLSearchParams(p);
        if (value) out.set(key, value);
        else out.delete(key);
        return out;
      },
      { replace: true },
    );
  }

  if (!validId) return <NotFound />;
  const err = statement.error;
  if (err instanceof ApiError && err.code === 'CUSTOMER_NOT_FOUND') return <NotFound />;
  // The contract refuses a bad range before any request; the server says the same.
  const rangeInvalid =
    err instanceof ApiError
      ? err.code === 'VALIDATION_FAILED'
      : err !== null && err !== undefined && err.name === 'ZodError';
  if (statement.isError && !statement.data && !rangeInvalid) {
    return (
      <PageContainer>
        <ErrorState
          title={t('customerAccount.statement.loadFailed')}
          onRetry={() => void statement.refetch()}
        />
      </PageContainer>
    );
  }
  const data = statement.data;

  return (
    <>
      <PageContainer>
        <PageHeader
          title={data ? data.customer.full_name : t('customerAccount.statement.title')}
          description={t('customerAccount.statement.title')}
          breadcrumbs={[{ label: t('customerAccount.statement.back'), to: `/customers/${id}` }]}
          actions={
            <Button onClick={() => window.print()} disabled={!data || !me.data || rangeInvalid}>
              {t('customerAccount.statement.print')}
            </Button>
          }
        />
        <div className="space-y-4">
          <Card>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(e) => e.preventDefault()}
            >
              <FormField
                type="date"
                ltr
                label={t('customerAccount.statement.from')}
                value={from}
                max={to || undefined}
                onChange={(e) => setDate('from', e.target.value)}
              />
              <FormField
                type="date"
                ltr
                label={t('customerAccount.statement.to')}
                value={to}
                min={from || undefined}
                onChange={(e) => setDate('to', e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={!from && !to}
                onClick={() => setSearch(new URLSearchParams(), { replace: true })}
              >
                {t('customerAccount.statement.clearDates')}
              </Button>
            </form>
            <p className="type-caption mt-2">{t('customerAccount.statement.rangeHint')}</p>
            {rangeInvalid && <FormError message={t('customerAccount.errors.VALIDATION_FAILED')} />}
          </Card>
          {!data ? (
            rangeInvalid ? null : (
              <LoadingState />
            )
          ) : (
            <>
              <Card padded={false}>
                <div className="overflow-x-auto">
                  <StatementTable data={data} />
                </div>
              </Card>
              <p className="type-caption">{t('customerAccount.statement.owes')}</p>
            </>
          )}
        </div>
      </PageContainer>
      {data &&
        me.data &&
        !rangeInvalid &&
        createPortal(
          <div className="print-root" aria-hidden="true" dir={directionOf(getLanguage())}>
            <style>{'@page {size:A4;margin:12mm;}'}</style>
            <StatementSheet data={data} shop={me.data.org.name} />
          </div>,
          document.body,
        )}
    </>
  );
}
