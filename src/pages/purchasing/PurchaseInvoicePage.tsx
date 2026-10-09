import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SerialsRequiredDetail, Uuid, type PurchaseInvoiceLine } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { purchaseInvoiceKeys, purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { purchaseReturnKeys, purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { supplierKeys } from '@/services/suppliersApi';
import { stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { STATUS_TONE, productName, purchaseError } from './purchaseShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('purchases.detail.notFound')}
        description={t('purchases.detail.notFoundHint')}
        action={
          <Link to="/purchasing/invoices" className="btn btn-secondary">
            {t('purchases.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * U02: one purchase invoice. Drafts can be edited, approved (stock in once, cost updated) or
 * rejected with a reason; an approved invoice shows what is still owed and its serial units.
 */
export default function PurchaseInvoicePage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const invoice = useQuery({
    queryKey: purchaseInvoiceKeys.one(orgId, id),
    queryFn: () => purchaseInvoicesApi.get(id),
    enabled: validId,
  });
  // U04: an approved invoice lists what was sent back to the supplier.
  const returnsParams = { purchase_invoice_id: id, pageSize: 100 };
  const returns = useQuery({
    queryKey: purchaseReturnKeys.list(orgId, returnsParams),
    queryFn: () => purchaseReturnsApi.list(returnsParams),
    enabled: validId && invoice.data?.status === 'approved',
  });
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needSerials, setNeedSerials] = useState<string[]>([]);
  // A double click on Confirm must post once: state updates land too late to block it.
  const approvingNow = useRef(false);
  // U06: only the owner decides an invoice waiting above the approval limit (the server checks too).
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const [deciding, setDeciding] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  if (!validId) return <NotFound />;
  if (invoice.isError && !invoice.data) {
    if (invoice.error instanceof ApiError && invoice.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.detail.loadFailed')}
          onRetry={() => void invoice.refetch()}
        />
      </PageContainer>
    );
  }
  const inv = invoice.data;
  if (!inv) return <LoadingState />;

  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
    ]);

  /** `ownerNote`: the owner's decision on a waiting invoice (U06). */
  async function approve(ownerNote?: string) {
    if (approvingNow.current) return;
    approvingNow.current = true;
    setBusy(true);
    setNeedSerials([]);
    try {
      const result = await purchaseInvoicesApi.approve(inv!.id, ownerNote);
      if (result.status === 'pending_approval') {
        notify.info(
          t('purchases.approval.sent', {
            threshold: formatMoney(result.approval?.threshold ?? '0'),
          }),
        );
      } else {
        notify.success(t('purchases.detail.approved'));
      }
      setDeciding(false);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SERIALS_REQUIRED') {
        const detail = SerialsRequiredDetail.safeParse(err.details);
        if (detail.success) setNeedSerials(detail.data.line_ids);
      }
      if (ownerNote !== undefined) setNoteError(purchaseError(err));
      else notify.error(purchaseError(err));
    } finally {
      approvingNow.current = false;
      setBusy(false);
      setApproving(false);
    }
  }

  function decide() {
    const text = note.trim();
    if (text.length < 3 || text.length > 500) {
      setNoteError(t('purchases.approval.noteInvalid'));
      return;
    }
    void approve(text);
  }

  async function reject() {
    const text = reason.trim();
    if (text.length < 3 || text.length > 500) {
      setReasonError(t('purchases.detail.reasonInvalid'));
      return;
    }
    setBusy(true);
    try {
      await purchaseInvoicesApi.reject(inv!.id, text);
      notify.success(t('purchases.detail.rejected'));
      setRejecting(false);
      await refresh();
    } catch (err) {
      setReasonError(purchaseError(err));
    } finally {
      setBusy(false);
    }
  }

  const branchName = (branches.data ?? []).find((b) => b.id === inv.branch_id)?.name ?? '';
  const draft = inv.status === 'draft';
  const pending = inv.status === 'pending_approval';
  const openReject = () => {
    setReason('');
    setReasonError('');
    setRejecting(true);
  };
  const by = (name: string | null, at: string) =>
    t('purchases.detail.by', { name: name ?? '', when: formatDateTime(at) });
  const serialsOf = (l: PurchaseInvoiceLine) => (l.serials ?? []).join(', ');

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.detail.title', { number: inv.number })}
        actions={
          <>
            <Link to="/purchasing/invoices" className="btn btn-ghost">
              {t('purchases.back')}
            </Link>
            {draft && (
              <Can permission="purchase.invoice_create">
                <Link to={`/purchasing/invoices/${inv.id}/edit`} className="btn btn-secondary">
                  {t('purchases.detail.edit')}
                </Link>
              </Can>
            )}
            {draft && (
              <Can permission="purchase.invoice_approve">
                <Button variant="secondary" onClick={openReject}>
                  {t('purchases.detail.reject')}
                </Button>
                <Button disabled={busy} onClick={() => setApproving(true)}>
                  {t('purchases.detail.approve')}
                </Button>
              </Can>
            )}
            {inv.status === 'approved' && (
              <Can permission="purchase.return_create">
                <Link to={`/purchasing/invoices/${inv.id}/return`} className="btn btn-secondary">
                  {t('purchases.returns.action')}
                </Link>
              </Can>
            )}
            {inv.status === 'approved' && Number(inv.outstanding ?? 0) > 0 && (
              <Can permission="supplier.payment_create">
                <Link
                  to={`/purchasing/payments/new?supplier_id=${inv.supplier_id}&invoice_id=${inv.id}`}
                  className="btn btn-primary"
                >
                  {t('purchases.payments.pay')}
                </Link>
              </Can>
            )}
            {pending && isOwner && (
              <Can permission="purchase.invoice_approve">
                <Button variant="secondary" onClick={openReject}>
                  {t('purchases.detail.reject')}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setNote('');
                    setNoteError('');
                    setDeciding(true);
                  }}
                >
                  {t('purchases.detail.approve')}
                </Button>
              </Can>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <Card>
          <div className="mb-3">
            <Badge tone={STATUS_TONE[inv.status]}>{t(`purchases.status.${inv.status}`)}</Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('purchases.detail.supplier')}</dt>
              <dd>
                <Link
                  to={`/suppliers/${inv.supplier_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {inv.supplier_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.detail.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.detail.date')}</dt>
              <dd>{formatBusinessDate(inv.invoice_date)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.detail.supplierInvoiceNo')}</dt>
              <dd>
                {inv.supplier_invoice_no ? <span dir="ltr">{inv.supplier_invoice_no}</span> : '—'}
              </dd>
            </div>
            {inv.po_id && (
              <div>
                <dt className="type-caption">{t('purchases.orders.fromOrder')}</dt>
                <dd>
                  <Link
                    to={`/purchasing/orders/${inv.po_id}`}
                    className="text-brand-700 hover:underline"
                    dir="ltr"
                  >
                    {inv.po_number}
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt className="type-caption">{t('purchases.detail.createdBy')}</dt>
              <dd>{by(inv.created_by_name, inv.created_at)}</dd>
            </div>
            {inv.approved_at && (
              <div>
                <dt className="type-caption">{t('purchases.detail.approvedBy')}</dt>
                <dd>{by(inv.approved_by_name, inv.approved_at)}</dd>
              </div>
            )}
            {inv.rejected_reason && (
              <div className="sm:col-span-2">
                <dt className="type-caption">{t('purchases.detail.rejectedReason')}</dt>
                <dd>{inv.rejected_reason}</dd>
              </div>
            )}
          </dl>
        </Card>

        {pending && inv.approval && (
          <Card>
            <p role="status" className="text-warning-700">
              {t('purchases.approval.pendingBanner', {
                name: inv.approval.requested_by_name ?? '',
                when: formatDateTime(inv.approval.requested_at),
                threshold: formatMoney(inv.approval.threshold ?? '0'),
              })}
            </p>
          </Card>
        )}
        {inv.approval?.decided_at && (
          <Card>
            <p>
              {t('purchases.approval.decided', {
                name: inv.approval.decided_by_name ?? '',
                when: formatDateTime(inv.approval.decided_at),
                note: inv.approval.note ?? '',
              })}
            </p>
          </Card>
        )}

        {needSerials.length > 0 && <FormError message={t('purchases.errors.serialsRequired')} />}

        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('purchases.detail.lines')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('purchases.form.product')}</th>
                  <th className={thNum}>{t('purchases.form.quantity')}</th>
                  <th className={thNum}>{t('purchases.form.unitCost')}</th>
                  <th className={thNum}>{t('purchases.detail.taxRate')}</th>
                  <th className={thNum}>{t('purchases.form.net')}</th>
                  <th className={thNum}>{t('purchases.form.vat')}</th>
                  <th className={thNum}>{t('purchases.form.lineTotal')}</th>
                  <th className={th}>{t('purchases.detail.serials')}</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => {
                  const missing = needSerials.includes(l.id);
                  return (
                    <tr
                      key={l.id}
                      className={cn('border-b border-line', missing && 'bg-danger-50')}
                      data-needs-serials={missing ? 'true' : undefined}
                    >
                      <td className={td}>
                        <span className="block">{productName(l)}</span>
                        <span className="type-caption block" dir="ltr">
                          {l.sku}
                        </span>
                      </td>
                      <td className={tdNum}>{formatNumber(l.quantity)}</td>
                      <td className={tdNum}>{formatMoney(l.unit_cost)}</td>
                      <td className={tdNum}>{formatNumber(l.tax_rate)}%</td>
                      <td className={tdNum}>{formatMoney(l.net)}</td>
                      <td className={tdNum}>{formatMoney(l.tax_amount)}</td>
                      <td className={tdNum}>{formatMoney(l.line_total)}</td>
                      <td className={td}>
                        {missing ? (
                          <Badge tone="danger">{t('purchases.detail.needsSerials')}</Badge>
                        ) : (
                          <span dir="ltr" className="type-caption">
                            {serialsOf(l)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t('purchases.detail.totals')}>
          <dl className="grid gap-3 sm:grid-cols-4">
            <div>
              <dt className="type-caption">{t('purchases.detail.subtotal')}</dt>
              <dd className="num">{formatMoney(inv.subtotal)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.detail.taxTotal')}</dt>
              <dd className="num">{formatMoney(inv.tax_total)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.detail.total')}</dt>
              <dd className="num type-section-title">{formatMoney(inv.total)}</dd>
            </div>
            {inv.outstanding !== null && (
              <div>
                <dt className="type-caption">{t('purchases.detail.outstanding')}</dt>
                <dd className="num">{formatMoney(inv.outstanding)}</dd>
              </div>
            )}
          </dl>
        </Card>
        {(returns.data?.items.length ?? 0) > 0 && (
          <Card title={t('purchases.returns.ofInvoice')} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('purchases.returns.ofInvoice')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('purchases.returns.columns.number')}</th>
                    <th className={th}>{t('purchases.returns.columns.date')}</th>
                    <th className={th}>{t('purchases.returns.columns.refundMode')}</th>
                    <th className={thNum}>{t('purchases.returns.columns.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.data!.items.map((r) => (
                    <tr key={r.id} className="border-b border-line">
                      <td className={td}>
                        <Link
                          to={`/purchasing/returns/${r.id}`}
                          className="text-brand-700 hover:underline"
                          dir="ltr"
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td className={td}>{formatBusinessDate(r.business_date)}</td>
                      <td className={td}>{t(`purchases.returns.mode.${r.refund_mode}`)}</td>
                      <td className={tdNum}>{formatMoney(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={approving}
        onOpenChange={(v) => !v && setApproving(false)}
        title={t('purchases.detail.approveTitle')}
        description={t('purchases.detail.approveConfirm')}
        confirmLabel={t('purchases.detail.approve')}
        loading={busy}
        onConfirm={() => void approve()}
      />
      <Dialog
        open={rejecting}
        onOpenChange={(v) => !v && setRejecting(false)}
        title={t('purchases.detail.rejectTitle')}
        description={t('purchases.detail.rejectHelp')}
      >
        <div className="space-y-3">
          <Textarea
            label={t('purchases.detail.reason')}
            value={reason}
            maxLength={500}
            rows={3}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="danger" loading={busy} disabled={busy} onClick={() => void reject()}>
            {t('purchases.detail.reject')}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={deciding}
        onOpenChange={(v) => !v && setDeciding(false)}
        title={t('purchases.approval.ownerApproveTitle')}
        description={t('purchases.approval.ownerApproveHelp')}
      >
        <div className="space-y-3">
          <Textarea
            label={t('purchases.approval.note')}
            value={note}
            maxLength={500}
            rows={3}
            error={noteError}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button loading={busy} disabled={busy} onClick={decide}>
            {t('purchases.detail.approve')}
          </Button>
        </div>
      </Dialog>
    </PageContainer>
  );
}
