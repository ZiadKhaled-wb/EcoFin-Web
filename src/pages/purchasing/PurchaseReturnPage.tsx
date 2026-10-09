import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { purchaseReturnKeys, purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from './purchaseShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('purchases.returns.detail.notFound')}
        description={t('purchases.returns.detail.notFoundHint')}
        action={
          <Link to="/purchasing/returns" className="btn btn-secondary">
            {t('purchases.returns.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/** U04: one purchase return. Posted returns are final: there is nothing to edit. */
export default function PurchaseReturnPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const query = useQuery({
    queryKey: purchaseReturnKeys.one(orgId, id),
    queryFn: () => purchaseReturnsApi.get(id),
    enabled: validId,
  });

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.returns.detail.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const ret = query.data;
  if (!ret) return <LoadingState />;
  const branchName = (branches.data ?? []).find((b) => b.id === ret.branch_id)?.name ?? '';

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.returns.detail.title', { number: ret.number })}
        actions={
          <Link to="/purchasing/returns" className="btn btn-ghost">
            {t('purchases.returns.back')}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <div className="mb-3">
            <Badge tone={ret.refund_mode === 'cash' ? 'success' : 'neutral'}>
              {t(`purchases.returns.mode.${ret.refund_mode}`)}
            </Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('purchases.returns.detail.invoice')}</dt>
              <dd>
                <Link
                  to={`/purchasing/invoices/${ret.purchase_invoice_id}`}
                  className="text-brand-700 hover:underline"
                  dir="ltr"
                >
                  {ret.invoice_number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.detail.supplier')}</dt>
              <dd>
                <Link
                  to={`/suppliers/${ret.supplier_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {ret.supplier_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.detail.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.detail.date')}</dt>
              <dd>{formatBusinessDate(ret.business_date)}</dd>
            </div>
            {ret.cash_account_name && (
              <div>
                <dt className="type-caption">{t('purchases.returns.detail.cashAccount')}</dt>
                <dd>{ret.cash_account_name}</dd>
              </div>
            )}
            <div>
              <dt className="type-caption">{t('purchases.returns.detail.createdBy')}</dt>
              <dd>
                {t('purchases.detail.by', {
                  name: ret.created_by_name ?? '',
                  when: formatDateTime(ret.created_at),
                })}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="type-caption">{t('purchases.returns.detail.reason')}</dt>
              <dd dir="auto">{ret.reason}</dd>
            </div>
          </dl>
        </Card>

        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('purchases.returns.detail.lines')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('purchases.returns.form.product')}</th>
                  <th className={th}>{t('purchases.returns.detail.serial')}</th>
                  <th className={thNum}>{t('purchases.returns.detail.quantity')}</th>
                  <th className={thNum}>{t('purchases.returns.form.unitCost')}</th>
                  <th className={thNum}>{t('purchases.returns.detail.net')}</th>
                  <th className={thNum}>{t('purchases.returns.detail.vat')}</th>
                  <th className={thNum}>{t('purchases.returns.detail.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {ret.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className={td}>
                      <span className="block">{productName(l)}</span>
                      <span className="type-caption block" dir="ltr">
                        {l.sku}
                      </span>
                    </td>
                    <td className={td}>
                      <span dir="ltr">{l.serial ?? ''}</span>
                    </td>
                    <td className={tdNum}>{formatNumber(l.quantity)}</td>
                    <td className={tdNum}>{formatMoney(l.unit_cost)}</td>
                    <td className={tdNum}>{formatMoney(l.net)}</td>
                    <td className={tdNum}>{formatMoney(l.tax_amount)}</td>
                    <td className={tdNum}>{formatMoney(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t('purchases.returns.detail.totals')}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="type-caption">{t('purchases.returns.form.subtotal')}</dt>
              <dd className="num">{formatMoney(ret.subtotal)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.form.taxTotal')}</dt>
              <dd className="num">{formatMoney(ret.tax_total)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.form.total')}</dt>
              <dd className="num type-section-title">{formatMoney(ret.total)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </PageContainer>
  );
}
