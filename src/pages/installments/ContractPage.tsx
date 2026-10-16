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
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { installmentKeys, installmentsApi } from '@/services/installmentsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { relationLabel } from '../customers/guarantorShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('installments.contract.notFound')}
        description={t('installments.contract.notFoundHint')}
      />
    </PageContainer>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * N02 (D77): one installment contract: its terms (cash price, down payment, financed amount, the
 * profit for the whole term, the installment price), the customer and guarantors, the schedule
 * with what was paid and the balance. A contract is never edited; N05 changes it by new records.
 */
export default function ContractPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: installmentKeys.contract(orgId, id),
    queryFn: () => installmentsApi.contract(id),
    enabled: validId,
    retry: false,
  });

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('installments.contract.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const c = query.data;
  if (!c) return <LoadingState />;

  return (
    <PageContainer>
      <PageHeader
        title={t('installments.contract.title', { number: c.number })}
        actions={
          <Link to={`/customers/${c.customer.id}`} className="btn btn-ghost">
            {t('installments.contract.toCustomer')}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t('installments.contract.status')}>
              <Badge tone={c.status === 'active' ? 'brand' : 'neutral'}>
                {t(`customerAccount.contracts.status.${c.status}`)}
              </Badge>
            </Fact>
            <Fact label={t('installments.contract.customer')}>
              <Link to={`/customers/${c.customer.id}`} className="text-brand-700 hover:underline">
                <bdi>{c.customer.name}</bdi>
              </Link>
              {c.customer.phone && (
                <span className="type-caption block" dir="ltr">
                  {c.customer.phone}
                </span>
              )}
            </Fact>
            <Fact label={t('installments.contract.sale')}>
              {c.sale_id ? (
                <Link
                  to={`/sales/${c.sale_id}`}
                  className="text-brand-700 hover:underline"
                  dir="ltr"
                >
                  {c.sale_number}
                </Link>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label={t('installments.contract.issued')}>{formatDateTime(c.created_at)}</Fact>
          </dl>
        </Card>

        <Card title={t('installments.contract.terms')}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t('installments.terms.cashPrice')}>
              <span className="num">{formatMoney(c.cash_price)}</span>
            </Fact>
            <Fact label={t('installments.terms.downPayment')}>
              <span className="num">{formatMoney(c.down_payment)}</span>
            </Fact>
            <Fact label={t('installments.terms.financed')}>
              <span className="num">{formatMoney(c.financed_amount)}</span>
            </Fact>
            <Fact label={t('installments.terms.profit')}>
              <span className="num" data-testid="contract-profit">
                {formatMoney(c.markup_amount)}
              </span>
            </Fact>
            <Fact label={t('installments.terms.installmentPrice')}>
              <span className="num" data-testid="contract-total">
                {formatMoney(c.total_payable)}
              </span>
            </Fact>
            <Fact label={t('installments.fields.frequency')}>
              {t('installments.contract.countOf', {
                count: formatNumber(c.installments_count),
                frequency: t(`installments.frequency.${c.frequency}`),
              })}
            </Fact>
            <Fact label={t('installments.terms.firstDue')}>
              {formatBusinessDate(c.first_due_date)}
            </Fact>
            <Fact label={t('installments.terms.lastDue')}>
              {c.last_due_date ? formatBusinessDate(c.last_due_date) : '—'}
            </Fact>
          </dl>
          <p className="type-caption mt-3">
            {t('installments.contract.policy', { version: formatNumber(c.policy_version) })}
          </p>
        </Card>

        <Card title={t('installments.contract.balance')}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label={t('installments.contract.paid')}>
              <span className="num">{formatMoney(c.balance.paid)}</span>
            </Fact>
            <Fact label={t('installments.contract.remaining')}>
              <span className="num" data-testid="contract-remaining">
                {formatMoney(c.balance.remaining)}
              </span>
            </Fact>
            <Fact label={t('installments.contract.overdue')}>
              <span className="num">{formatMoney(c.balance.overdue)}</span>
            </Fact>
          </dl>
        </Card>

        <Card title={t('installments.contract.guarantors')}>
          {c.guarantors.length === 0 ? (
            <p>{t('installments.contract.noGuarantors')}</p>
          ) : (
            <ul className="space-y-1">
              {c.guarantors.map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/customers/guarantors/${g.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    <bdi>{g.name}</bdi>
                  </Link>
                  {g.relation && (
                    <span className="type-caption ms-2">
                      {relationLabel(g.relation as Parameters<typeof relationLabel>[0])}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t('installments.schedule.title', { count: formatNumber(c.lines.length) })}
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('installments.schedule.caption')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('installments.schedule.seq')}</th>
                  <th className={th}>{t('installments.schedule.due')}</th>
                  <th className={thNum}>{t('installments.schedule.amount')}</th>
                  <th className={thNum}>{t('installments.schedule.principal')}</th>
                  <th className={thNum}>{t('installments.schedule.profit')}</th>
                  <th className={thNum}>{t('installments.contract.paid')}</th>
                  <th className={thNum}>{t('installments.contract.remaining')}</th>
                  <th className={th}>{t('installments.contract.status')}</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l) => (
                  <tr key={l.seq} className="border-b border-line">
                    <td className={tdNum}>{formatNumber(l.seq)}</td>
                    <td className={td}>{formatBusinessDate(l.due_date)}</td>
                    <td className={tdNum}>{formatMoney(l.amount)}</td>
                    <td className={tdNum}>{formatMoney(l.principal)}</td>
                    <td className={tdNum}>{formatMoney(l.profit)}</td>
                    <td className={tdNum}>{formatMoney(l.paid)}</td>
                    <td className={tdNum}>{formatMoney(l.remaining)}</td>
                    <td className={td}>{t(`customerAccount.schedule.status.${l.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
