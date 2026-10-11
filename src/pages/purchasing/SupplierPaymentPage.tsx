import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney } from '@/lib/format';
import { cashKeys } from '@/services/cashApi';
import { purchaseInvoiceKeys } from '@/services/purchaseInvoicesApi';
import { supplierPaymentKeys, supplierPaymentsApi } from '@/services/supplierPaymentsApi';
import { supplierKeys } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { STATE_TONE, paymentError, paymentState } from './supplierPaymentShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('purchases.payments.detail.notFound')}
        description={t('purchases.payments.detail.notFoundHint')}
        action={
          <Link to="/purchasing/payments" className="btn btn-secondary">
            {t('purchases.payments.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * U03: one supplier payment, shown as its receipt (the SP number is the receipt number). The
 * owner can reverse it with a reason; a reversal is final.
 */
export default function SupplierPaymentPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  // Only the owner reverses a payment (the server checks too).
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const cache = useQueryClient();
  const branches = useBranches();
  const query = useQuery({
    queryKey: supplierPaymentKeys.one(orgId, id),
    queryFn: () => supplierPaymentsApi.get(id),
    enabled: validId,
  });
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog: a double click reverses once.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const reversingNow = useRef(false);

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.payments.detail.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const payment = query.data;
  if (!payment) return <LoadingState />;
  const state = paymentState(payment);
  const branchName = (branches.data ?? []).find((b) => b.id === payment.branch_id)?.name ?? '';

  async function reverse() {
    if (reversingNow.current) return;
    const text = reason.trim();
    if (text.length < 3 || text.length > 500) {
      setReasonError(t('purchases.payments.detail.reasonInvalid'));
      return;
    }
    reversingNow.current = true;
    setBusy(true);
    try {
      await supplierPaymentsApi.reverse(payment!.id, text, key);
      notify.success(t('purchases.payments.detail.reversed'));
      setReversing(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: supplierPaymentKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
      ]);
    } catch (err) {
      setReasonError(paymentError(err));
    } finally {
      reversingNow.current = false;
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.payments.detail.title', { number: payment.number })}
        actions={
          <div className="flex gap-2 print:hidden">
            <Link to="/purchasing/payments" className="btn btn-ghost">
              {t('purchases.payments.back')}
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              {t('purchases.payments.detail.print')}
            </Button>
            {state === 'paid' && isOwner && (
              <Button
                variant="danger"
                onClick={() => {
                  setReason('');
                  setReasonError('');
                  setKey(crypto.randomUUID());
                  setReversing(true);
                }}
              >
                {t('purchases.payments.detail.reverse')}
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-4">
        {state !== 'paid' && (
          <Card>
            <p role="status" className="text-ochre-700">
              {state === 'reversed'
                ? t('purchases.payments.detail.reversedBy')
                : t('purchases.payments.detail.reversalOf')}{' '}
              <Link
                to={`/purchasing/payments/${payment.reversed_by_payment_id ?? payment.reverses_payment_id}`}
                className="text-brand-700 hover:underline print:hidden"
              >
                {state === 'reversed'
                  ? t('purchases.payments.detail.openReversal')
                  : t('purchases.payments.detail.openOriginal')}
              </Link>
            </p>
            {payment.reason && <p dir="auto">{payment.reason}</p>}
          </Card>
        )}
        <Card>
          <div className="mb-3">
            <Badge tone={STATE_TONE[state]}>{t(`purchases.payments.state.${state}`)}</Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.receiptNo')}</dt>
              <dd dir="ltr" className="text-start">
                {payment.number}
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.supplier')}</dt>
              <dd>
                <Link
                  to={`/suppliers/${payment.supplier_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {payment.supplier_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.amount')}</dt>
              <dd className="num type-section-title">{formatMoney(payment.amount)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.date')}</dt>
              <dd>{formatBusinessDate(payment.business_date)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.account')}</dt>
              <dd>{payment.cash_account_name}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.reference')}</dt>
              <dd dir="auto">{payment.reference ?? '—'}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.payments.detail.createdBy')}</dt>
              <dd>
                {t('purchases.detail.by', {
                  name: payment.created_by_name ?? '',
                  when: formatDateTime(payment.paid_at),
                })}
              </dd>
            </div>
          </dl>
        </Card>

        {payment.allocations.length > 0 && (
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('purchases.payments.detail.allocations')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('purchases.payments.detail.invoice')}</th>
                    <th className={thNum}>{t('purchases.payments.detail.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.allocations.map((a) => (
                    <tr key={a.purchase_invoice_id} className="border-b border-line">
                      <td className={td}>
                        <Link
                          to={`/purchasing/invoices/${a.purchase_invoice_id}`}
                          className="text-brand-700 hover:underline"
                          dir="ltr"
                        >
                          {a.invoice_number}
                        </Link>
                      </td>
                      <td className={tdNum}>{formatMoney(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={reversing}
        onOpenChange={(v) => !v && setReversing(false)}
        title={t('purchases.payments.detail.reverseTitle')}
        description={t('purchases.payments.detail.reverseHelp')}
      >
        <div className="space-y-3">
          <Textarea
            label={t('purchases.payments.detail.reason')}
            value={reason}
            maxLength={500}
            rows={3}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="danger" loading={busy} disabled={busy} onClick={() => void reverse()}>
            {t('purchases.payments.detail.reverse')}
          </Button>
        </div>
      </Dialog>
    </PageContainer>
  );
}
