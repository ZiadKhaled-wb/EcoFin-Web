import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { saleKeys, salesApi } from '@/services/salesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from './usePosCart';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('sales.detail.notFound')}
        description={t('sales.detail.notFoundHint')}
      />
    </PageContainer>
  );
}

/** S01: one sale with its lines (serials, warranty), totals and payments. S07 links here. */
export default function SalePage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: saleKeys.one(orgId, id),
    queryFn: () => salesApi.get(id),
    enabled: validId,
  });

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState title={t('sales.detail.loadFailed')} onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  }
  const sale = query.data;
  if (!sale) return <LoadingState />;

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.detail.title', { number: sale.number })}
        actions={
          <Link to="/sales/pos" className="btn btn-ghost">
            {t('sales.detail.back')}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('sales.detail.date')}</dt>
              <dd>{formatDateTime(sale.issued_at)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('sales.detail.cashier')}</dt>
              <dd dir="auto">{sale.created_by_name ?? ''}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('sales.detail.shift')}</dt>
              <dd dir="ltr" className="text-start">
                {sale.shift_number ?? ''}
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('sales.detail.customer')}</dt>
              <dd dir="auto">{sale.customer_name ?? t('sales.detail.walkIn')}</dd>
            </div>
          </dl>
        </Card>

        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t('sales.detail.lines')}</caption>
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className={th}>{t('sales.detail.product')}</th>
                <th className={thNum}>{t('sales.detail.quantity')}</th>
                <th className={thNum}>{t('sales.detail.unitPrice')}</th>
                <th className={thNum}>{t('sales.detail.vat')}</th>
                <th className={thNum}>{t('sales.detail.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.id} className="border-b border-line align-top">
                  <td className={td}>
                    <span className="block" dir="auto">
                      {productName(l)}
                    </span>
                    <span className="type-caption block" dir="ltr">
                      {l.serial ?? l.sku}
                    </span>
                    {l.warranty_until !== null && (
                      <span className="type-caption block">
                        {t('sales.detail.warranty', {
                          date: formatBusinessDate(l.warranty_until),
                        })}
                      </span>
                    )}
                  </td>
                  <td className={tdNum}>{formatNumber(l.quantity)}</td>
                  <td className={tdNum}>{formatMoney(l.unit_price)}</td>
                  <td className={tdNum}>{formatMoney(l.tax_amount)}</td>
                  <td className={tdNum}>{formatMoney(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card>
          <dl className="ms-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1">
            <dt className="type-caption">{t('sales.detail.subtotal')}</dt>
            <dd className="num text-end">{formatMoney(sale.subtotal)}</dd>
            <dt className="type-caption">{t('sales.detail.vatTotal')}</dt>
            <dd className="num text-end">{formatMoney(sale.tax_total)}</dd>
            <dt className="type-label">{t('sales.detail.total')}</dt>
            <dd className="num type-section-title text-end" data-testid="sale-total">
              {formatMoney(sale.total)}
            </dd>
          </dl>
          <p className="type-caption mt-2">
            {t(sale.prices_include_vat ? 'sales.detail.vatIncluded' : 'sales.detail.vatAdded')}
          </p>
        </Card>

        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t('sales.detail.payments')}</caption>
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className={th}>{t('sales.detail.paymentNumber')}</th>
                <th className={th}>{t('sales.detail.method')}</th>
                <th className={th}>{t('sales.detail.account')}</th>
                <th className={thNum}>{t('sales.detail.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className={td}>
                    <span dir="ltr">{p.number}</span>
                  </td>
                  <td className={td}>{t(`sales.detail.methods.${p.method}`)}</td>
                  <td className={td}>
                    <span dir="auto">{p.cash_account_name ?? ''}</span>
                  </td>
                  <td className={tdNum}>{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
