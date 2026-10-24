import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Uuid,
  compareMoney,
  type Contract,
  type Product,
  type Sale,
  type SalePaymentInput,
  type Shift,
  type UnitDetail,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import Notice from '@/components/ui/Notice';
import Skeleton from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import PrintDocumentButtons from '@/features/contractDocuments/PrintDocumentButtons';
import PrintReceipt from '@/features/receipts/PrintReceipt';
import { useCan } from '@/features/me/useCan';
import { useSettings } from '@/features/settings/useSettings';
import { shopProfileApi } from '@/services/shopProfileApi';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { installmentError } from '../installments/installmentShared';
import PaymentDialog from './PaymentDialog';
import InstallmentDialog, { type InstallmentPlan } from './pos/InstallmentDialog';
import CartPane from './pos/CartPane';
import CustomerPicker from './pos/CustomerPicker';
import { HeldCartsDialog, HoldDialog, ShortcutsDialog } from './pos/HeldCarts';
import ProductPane from './pos/ProductPane';
import UnitPicker from './pos/UnitPicker';
import { posScope, type InstallmentDraft } from './pos/posStorage';
import { useCartApproval } from './pos/useCartApproval';
import { useHeldCarts } from './pos/useHeldCarts';
import { POS_SHORTCUTS, inputIn, useEvent, usePosShortcuts } from './pos/usePosShortcuts';
import { saleError } from './saleShared';
import { usePosCart } from './usePosCart';

type OpenDialog =
  'units' | 'customer' | 'hold' | 'held' | 'keys' | 'pay' | 'terms' | 'downPay' | null;
export type SaleMode = 'cash' | 'installments';
/** Refusals the payment dialog shows itself; any other refusal goes back to the terms. */
const PAYMENT_CODES = new Set([
  'PAYMENT_TOTAL_MISMATCH',
  'INSUFFICIENT_STORE_CREDIT',
  'VAULT_INVALID',
  'CASH_ACCOUNT_INACTIVE',
]);

/**
 * S06 (D66): the cashier's screen. Products on one side (search, scanner, category chips, tiles),
 * the cart on the other (customer, lines, discounts, totals), and everything reachable from the
 * keyboard. The server prices every cart (S01), takes the payment lines (S02) and checks the
 * discounts (S03); the screen only shows what the quote and the sale answer.
 */
export default function PosPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const employeeId = useAuthStore((s) => s.user?.id);
  const current = useQuery({ queryKey: shiftKeys.current(orgId), queryFn: shiftsApi.current });
  const scope = posScope(orgId, employeeId);

  return (
    <PageContainer>
      <PageHeader title={t('sales.pos.title')} description={t('sales.pos.description')} />
      {current.data?.device_revoked ||
      (current.error instanceof ApiError && current.error.code === 'DEVICE_REVOKED') ? (
        <Notice tone="error">{t('cash.shifts.revoked')}</Notice>
      ) : current.isPending ? (
        <Skeleton className="h-40" />
      ) : current.isError ? (
        <ErrorState title={t('sales.errors.failed')} onRetry={() => void current.refetch()} />
      ) : !current.data ? (
        <Card>
          <div className="space-y-3">
            <Notice tone="info">{t('sales.pos.noShift')}</Notice>
            <Link to="/accounting/shifts" className="btn btn-primary">
              {t('sales.pos.noShiftAction')}
            </Link>
          </div>
        </Card>
      ) : (
        // Carts belong to one employee of one shop: another user starts from nothing.
        <Sell key={scope} shift={current.data} scope={scope} />
      )}
    </PageContainer>
  );
}

function Sell({ shift, scope }: { shift: Shift; scope: string }) {
  const cart = usePosCart(true, scope);
  const held = useHeldCarts(scope);
  const approval = useCartApproval(cart.key);
  const [params] = useSearchParams();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [unitsFor, setUnitsFor] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [revoked, setRevoked] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [customersOn, setCustomersOn] = useState(true);
  // N02 (D77): a sale on installments needs installment.create, the shop's switch and a policy.
  const orgId = useAuthStore((s) => s.orgId);
  const mayInstall = useCan('installment.create');
  const profile = useQuery({
    queryKey: ['shop-profile', orgId],
    queryFn: shopProfileApi.get,
    enabled: mayInstall,
    staleTime: 60_000,
  });
  const policy = useSettings().data?.installment_policy ?? null;
  const canInstall = mayInstall && customersOn && profile.data?.installments_enabled === true;
  const [mode, setMode] = useState<SaleMode>('cash');
  const installments = canInstall && mode === 'installments';
  const [plan, setPlan] = useState<InstallmentPlan | null>(null);
  const [planError, setPlanError] = useState('');
  /** EC-151: the terms typed so far (kept by Hold and by Back to the cart). */
  const [draft, setDraft] = useState<InstallmentDraft | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const discountRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // `?customer=<id>` names the sale's customer when the page opens (the customer's page links here).
  const customerParam = Uuid.safeParse(params.get('customer')).data ?? null;
  const takeCustomer = useEvent((id: string) => {
    if (id !== cart.customerId) cart.setCustomer({ id, name: null, phone: null });
  });
  useEffect(() => {
    if (customerParam) takeCustomer(customerParam);
  }, [customerParam, takeCustomer]);

  // The search box has the focus when the page opens and gets it back when a dialog closes; an
  // open approval panel takes it instead, so the cashier can ask with Enter.
  const done = cart.done !== null;
  const panelOpen = approval.open;
  useEffect(() => {
    if (dialog !== null || done) return;
    const id = setTimeout(() => {
      const target = panelOpen ? panelRef.current?.querySelector('button') : inputIn(searchRef);
      target?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [dialog, done, panelOpen]);

  const quote = cart.quote;
  const anyOver = cart.current && (quote?.lines.some((q) => q.quantity > q.available) ?? false);
  const canPay =
    !cart.busy && cart.current && !anyOver && cart.reasonOk && approval.status !== 'pending';
  const hasLines = cart.lines.length > 0;

  const addProduct = useEvent((product: Product) => {
    setError('');
    cart.addProduct(product);
  });
  const chooseUnits = useEvent((product: Product) => {
    setError('');
    setUnitsFor(product);
    setDialog('units');
  });
  const addUnit = useEvent((unit: UnitDetail) => {
    if (cart.lines.some((l) => l.unit_id === unit.id)) return false;
    setError('');
    cart.addUnits(
      { id: unit.product_id, name_ar: unit.name_ar, name_en: unit.name_en, sku: unit.sku },
      [unit],
    );
    return true;
  });

  function openPay() {
    if (!canPay) return;
    setError('');
    if (!installments) {
      setDialog('pay');
      return;
    }
    if (!cart.customerId) {
      setError(t('installments.pos.needCustomer'));
      setDialog('customer');
      return;
    }
    if (!policy) {
      setError(t('installments.errors.policyNotSet'));
      return;
    }
    setPlanError('');
    setDialog('terms');
  }
  /** N02: the terms are agreed; the down payment is taken next (none for 0.00). */
  function agree(next: InstallmentPlan) {
    setPlan(next);
    setPlanError('');
    if (compareMoney(next.down_payment, '0.00') > 0) setDialog('downPay');
    else void sellOnInstallments(next, undefined);
  }
  async function sellOnInstallments(
    agreed: InstallmentPlan,
    payments: SalePaymentInput[] | undefined,
  ): Promise<unknown> {
    const refused = await cart.confirmInstallment(agreed, payments);
    if (!refused) {
      setDialog(null);
      return null;
    }
    if (refused instanceof ApiError && refused.code === 'DEVICE_REVOKED') {
      setRevoked(true);
      setDialog(null);
      return null;
    }
    if (payments && refused instanceof ApiError && PAYMENT_CODES.has(refused.code)) {
      return refused;
    }
    // Changed prices, policy or customer checks: back to the terms, which ask the server again.
    setPlanError(installmentError(refused));
    setDialog('terms');
    return null;
  }
  /** Sells; an over-cap discount closes the payment and opens the approval panel instead. */
  async function pay(payments: SalePaymentInput[]): Promise<unknown> {
    const refused = await cart.confirm(payments, approval.approvedId ?? undefined);
    if (!refused) {
      setDialog(null);
      return null;
    }
    if (refused instanceof ApiError && refused.code === 'DEVICE_REVOKED') {
      setRevoked(true);
      setDialog(null);
      return null;
    }
    if (approval.refused(refused)) {
      setApprovalError('');
      setDialog(null);
      return null;
    }
    if (refused instanceof ApiError && refused.code === 'APPROVAL_INVALID') {
      approval.drop();
      setError(saleError(refused));
      setDialog(null);
      return null;
    }
    return refused;
  }
  async function ask() {
    if (!cart.request || approval.asking) return;
    setApprovalError('');
    const answer = await approval.request({
      branch_id: shift.branch_id,
      ...cart.request,
      reason: cart.reason.trim(),
    });
    if (answer === 'not_needed') setDialog('pay');
    else if (answer !== 'asked') setApprovalError(saleError(answer));
  }
  function startHold() {
    if (!hasLines || cart.busy) return;
    if (held.full) setError(t('sales.pos.hold.full'));
    else {
      setError('');
      setDialog('hold');
    }
  }
  function hold(note: string) {
    const terms = installments && draft ? { installment: draft } : {};
    if (held.hold({ ...cart.content, ...terms }, note)) {
      cart.reset();
      setPlan(null);
      setDraft(null);
    } else setError(t('sales.pos.hold.full'));
    setDialog(null);
  }
  function resume(id: string) {
    if (hasLines) return;
    const taken = held.take(id);
    if (taken) {
      setError('');
      cart.load({
        lines: taken.lines,
        customer: taken.customer,
        saleDiscount: taken.saleDiscount,
        reason: taken.reason,
      });
      // EC-151: the terms come back with the cart; the dialog checks them against today's policy.
      setPlan(null);
      setDraft(taken.installment ?? null);
      if (taken.installment && canInstall) setMode('installments');
    }
    setDialog(null);
  }

  usePosShortcuts(
    done || revoked
      ? {}
      : {
          [POS_SHORTCUTS.search]: () => inputIn(searchRef)?.focus(),
          [POS_SHORTCUTS.customer]: () => customersOn && setDialog('customer'),
          [POS_SHORTCUTS.discount]: () => inputIn(discountRef)?.focus(),
          [POS_SHORTCUTS.hold]: startHold,
          [POS_SHORTCUTS.held]: () => setDialog('held'),
          [POS_SHORTCUTS.pay]: openPay,
        },
    done
      ? {}
      : {
          onEscape: () => approval.open && approval.drop(),
          onType: () => inputIn(searchRef)?.focus(),
        },
  );

  if (revoked) return <Notice tone="error">{t('cash.shifts.revoked')}</Notice>;
  if (cart.done) {
    const startNew = () => {
      cart.reset();
      setPlan(null);
      setDraft(null);
    };
    return <DoneCard sale={cart.done} contract={cart.doneContract} onNew={startNew} />;
  }

  const close = () => setDialog(null);
  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-13rem)] lg:min-h-[30rem] lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <ProductPane
        shiftNumber={shift.number}
        branchId={shift.branch_id}
        searchRef={searchRef}
        onAddProduct={addProduct}
        onChooseUnits={chooseUnits}
        onAddUnit={addUnit}
      />
      <CartPane
        cart={cart}
        canPay={canPay}
        customersOn={customersOn}
        mode={installments ? 'installments' : 'cash'}
        {...(canInstall ? { onMode: setMode } : {})}
        heldCount={held.carts.length}
        error={error}
        approval={approval}
        approvalError={approvalError}
        panelRef={panelRef}
        discountRef={discountRef}
        onCustomer={() => setDialog('customer')}
        onModuleMissing={() => setCustomersOn(false)}
        onHold={startHold}
        onHeld={() => setDialog('held')}
        onPay={openPay}
        onAsk={() => void ask()}
        onHelp={() => setDialog('keys')}
      />

      {dialog === 'pay' && quote && (
        <PaymentDialog
          total={quote.total}
          customerId={cart.customerId}
          storeCreditBalance={quote.store_credit_balance}
          busy={cart.busy}
          onPay={pay}
          onClose={close}
        />
      )}
      {dialog === 'terms' && quote && cart.customer && policy && (
        <InstallmentDialog
          cashPrice={quote.total}
          customer={{ id: cart.customer.id, name: cart.customer.name }}
          policy={policy}
          initial={draft}
          onChange={setDraft}
          error={planError}
          busy={cart.busy}
          onContinue={agree}
          onClose={close}
        />
      )}
      {dialog === 'downPay' && plan && (
        <PaymentDialog
          purpose="downPayment"
          total={plan.down_payment}
          customerId={cart.customerId}
          storeCreditBalance={quote?.store_credit_balance ?? null}
          busy={cart.busy}
          onPay={(payments) => sellOnInstallments(plan, payments)}
          onClose={() => setDialog('terms')}
        />
      )}
      {dialog === 'units' && unitsFor && (
        <UnitPicker
          product={unitsFor}
          branchId={shift.branch_id}
          inCart={new Set(cart.lines.flatMap((l) => (l.unit_id ? [l.unit_id] : [])))}
          onAdd={(units) => {
            cart.addUnits(unitsFor, units);
            close();
          }}
          onClose={close}
        />
      )}
      {dialog === 'customer' && customersOn && (
        <CustomerPicker
          onPick={(customer) => {
            cart.setCustomer(customer);
            // The "choose a customer first" hint is answered now.
            if (error === t('installments.pos.needCustomer')) setError('');
            close();
          }}
          onClose={close}
          onModuleMissing={() => {
            setCustomersOn(false);
            close();
          }}
        />
      )}
      {dialog === 'hold' && <HoldDialog onHold={hold} onClose={close} />}
      {dialog === 'held' && (
        <HeldCartsDialog
          carts={held.carts}
          canResume={!hasLines}
          onResume={resume}
          onDelete={held.remove}
          onClose={close}
        />
      )}
      {dialog === 'keys' && <ShortcutsDialog onClose={close} />}
    </div>
  );
}

/** After the sale: the number, what was paid and the change. Enter starts the next cart. */
function DoneCard({
  sale,
  contract,
  onNew,
}: {
  sale: Sale;
  /** N02: the contract of an installment sale. */
  contract: Contract | null;
  onNew: () => void;
}) {
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setTimeout(() => actions.current?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <Card>
      <div className="space-y-3" role="status">
        <h2 className="type-section-title">{t('sales.pos.done.title', { number: sale.number })}</h2>
        <p className="type-body" data-testid="sale-paid">
          {t('sales.pos.done.total', { amount: formatMoney(sale.total) })}
        </p>
        <ul className="type-body space-y-1">
          {sale.payments.map((p) => (
            <li key={p.id}>
              {t(`sales.detail.methods.${p.method}`)}:{' '}
              <span className="num">{formatMoney(p.amount)}</span>
            </li>
          ))}
        </ul>
        {compareMoney(sale.change_total, '0.00') > 0 && (
          <p className="type-section-title" data-testid="sale-change">
            {t('sales.pos.done.change', { amount: formatMoney(sale.change_total) })}
          </p>
        )}
        {contract && (
          <div
            className="space-y-1 rounded-control border border-line p-3"
            data-testid="done-contract"
          >
            <p className="type-label">
              {t('installments.done.contract', { number: contract.number })}
            </p>
            <p className="type-body">
              {t('installments.done.price', { amount: formatMoney(contract.total_payable) })}
            </p>
            <p className="type-body">
              {t('installments.done.schedule', {
                count: formatNumber(contract.installments_count),
                first: formatBusinessDate(contract.first_due_date),
                last: formatBusinessDate(contract.last_due_date ?? contract.first_due_date),
              })}
            </p>
          </div>
        )}
        <div ref={actions} className="flex flex-wrap gap-2">
          <Button onClick={onNew}>{t('sales.pos.done.newSale')}</Button>
          <Link to={`/sales/${sale.id}`} className="btn btn-secondary">
            {t('sales.pos.done.view')}
          </Link>
          {contract && (
            <Link to={`/contracts/${contract.id}`} className="btn btn-secondary">
              {t('installments.done.view')}
            </Link>
          )}
          {/* N07 (D82): the printed contract and promissory notes of the installment sale. */}
          {contract && <PrintDocumentButtons contractId={contract.id} />}
          {/* S04 (D68): the first print is the original, every later one a copy. */}
          <PrintReceipt sale={sale} original {...(contract ? { contract } : {})} />
        </div>
      </div>
    </Card>
  );
}
