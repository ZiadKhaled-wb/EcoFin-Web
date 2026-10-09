import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchaseOrderInvoiceBody, Uuid, type PurchaseOrder } from '@ziadkhaled-wb/contracts';
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
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { padDecimals } from '@/lib/number';
import { purchaseInvoiceKeys } from '@/services/purchaseInvoicesApi';
import { purchaseOrderKeys, purchaseOrdersApi } from '@/services/purchaseOrdersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { ORDER_STATUS_TONE, orderError, overReceipt } from './purchaseOrderShared';
import { STATUS_TONE, productName } from './purchaseShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('purchases.orders.detail.notFound')}
        description={t('purchases.orders.detail.notFoundHint')}
        action={
          <Link to="/purchasing/orders" className="btn btn-secondary">
            {t('purchases.orders.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * U05: one purchase order. A draft is edited or sent; a sent or partly received order is
 * received as draft purchase invoices; it can be cancelled with a reason until it is received.
 */
export default function PurchaseOrderPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const query = useQuery({
    queryKey: purchaseOrderKeys.one(orgId, id),
    queryFn: () => purchaseOrdersApi.get(id),
    enabled: validId,
  });
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.orders.detail.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const order = query.data;
  if (!order) return <LoadingState />;

  const refresh = () => cache.invalidateQueries({ queryKey: purchaseOrderKeys.all(orgId) });
  const draft = order.status === 'draft';
  const receivable = order.status === 'sent' || order.status === 'partially_received';
  const open = draft || receivable;
  const branchName = (branches.data ?? []).find((b) => b.id === order.branch_id)?.name ?? '';

  async function send() {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await purchaseOrdersApi.send(order!.id);
      notify.success(t('purchases.orders.detail.sent'));
      await refresh();
    } catch (err) {
      notify.error(orderError(err));
    } finally {
      acting.current = false;
      setBusy(false);
      setSending(false);
    }
  }

  async function cancel() {
    const text = reason.trim();
    if (text.length < 3 || text.length > 500) {
      setReasonError(t('purchases.orders.detail.reasonInvalid'));
      return;
    }
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await purchaseOrdersApi.cancel(order!.id, text);
      notify.success(t('purchases.orders.detail.cancelled'));
      setCancelling(false);
      await refresh();
    } catch (err) {
      setReasonError(orderError(err));
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.orders.detail.title', { number: order.number })}
        actions={
          <>
            <Link to="/purchasing/orders" className="btn btn-ghost">
              {t('purchases.orders.back')}
            </Link>
            <Can permission="purchase.order_manage">
              {draft && (
                <Link to={`/purchasing/orders/${order.id}/edit`} className="btn btn-secondary">
                  {t('purchases.orders.detail.edit')}
                </Link>
              )}
              {open && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReason('');
                    setReasonError('');
                    setCancelling(true);
                  }}
                >
                  {t('purchases.orders.detail.cancelOrder')}
                </Button>
              )}
              {draft && (
                <Button disabled={busy} onClick={() => setSending(true)}>
                  {t('purchases.orders.detail.send')}
                </Button>
              )}
            </Can>
            {receivable && (
              <Can permission="purchase.invoice_create">
                <Button onClick={() => setReceiving(true)}>
                  {t('purchases.orders.detail.receive')}
                </Button>
              </Can>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <Card>
          <div className="mb-3">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>
              {t(`purchases.orders.status.${order.status}`)}
            </Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('purchases.orders.detail.supplier')}</dt>
              <dd>
                <Link
                  to={`/suppliers/${order.supplier_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {order.supplier_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.orders.detail.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.orders.detail.expectedDate')}</dt>
              <dd>{order.expected_date ? formatBusinessDate(order.expected_date) : '—'}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.orders.detail.createdBy')}</dt>
              <dd>
                {t('purchases.detail.by', {
                  name: order.created_by_name ?? '',
                  when: formatDateTime(order.created_at),
                })}
              </dd>
            </div>
            {order.notes && (
              <div className="sm:col-span-2">
                <dt className="type-caption">{t('purchases.orders.detail.notes')}</dt>
                <dd dir="auto">{order.notes}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('purchases.orders.detail.lines')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('purchases.orders.form.product')}</th>
                  <th className={thNum}>{t('purchases.orders.detail.ordered')}</th>
                  <th className={thNum}>{t('purchases.orders.detail.received')}</th>
                  <th className={thNum}>{t('purchases.orders.detail.onDraft')}</th>
                  <th className={thNum}>{t('purchases.orders.detail.remaining')}</th>
                  <th className={thNum}>{t('purchases.orders.detail.expectedCost')}</th>
                  <th className={th}>{t('purchases.orders.detail.customerOrder')}</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className={td}>
                      <span className="block">{productName(l)}</span>
                      <span className="type-caption block" dir="ltr">
                        {l.sku}
                      </span>
                    </td>
                    <td className={tdNum}>{formatNumber(l.quantity)}</td>
                    <td className={tdNum}>{formatNumber(l.received)}</td>
                    <td className={tdNum}>{formatNumber(l.on_draft_invoices)}</td>
                    <td className={tdNum}>{formatNumber(l.remaining)}</td>
                    <td className={tdNum}>
                      {l.expected_unit_cost === null ? '—' : formatMoney(l.expected_unit_cost)}
                    </td>
                    <td className={td}>
                      <span dir="ltr">{l.customer_order?.number ?? ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t('purchases.orders.detail.invoices')} padded={false}>
          {order.invoices.length === 0 ? (
            <p className="type-caption px-4 py-3">{t('purchases.orders.detail.noInvoices')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('purchases.orders.detail.invoices')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className={th}>{t('purchases.columns.number')}</th>
                    <th className={th}>{t('purchases.columns.status')}</th>
                    <th className={thNum}>{t('purchases.columns.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.invoices.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className={td}>
                        <Link
                          to={`/purchasing/invoices/${i.id}`}
                          className="text-brand-700 hover:underline"
                          dir="ltr"
                        >
                          {i.number}
                        </Link>
                      </td>
                      <td className={td}>
                        <Badge tone={STATUS_TONE[i.status]}>
                          {t(`purchases.status.${i.status}`)}
                        </Badge>
                      </td>
                      <td className={tdNum}>{formatMoney(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={sending}
        onOpenChange={(v) => !v && setSending(false)}
        title={t('purchases.orders.detail.sendTitle')}
        description={t('purchases.orders.detail.sendConfirm')}
        confirmLabel={t('purchases.orders.detail.send')}
        loading={busy}
        onConfirm={() => void send()}
      />
      <Dialog
        open={cancelling}
        onOpenChange={(v) => !v && setCancelling(false)}
        title={t('purchases.orders.detail.cancelTitle')}
        description={t('purchases.orders.detail.cancelHelp')}
      >
        <div className="space-y-3">
          <Textarea
            label={t('purchases.orders.detail.reason')}
            value={reason}
            maxLength={500}
            rows={3}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="danger" loading={busy} disabled={busy} onClick={() => void cancel()}>
            {t('purchases.orders.detail.cancelOrder')}
          </Button>
        </div>
      </Dialog>
      {receiving && (
        <ReceiveDialog
          order={order}
          onClose={() => setReceiving(false)}
          onRefused={() => void refresh()}
        />
      )}
    </PageContainer>
  );
}

/**
 * "Receive": each line with something still to come, quantity defaulting to what remains and the
 * unit cost to the expected cost. It creates a draft purchase invoice and opens it for editing.
 */
function ReceiveDialog({
  order,
  onClose,
  onRefused,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onRefused: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const open = order.lines.filter((l) => l.remaining > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((l) => [l.id, String(l.remaining)])),
  );
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((l) => [l.id, l.expected_unit_cost ?? ''])),
  );
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog: a double click makes one draft invoice.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);

  async function submit() {
    if (posting.current) return;
    setError('');
    setLineErrors({});
    const parsed = PurchaseOrderInvoiceBody.safeParse({
      lines: open
        .filter((l) => Number(quantities[l.id] || 0) > 0)
        .map((l) => ({
          po_line_id: l.id,
          quantity: Number(quantities[l.id]),
          ...(costs[l.id] ? { unit_cost: padDecimals(costs[l.id]!, 2) } : {}),
        })),
    });
    if (!parsed.success) {
      setError(t('purchases.orders.detail.receiveNothing'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const invoice = await purchaseOrdersApi.invoice(order.id, parsed.data, key);
      notify.success(t('purchases.orders.detail.received_', { number: invoice.number }));
      await Promise.all([
        cache.invalidateQueries({ queryKey: purchaseOrderKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) }),
      ]);
      void navigate(`/purchasing/invoices/${invoice.id}/edit`);
    } catch (err) {
      const over = overReceipt(err);
      if (over) setLineErrors({ [over.po_line_id]: orderError(err) });
      setError(orderError(err));
      onRefused();
      // A refused call can be tried again; after a success the dialog stays locked until it leaves.
      posting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('purchases.orders.detail.receiveTitle')}
      description={t('purchases.orders.detail.receiveHelp')}
    >
      <div className="space-y-3">
        {open.map((l) => {
          const name = productName(l);
          return (
            <div key={l.id} className="grid gap-2 border-b border-line pb-3 sm:grid-cols-2">
              <NumberInput
                label={t('purchases.orders.detail.receiveQuantity', { name })}
                value={quantities[l.id] ?? ''}
                help={`${t('purchases.orders.detail.remaining')}: ${formatNumber(l.remaining)}`}
                error={lineErrors[l.id]}
                onValueChange={(v) => setQuantities((q) => ({ ...q, [l.id]: v }))}
              />
              <MoneyInput
                label={t('purchases.orders.detail.receiveCost', { name })}
                value={costs[l.id] ?? ''}
                onValueChange={(v) => setCosts((c) => ({ ...c, [l.id]: v }))}
              />
            </div>
          );
        })}
        <FormError message={error} />
        <Button loading={busy} disabled={busy} onClick={() => void submit()}>
          {t('purchases.orders.detail.receiveSubmit')}
        </Button>
      </div>
    </Dialog>
  );
}
