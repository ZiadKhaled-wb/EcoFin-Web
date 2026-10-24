import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PositiveMoney,
  SalePayments,
  compareMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  type CancelSalesOrderBody,
  type Money,
  type SalePaymentMethod,
  type SalesOrder,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { formatMoney } from '@/lib/format';
import { t } from '@/i18n';
import { saleKeys, salesApi } from '@/services/salesApi';
import { useAuthStore } from '@/store/authStore';
import { salesOrderErrorMessage } from './salesOrderRules';

type Refund = CancelSalesOrderBody['refund'][number];
interface RefundLine {
  id: string;
  method: SalePaymentMethod;
  amount: string;
  account: string;
  reference: string;
}

const ZERO: Money = '0.00';
const METHODS = ['cash', 'bank_transfer', 'store_credit'] as const;
/** The contract takes at most five refund lines. */
const MAX_LINES = 5;
/** The server allows one cash, one store-credit and three bank-transfer lines (S02). */
const METHOD_LIMIT: Record<SalePaymentMethod, number> = {
  cash: 1,
  store_credit: 1,
  bank_transfer: 3,
};
const ADD_ORDER = ['cash', 'store_credit', 'bank_transfer'] as const;
const REASON_MIN = 3;
const REASON_MAX = 500;
const positive = (v: string): Money | null => {
  const parsed = PositiveMoney.safeParse(v);
  return parsed.success ? roundMoney(parsed.data) : null;
};
const newLine = (method: SalePaymentMethod, amount: string): RefundLine => ({
  id: crypto.randomUUID(),
  method,
  amount,
  account: '',
  reference: '',
});

const isCashBank = (m: SalePaymentMethod) => m === 'cash' || m === 'bank_transfer';

/**
 * Net deposits paid in cash or by bank transfer: the most the cash + bank refund lines may give back.
 * A store-credit deposit goes back only as store credit (REFUND_METHOD_NOT_ALLOWED on the server).
 */
function cashBankDeposits(order: SalesOrder): Money {
  const total = (direction: 'in' | 'out') =>
    sumMoney(
      order.payments
        .filter((p) => p.direction === direction && isCashBank(p.method))
        .map((p) => p.amount),
    );
  const net = subtractMoney(total('in'), total('out'));
  return compareMoney(net, ZERO) > 0 ? net : ZERO;
}

/** The opening refund lines: cash for what was paid in cash or by bank, store credit for the rest. */
function prefill(deposits: Money, cashBank: Money): RefundLine[] {
  const cash = compareMoney(cashBank, deposits) < 0 ? cashBank : deposits;
  const credit = subtractMoney(deposits, cash);
  return [
    ...(compareMoney(cash, ZERO) > 0 ? [newLine('cash', cash)] : []),
    ...(compareMoney(credit, ZERO) > 0 ? [newLine('store_credit', credit)] : []),
  ];
}

/** The refund lines as the server takes them; null while one is not valid yet. */
function toRefund(lines: readonly RefundLine[]): Refund[] | null {
  const out: Refund[] = [];
  for (const l of lines) {
    const amount = positive(l.amount);
    if (!amount) return null;
    if (l.method === 'bank_transfer') {
      const reference = l.reference.trim();
      if (!l.account || reference === '') return null;
      out.push({ method: 'bank_transfer', amount, cash_account_id: l.account, reference });
    } else out.push({ method: l.method, amount });
  }
  return out;
}

/**
 * S10 "Cancel order" (`order.cancel`, Decision 9): a reason, and refund lines that give the net
 * deposits back. They open as one cash line for the cash and bank deposits (plus a store-credit line
 * for any store-credit deposits); the cashier splits them over cash, bank transfers and store credit,
 * and Confirm opens only when they sum exactly to the deposits (decimal compare) and the cash + bank
 * lines stay within the cash and bank deposits. Without deposits there are no refund lines.
 */
export default function CancelOrderDialog({
  order,
  busy,
  onCancel,
  onClose,
}: {
  order: SalesOrder;
  busy: boolean;
  /** Cancels with this body; answers the error of a refusal, or null. */
  onCancel: (body: CancelSalesOrderBody) => Promise<unknown>;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const deposits = order.balances.deposits_paid;
  const hasDeposits = compareMoney(deposits, ZERO) > 0;
  const cashBankMax = cashBankDeposits(order);
  const creditOnly = subtractMoney(deposits, cashBankMax);
  const hasCreditDeposits = compareMoney(creditOnly, ZERO) > 0;
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<RefundLine[]>(() =>
    hasDeposits ? prefill(deposits, cashBankMax) : [],
  );
  const [error, setError] = useState('');
  const accounts = useQuery({
    queryKey: saleKeys.accounts(orgId),
    queryFn: salesApi.paymentAccounts,
    enabled: hasDeposits,
  });
  const options = (accounts.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }));

  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;
  const refund = toRefund(lines);
  const refunded = sumMoney(lines.map((l) => positive(l.amount) ?? ZERO));
  const balanced = compareMoney(refunded, deposits) === 0;
  const cashBankRefund = sumMoney(
    lines.filter((l) => isCashBank(l.method)).map((l) => positive(l.amount) ?? ZERO),
  );
  const methodsOk = compareMoney(cashBankRefund, cashBankMax) <= 0;
  const accepted =
    refund !== null && (refund.length === 0 || SalePayments.safeParse(refund).success);
  const ready = reasonOk && accepted && balanced && methodsOk;
  // The next refund line takes a method that is still allowed; none left disables adding.
  const nextMethod = ADD_ORDER.find(
    (m) => lines.filter((l) => l.method === m).length < METHOD_LIMIT[m],
  );

  const update = (id: string, patch: Partial<RefundLine>) =>
    setLines((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function submit() {
    if (!ready || !refund || busy) return;
    setError('');
    const refused = await onCancel({ reason: trimmed, refund });
    if (refused) setError(salesOrderErrorMessage(refused));
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('salesOrders.cancel.title')}
      description={t(
        hasDeposits ? 'salesOrders.cancel.description' : 'salesOrders.cancel.noDeposits',
      )}
      className="max-w-3xl!"
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('salesOrders.actions.close')}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={busy}
            disabled={busy || !ready}
            onClick={() => void submit()}
          >
            {t('salesOrders.cancel.submit')}
          </Button>
        </>
      }
    >
      <div className="sales-order-cancel">
        <Textarea
          label={t('salesOrders.cancel.reason')}
          value={reason}
          maxLength={REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          {...(reason !== '' && !reasonOk ? { error: t('salesOrders.cancel.reasonLength') } : {})}
        />
        {hasDeposits && (
          <>
            <dl className="sales-order-facts" aria-live="polite">
              <div>
                <dt>{t('salesOrders.cancel.deposits')}</dt>
                <dd data-testid="cancel-deposits">{formatMoney(deposits)}</dd>
              </div>
              <div>
                <dt>{t('salesOrders.cancel.refunded')}</dt>
                <dd data-testid="cancel-refunded">{formatMoney(refunded)}</dd>
              </div>
            </dl>
            {hasCreditDeposits && (
              <p data-testid="cancel-method-rule">
                {t('salesOrders.cancel.methodRule', {
                  credit: formatMoney(creditOnly),
                  max: formatMoney(cashBankMax),
                })}
              </p>
            )}
            {!balanced && (
              <p role="status">
                {t('salesOrders.cancel.mismatch', {
                  deposits: formatMoney(deposits),
                  refund: formatMoney(refunded),
                })}
              </p>
            )}
            {!methodsOk && (
              <p role="status">
                {t('salesOrders.cancel.methodExceeded', {
                  refund: formatMoney(cashBankRefund),
                  max: formatMoney(cashBankMax),
                })}
              </p>
            )}
            <ul className="sales-order-refunds">
              {lines.map((l, i) => {
                const no = i + 1;
                return (
                  <li key={l.id} role="group" aria-label={t('salesOrders.cancel.line', { no })}>
                    <Select
                      label={t('salesOrders.cancel.method', { no })}
                      value={l.method}
                      options={METHODS.map((m) => ({
                        value: m,
                        label: t(`salesOrders.payments.methods.${m}`),
                      }))}
                      onChange={(e) =>
                        update(l.id, { method: e.target.value as SalePaymentMethod })
                      }
                    />
                    <MoneyInput
                      label={t('salesOrders.cancel.amount', { no })}
                      value={l.amount}
                      onValueChange={(v) => update(l.id, { amount: v })}
                    />
                    {l.method === 'bank_transfer' && (
                      <>
                        <Select
                          label={t('salesOrders.cancel.account', { no })}
                          value={l.account}
                          placeholder={t('sales.pay.accountPlaceholder')}
                          options={options}
                          onChange={(e) => update(l.id, { account: e.target.value })}
                        />
                        <Input
                          aria-label={t('salesOrders.cancel.reference', { no })}
                          placeholder={t('salesOrders.cancel.reference', { no })}
                          value={l.reference}
                          maxLength={100}
                          ltr
                          onChange={(e) => update(l.id, { reference: e.target.value })}
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('salesOrders.cancel.removeLine', { no })}
                      onClick={() => setLines((list) => list.filter((x) => x.id !== l.id))}
                    >
                      {t('salesOrders.cancel.remove')}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || lines.length >= MAX_LINES || !nextMethod}
              onClick={() => nextMethod && setLines((list) => [...list, newLine(nextMethod, '')])}
            >
              {t('salesOrders.cancel.addLine')}
            </Button>
          </>
        )}
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
