import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PurchaseOrder,
  compareMoney,
  type SalePaymentInput,
  type SalesOrder,
  type SalesOrderLine,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import { useCan } from '@/features/me/useCan';
import { t } from '@/i18n';
import { useOfflineStore } from '@/offline/store';
import { customerAccountApi, customerAccountKeys } from '@/services/customerAccountApi';
import { purchaseOrderKeys, purchaseOrdersApi } from '@/services/purchaseOrdersApi';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { useAuthStore } from '@/store/authStore';
import type { PurchaseOrderPrefill } from '@/pages/purchasing/PurchaseOrderFormPage';
import CancelOrderDialog from './CancelOrderDialog';
import PaymentDialog from './PaymentDialog';
import { SerialPicker } from './orderPickers';
import { productName } from './usePosCart';
import { salesOrderErrorMessage } from './salesOrderRules';

/** The open dialog of the order detail; one at a time. */
type OpenDialog =
  | { kind: 'deposit'; key: string }
  | { kind: 'cancel'; key: string }
  | { kind: 'reserve'; line: SalesOrderLine }
  | { kind: 'link'; line: SalesOrderLine };

/** Purchase orders that can still take a customer's line (Decision 6). */
const OPEN_PO = ['draft', 'sent', 'partially_received'] as const;
/** The `?link=<order line>` the order hands U05's form as its return target. */
const LINK_PARAM = 'link';

/**
 * S10 order-detail actions (`order.manage`): "Add deposit" while the order is open or partly
 * delivered; "Reserve now", "Link purchase order" and "Create purchase order" on the `to_order`
 * lines of an open order; "Cancel order" (`order.cancel`) while it is open; and "Print". Each call
 * answers with the whole order, handed to `onChange`. Orders are online-only: in the offline POS
 * (S08) it renders nothing, so the actions area stays hidden.
 */
export default function SalesOrderActions({
  order,
  onChange,
}: {
  order: SalesOrder;
  onChange: (order: SalesOrder) => void;
}) {
  const manage = useCan('order.manage');
  const orderPos = useCan('purchase.order_manage');
  const canCancel = useCan('order.cancel');
  // U05's list and detail answer to the supplier read guard: any one of these keys.
  const readsPos = [
    useCan('supplier.manage'),
    useCan('purchase.order_manage'),
    useCan('purchase.invoice_create'),
    useCan('purchase.invoice_approve'),
    useCan('purchase.return_create'),
    useCan('supplier.payment_create'),
    useCan('report.financial'),
  ].some(Boolean);
  const offline = useOfflineStore((s) => s.mode.mode === 'offline');
  const navigate = useNavigate();
  const location = useLocation();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linking = useRef(false);
  const orgId = useAuthStore((s) => s.orgId);
  // The deposit dialog offers store credit from the customer's balance; a plan without the
  // customer account (or any refusal) leaves it out.
  const account = useQuery({
    queryKey: customerAccountKeys.account(orgId, order.customer.id),
    queryFn: () => customerAccountApi.account(order.customer.id),
    enabled: manage && !offline && dialog?.kind === 'deposit',
    retry: false,
  });
  const storeCredit = account.isSuccess ? account.data.balance.store_credit : null;

  // Back from "Create purchase order": link the saved order's line for this product, once.
  const linkLine = new URLSearchParams(location.search).get(LINK_PARAM);
  useEffect(() => {
    if (!manage || offline || !linkLine || linking.current) return;
    linking.current = true;
    const returned = (location.state as { purchaseOrder?: unknown } | null)?.purchaseOrder;
    // Drop the return marks, so a reload or Back doesn't link again.
    void navigate(location.pathname, { replace: true, state: null });
    // U05's form was cancelled: no purchase order came back, so there is nothing to link or report.
    if (returned === undefined || returned === null) return;
    const saved = PurchaseOrder.safeParse(returned);
    const line = order.lines.find((l) => l.id === linkLine);
    const poLine = saved.success
      ? saved.data.lines.find((p) => p.product_id === line?.product_id)
      : undefined;
    void (
      line && poLine
        ? salesOrdersApi.linkPo(order.id, line.id, { po_line_id: poLine.id }).then(onChange)
        : Promise.reject(new Error('no purchase order line'))
    ).catch((e: unknown) =>
      setError(
        line && poLine ? salesOrderErrorMessage(e) : t('salesOrders.actions.linkReturnMissing'),
      ),
    );
  }, [manage, offline, linkLine, location.pathname, location.state, navigate, order, onChange]);

  if (!manage || offline) return null;
  const canDeposit =
    (order.status === 'open' || order.status === 'partially_delivered') &&
    compareMoney(order.balances.unpaid, '0.00') > 0;
  const toOrder =
    order.status === 'open' ? order.lines.filter((l) => l.fulfilment === 'to_order') : [];
  const showCancel = canCancel && order.status === 'open';

  async function run(call: () => Promise<SalesOrder>) {
    setBusy(true);
    try {
      onChange(await call());
      setDialog(null);
      return null;
    } catch (e) {
      return e;
    } finally {
      setBusy(false);
    }
  }
  const createPo = (line: SalesOrderLine) => {
    const prefill: PurchaseOrderPrefill = {
      line: {
        product_id: line.product.id,
        name: productName(line.product),
        sku: line.product.sku,
        quantity: line.quantity,
      },
      returnTo: `/sales/orders/${order.id}?${LINK_PARAM}=${line.id}`,
    };
    void navigate(`/purchasing/orders/new?branch_id=${order.branch.id}`, { state: prefill });
  };

  return (
    <>
      <div className="sales-order-action-bar">
        {canDeposit && (
          <Button
            type="button"
            onClick={() => setDialog({ kind: 'deposit', key: crypto.randomUUID() })}
          >
            {t('salesOrders.actions.deposit')}
          </Button>
        )}
        {showCancel && (
          <Button
            type="button"
            variant="danger"
            onClick={() => setDialog({ kind: 'cancel', key: crypto.randomUUID() })}
          >
            {t('salesOrders.actions.cancel')}
          </Button>
        )}
        <Link to={`/sales/orders/${order.id}/print`}>{t('salesOrders.actions.print')}</Link>
      </div>
      {toOrder.length > 0 && (
        <ul className="sales-order-line-actions">
          {toOrder.map((l) => {
            const label = t('salesOrders.actions.line', {
              no: l.line_no,
              name: productName(l.product),
            });
            return (
              <li key={l.id} role="group" aria-label={label}>
                <span>{label}</span>
                {l.reserved === 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog({ kind: 'reserve', line: l })}
                  >
                    {t('salesOrders.actions.reserve')}
                  </Button>
                )}
                {readsPos && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog({ kind: 'link', line: l })}
                  >
                    {t('salesOrders.actions.link')}
                  </Button>
                )}
                {orderPos && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => createPo(l)}>
                    {t('salesOrders.actions.createPo')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      {dialog?.kind === 'deposit' && (
        <PaymentDialog
          purpose="deposit"
          total={order.balances.unpaid}
          customerId={order.customer.id}
          storeCreditBalance={storeCredit}
          busy={busy}
          onPay={(payments: SalePaymentInput[]) =>
            run(() => salesOrdersApi.deposit(order.id, { payments }, dialog.key))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelOrderDialog
          order={order}
          busy={busy}
          onCancel={(body) => run(() => salesOrdersApi.cancel(order.id, body, dialog.key))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reserve' && (
        <ReserveDialog
          order={order}
          line={dialog.line}
          busy={busy}
          onReserve={(unitIds) =>
            run(() =>
              salesOrdersApi.reserve(
                order.id,
                dialog.line.id,
                unitIds ? { unit_ids: unitIds } : {},
              ),
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkPoDialog
          order={order}
          line={dialog.line}
          busy={busy}
          onLink={(poLineId) =>
            run(() => salesOrdersApi.linkPo(order.id, dialog.line.id, { po_line_id: poLineId }))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** Decision 7: hold stock for a `to_order` line now; a serialized product names its units. */
function ReserveDialog({
  order,
  line,
  busy,
  onReserve,
  onClose,
}: {
  order: SalesOrder;
  line: SalesOrderLine;
  busy: boolean;
  onReserve: (unitIds: string[] | null) => Promise<unknown>;
  onClose: () => void;
}) {
  const [units, setUnits] = useState<string[]>([]);
  const [error, setError] = useState('');
  const serialized = line.product.is_serialized;
  const ready = !serialized || new Set(units).size === line.quantity;
  async function submit() {
    setError('');
    const refused = await onReserve(serialized ? units : null);
    if (refused) setError(salesOrderErrorMessage(refused));
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('salesOrders.reserve.title', { name: productName(line.product) })}
      description={t('salesOrders.reserve.description', {
        quantity: line.quantity,
        branch: order.branch.name,
      })}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('salesOrders.actions.close')}
          </Button>
          <Button
            type="button"
            loading={busy}
            disabled={busy || !ready}
            onClick={() => void submit()}
          >
            {t('salesOrders.reserve.submit')}
          </Button>
        </>
      }
    >
      {serialized && (
        <SerialPicker
          productId={line.product.id}
          branchId={order.branch.id}
          quantity={line.quantity}
          value={units}
          onChange={setUnits}
        />
      )}
      <FormError message={error} />
    </Dialog>
  );
}

/**
 * Decision 6: pick an open purchase order line of the same product. U05 lists the orders without
 * their lines, so each open order of the order's branch is read for its lines.
 */
function LinkPoDialog({
  order,
  line,
  busy,
  onLink,
  onClose,
}: {
  order: SalesOrder;
  line: SalesOrderLine;
  busy: boolean;
  onLink: (poLineId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState('');
  const productId = line.product.id;
  const choices = useQuery({
    queryKey: [...purchaseOrderKeys.all(orgId), 'open-lines', order.branch.id, productId],
    queryFn: async () => {
      const lists = await Promise.all(
        OPEN_PO.map((status) =>
          purchaseOrdersApi.list({ status, branch_id: order.branch.id, pageSize: 100 }),
        ),
      );
      const pos = await Promise.all(
        lists.flatMap((l) => l.items).map((po) => purchaseOrdersApi.get(po.id)),
      );
      return pos.flatMap((po) =>
        po.lines.filter((l) => l.product_id === productId).map((l) => ({ po, line: l })),
      );
    },
  });
  async function submit() {
    if (!picked) return;
    setError('');
    const refused = await onLink(picked);
    if (refused) setError(salesOrderErrorMessage(refused));
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('salesOrders.link.title', { name: productName(line.product) })}
      description={t('salesOrders.link.description')}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('salesOrders.actions.close')}
          </Button>
          <Button
            type="button"
            loading={busy}
            disabled={busy || !picked}
            onClick={() => void submit()}
          >
            {t('salesOrders.link.submit')}
          </Button>
        </>
      }
    >
      {choices.isPending && <p>{t('salesOrders.link.loading')}</p>}
      {choices.isError && <p role="alert">{t('salesOrders.link.failed')}</p>}
      {choices.data?.length === 0 && <p>{t('salesOrders.link.none')}</p>}
      {(choices.data?.length ?? 0) > 0 && (
        <fieldset className="sales-order-serials">
          <legend>{t('salesOrders.link.choose')}</legend>
          {choices.data?.map(({ po, line: l }) => (
            <label key={l.id} className="sales-order-choice">
              <input
                type="radio"
                name="po-line"
                value={l.id}
                checked={picked === l.id}
                onChange={() => setPicked(l.id)}
              />
              <span>
                {t('salesOrders.link.option', {
                  number: po.number,
                  supplier: po.supplier_name,
                  status: t(`purchases.orders.status.${po.status}`),
                  quantity: l.quantity,
                  remaining: l.remaining,
                })}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <FormError message={error} />
    </Dialog>
  );
}
