import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BusinessDate, Uuid, type SupplierStatementRow } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormField from '@/components/ui/FormField';
import LoadingState from '@/components/ui/LoadingState';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { supplierKeys, suppliersApi, type SupplierStatementParams } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { owesSupplier } from './supplierShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('suppliers.statement.notFound')}
        description={t('suppliers.statement.notFoundHint')}
        action={
          <Link to="/suppliers" className="btn btn-secondary">
            {t('suppliers.statement.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * U01 supplier statement (D53): approved invoices, payments, reversals and returns of every
 * branch with the running balance, from an opening balance to what the shop owes. The dates
 * live in the URL. An id that isn't a UUID never reaches the API.
 */
export default function SupplierStatementPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [search, setSearch] = useSearchParams();
  const dateParam = (key: string) => {
    const v = search.get(key) ?? '';
    return BusinessDate.safeParse(v).success ? v : '';
  };
  const from = dateParam('from');
  const to = dateParam('to');
  const params: SupplierStatementParams = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  const statement = useQuery({
    queryKey: supplierKeys.statement(orgId, id, params),
    queryFn: () => suppliersApi.statement(id, params),
    enabled: validId,
    placeholderData: keepPreviousData,
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
  if (statement.isError && !statement.data) {
    if (statement.error instanceof ApiError && statement.error.code === 'SUPPLIER_NOT_FOUND') {
      return <NotFound />;
    }
    return (
      <PageContainer>
        <ErrorState
          title={t('suppliers.statement.loadFailed')}
          onRetry={() => void statement.refetch()}
        />
      </PageContainer>
    );
  }

  const data = statement.data;
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const money = (value: string) => <span className="num">{formatMoney(value)}</span>;
  const balance = (value: string) => (
    <span className={cn('num', owesSupplier(value) && 'text-danger-700')}>
      {formatMoney(value)}
    </span>
  );
  // Phone and tax number read left to right; an empty one is a dash in the page's direction.
  const ltrOrDash = (value: string | null) => (value ? <span dir="ltr">{value}</span> : '—');
  const kindLabel = (row: SupplierStatementRow) => t(`suppliers.statement.kind.${row.kind}`);

  return (
    <PageContainer>
      <PageHeader
        title={data ? data.supplier.name : t('suppliers.statement.title')}
        description={t('suppliers.statement.title')}
        actions={
          <Link to="/suppliers" className="btn btn-ghost">
            {t('suppliers.statement.back')}
          </Link>
        }
      />
      {!data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <Card title={t('suppliers.statement.details')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="type-caption">{t('suppliers.fields.phone')}</dt>
                <dd>{ltrOrDash(data.supplier.phone)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('suppliers.fields.taxNo')}</dt>
                <dd>{ltrOrDash(data.supplier.tax_registration_no)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('suppliers.fields.terms')}</dt>
                <dd>
                  {data.supplier.payment_terms_days > 0
                    ? t('suppliers.termsDays', {
                        count: formatNumber(data.supplier.payment_terms_days),
                      })
                    : t('suppliers.termsNone')}
                </dd>
              </div>
              <div>
                <dt className="type-caption">{t('suppliers.statement.balanceOwed')}</dt>
                <dd className="type-section-title">{balance(data.supplier.balance)}</dd>
              </div>
              {data.supplier.address && (
                <div className="sm:col-span-2">
                  <dt className="type-caption">{t('suppliers.fields.address')}</dt>
                  <dd>{data.supplier.address}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(e) => e.preventDefault()}
            >
              <FormField
                type="date"
                ltr
                label={t('suppliers.statement.from')}
                value={from}
                max={to || undefined}
                onChange={(e) => setDate('from', e.target.value)}
              />
              <FormField
                type="date"
                ltr
                label={t('suppliers.statement.to')}
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
                {t('suppliers.statement.clearDates')}
              </Button>
            </form>
            <p className="type-caption mt-2">{t('suppliers.statement.allBranches')}</p>
          </Card>

          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('suppliers.statement.caption')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('suppliers.statement.columns.date')}</th>
                    <th className={th}>{t('suppliers.statement.columns.type')}</th>
                    <th className={th}>{t('suppliers.statement.columns.number')}</th>
                    <th className={th}>{t('suppliers.statement.columns.reference')}</th>
                    <th className={th}>{t('suppliers.statement.columns.branch')}</th>
                    <th className={thNum}>{t('suppliers.statement.columns.debit')}</th>
                    <th className={thNum}>{t('suppliers.statement.columns.credit')}</th>
                    <th className={thNum}>{t('suppliers.statement.columns.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-paper/50">
                    <th scope="row" colSpan={7} className={td}>
                      {t('suppliers.statement.opening')}
                    </th>
                    <td className={tdNum}>{balance(data.opening_balance)}</td>
                  </tr>
                  {data.rows.length === 0 && (
                    <tr className="border-b border-line">
                      <td colSpan={8} className={cn(td, 'type-caption')}>
                        {t('suppliers.statement.empty')}
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row) => (
                    <tr
                      key={`${row.kind}-${row.document_id}`}
                      className="border-b border-line hover:bg-paper"
                    >
                      <td className={cn(td, 'whitespace-nowrap')}>
                        {formatBusinessDate(row.date)}
                      </td>
                      <td className={td}>
                        <span className="block">{kindLabel(row)}</span>
                        {row.refund_mode === 'cash' && (
                          <span className="type-caption block">
                            {t('suppliers.statement.cashRefund')}
                          </span>
                        )}
                      </td>
                      {/* The number becomes a link once U02 (invoices), U03 (payments) and
                          U04 (returns) add their document pages. */}
                      <td className={td}>
                        <span dir="ltr">{row.number}</span>
                      </td>
                      <td className={td}>
                        <span dir="auto">{row.reference ?? ''}</span>
                      </td>
                      <td className={td}>{branchName.get(row.branch_id) ?? '—'}</td>
                      <td className={tdNum}>{money(row.debit)}</td>
                      <td className={tdNum}>{money(row.credit)}</td>
                      <td className={tdNum}>{balance(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-line bg-paper">
                  <tr>
                    <th scope="row" colSpan={7} className={th}>
                      {t('suppliers.statement.closing')}
                    </th>
                    <td className={tdNum}>{balance(data.closing_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title={t('suppliers.statement.totals')}>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="type-caption">{t('suppliers.statement.invoiced')}</dt>
                <dd>{money(data.totals.invoiced)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('suppliers.statement.paid')}</dt>
                <dd>{money(data.totals.paid)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('suppliers.statement.returned')}</dt>
                <dd>{money(data.totals.returned)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
