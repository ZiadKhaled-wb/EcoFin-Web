import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BusinessDate, Uuid, type CashLedgerRow } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormField from '@/components/ui/FormField';
import LoadingState from '@/components/ui/LoadingState';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { cashApi, cashKeys, type CashLedgerParams } from '@/services/cashApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const PAGE_SIZE = 50;
const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('cash.ledger.notFound')}
        description={t('cash.ledger.notFoundHint')}
        action={
          <Link to="/accounting/vaults" className="btn btn-secondary">
            {t('cash.ledger.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * K01 ledger of a safe or bank (D56): newest first, each row with the balance after it, between
 * the period's opening and closing balances. The dates live in the URL. An id that isn't a UUID
 * never reaches the API.
 */
export default function VaultLedgerPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const [search, setSearch] = useSearchParams();
  const [page, setPage] = useState(1);
  const dateParam = (key: string) => {
    const v = search.get(key) ?? '';
    return BusinessDate.safeParse(v).success ? v : '';
  };
  const from = dateParam('from');
  const to = dateParam('to');
  const params: CashLedgerParams = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize: PAGE_SIZE,
  };

  const ledger = useQuery({
    queryKey: cashKeys.ledger(orgId, id, params),
    queryFn: () => cashApi.ledger(id, params),
    enabled: validId,
    placeholderData: keepPreviousData,
  });

  function setDate(key: 'from' | 'to', value: string) {
    setPage(1);
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
  if (ledger.isError && !ledger.data) {
    if (ledger.error instanceof ApiError && ledger.error.code === 'CASH_ACCOUNT_NOT_FOUND') {
      return <NotFound />;
    }
    return (
      <PageContainer>
        <ErrorState title={t('cash.ledger.loadFailed')} onRetry={() => void ledger.refetch()} />
      </PageContainer>
    );
  }

  const data = ledger.data;
  const money = (value: string) => <span className="num">{formatMoney(value)}</span>;
  const signed = (row: CashLedgerRow) => row.amount.startsWith('-');
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title={data ? data.account.name : t('cash.ledger.title')}
        description={t('cash.ledger.title')}
        actions={
          <Link to="/accounting/vaults" className="btn btn-ghost">
            {t('cash.ledger.back')}
          </Link>
        }
      />
      {!data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <Card>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="type-caption">{t('cash.columns.kind')}</dt>
                <dd>{t(`cash.kind.${data.account.kind}`)}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('cash.columns.branch')}</dt>
                <dd>{data.account.branch_name ?? t('cash.shopWide')}</dd>
              </div>
              <div>
                <dt className="type-caption">{t('cash.columns.balance')}</dt>
                <dd className="type-section-title">{money(data.account.balance)}</dd>
              </div>
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
                label={t('cash.ledger.from')}
                value={from}
                max={to || undefined}
                onChange={(e) => setDate('from', e.target.value)}
              />
              <FormField
                type="date"
                ltr
                label={t('cash.ledger.to')}
                value={to}
                min={from || undefined}
                onChange={(e) => setDate('to', e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={!from && !to}
                onClick={() => {
                  setPage(1);
                  setSearch(new URLSearchParams(), { replace: true });
                }}
              >
                {t('cash.ledger.clearDates')}
              </Button>
            </form>
          </Card>

          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('cash.ledger.caption')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('cash.ledger.columns.date')}</th>
                    <th className={th}>{t('cash.ledger.columns.type')}</th>
                    <th className={th}>{t('cash.ledger.columns.number')}</th>
                    <th className={th}>{t('cash.ledger.columns.note')}</th>
                    <th className={thNum}>{t('cash.ledger.columns.in')}</th>
                    <th className={thNum}>{t('cash.ledger.columns.out')}</th>
                    <th className={thNum}>{t('cash.ledger.columns.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-paper/50">
                    <th scope="row" colSpan={6} className={td}>
                      {t('cash.ledger.opening')}
                    </th>
                    <td className={tdNum}>{money(data.opening_balance)}</td>
                  </tr>
                  {data.items.length === 0 && (
                    <tr className="border-b border-line">
                      <td colSpan={7} className={cn(td, 'type-caption')}>
                        {t('cash.ledger.empty')}
                      </td>
                    </tr>
                  )}
                  {data.items.map((row) => (
                    <tr key={row.id} className="border-b border-line hover:bg-paper">
                      <td className={cn(td, 'whitespace-nowrap')}>
                        {formatBusinessDate(row.business_date)}
                      </td>
                      <td className={td}>{t(`cash.ledger.type.${row.type}`)}</td>
                      <td className={td}>
                        <span dir="ltr">{row.source_number ?? ''}</span>
                      </td>
                      <td className={td}>
                        <span dir="auto">{row.note ?? ''}</span>
                      </td>
                      <td className={tdNum}>{signed(row) ? '' : money(row.amount)}</td>
                      <td className={tdNum}>{signed(row) ? money(row.amount.slice(1)) : ''}</td>
                      <td className={tdNum}>{money(row.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-line bg-paper">
                  <tr>
                    <th scope="row" colSpan={6} className={th}>
                      {t('cash.ledger.closing')}
                    </th>
                    <td className={tdNum}>{money(data.closing_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('cash.ledger.newer')}
              </Button>
              <span className="type-caption">
                {t('cash.ledger.page', { page: formatNumber(page), pages: formatNumber(pages) })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('cash.ledger.older')}
              </Button>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
