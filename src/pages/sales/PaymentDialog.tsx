import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PositiveMoney,
  SALE_MAX_BANK_TRANSFERS,
  compareMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  type Money,
  type SalePaymentInput,
  type SalePaymentMethod,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import { formatMoney } from '@/lib/format';
import { saleKeys, salesApi } from '@/services/salesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { saleError } from './saleShared';

/** One payment line as the cashier edits it (typed text). */
interface PayLine {
  id: string;
  method: SalePaymentMethod;
  amount: string;
  /** Cash only: what the customer handed over; empty = exactly the amount. */
  tendered: string;
  /** Bank transfer only. */
  account: string;
  reference: string;
}

const ZERO: Money = '0.00';
const positive = (v: string): Money | null => {
  const parsed = PositiveMoney.safeParse(v);
  return parsed.success ? roundMoney(parsed.data) : null;
};
const newLine = (method: SalePaymentMethod, amount: string): PayLine => ({
  id: crypto.randomUUID(),
  method,
  amount,
  tendered: '',
  account: '',
  reference: '',
});

/** The change to give back for a cash line: received - amount (null without a received amount). */
function changeOf(line: PayLine): Money | null {
  const amount = positive(line.amount);
  const tendered = positive(line.tendered);
  if (!amount || !tendered || compareMoney(tendered, amount) < 0) return null;
  return subtractMoney(tendered, amount);
}

/** The payment lines the screen holds, as the server takes them; null while one is not valid yet. */
function toPayments(lines: readonly PayLine[]): SalePaymentInput[] | null {
  const out: SalePaymentInput[] = [];
  for (const l of lines) {
    const amount = positive(l.amount);
    if (!amount) return null;
    if (l.method === 'cash') {
      const tendered = positive(l.tendered);
      if (l.tendered !== '' && (!tendered || compareMoney(tendered, amount) < 0)) return null;
      out.push({ method: 'cash', amount, ...(tendered ? { tendered } : {}) });
    } else if (l.method === 'bank_transfer') {
      const reference = l.reference.trim();
      if (!l.account || reference === '') return null;
      out.push({ method: 'bank_transfer', amount, cash_account_id: l.account, reference });
    } else {
      out.push({ method: 'store_credit', amount });
    }
  }
  return out;
}

/**
 * S02: how the sale is paid. The first line is cash for the whole total; the cashier changes the
 * amounts, adds a bank transfer (account and reference) or the customer's store credit, and Pay
 * opens only when what is paid equals the total. The server checks everything again.
 */
export default function PaymentDialog({
  total,
  customerId,
  storeCreditBalance,
  busy,
  onPay,
  onClose,
}: {
  total: Money;
  customerId: string | null;
  storeCreditBalance: Money | null;
  busy: boolean;
  /** Sells with these lines; answers the error of a refused sale, or null. */
  onPay: (payments: SalePaymentInput[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const [lines, setLines] = useState<PayLine[]>(() => [newLine('cash', total)]);
  const [error, setError] = useState('');
  const accounts = useQuery({
    queryKey: saleKeys.accounts(orgId),
    queryFn: salesApi.paymentAccounts,
  });

  const paid = sumMoney(lines.map((l) => positive(l.amount) ?? ZERO));
  const remaining = subtractMoney(total, paid);
  const settled = compareMoney(remaining, ZERO) === 0;
  const payments = toPayments(lines);

  const has = (method: SalePaymentMethod) => lines.some((l) => l.method === method);
  const banks = lines.filter((l) => l.method === 'bank_transfer').length;
  const canCredit =
    customerId !== null &&
    storeCreditBalance !== null &&
    compareMoney(storeCreditBalance, ZERO) > 0 &&
    !has('store_credit');

  const update = (id: string, patch: Partial<PayLine>) =>
    setLines((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = (method: SalePaymentMethod) =>
    setLines((list) => [
      ...list,
      newLine(method, compareMoney(remaining, ZERO) > 0 ? remaining : ''),
    ]);
  const remove = (id: string) => setLines((list) => list.filter((l) => l.id !== id));

  async function pay() {
    if (!payments || !settled || busy) return;
    setError('');
    const refused = await onPay(payments);
    if (refused) setError(saleError(refused));
  }

  const options = (accounts.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }));

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('sales.pay.title')}
      description={t('sales.pay.description')}
      className="max-w-3xl!"
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('sales.pay.cancel')}
          </Button>
          <Button
            type="button"
            loading={busy}
            disabled={busy || !settled || payments === null || lines.length === 0}
            onClick={() => void pay()}
          >
            {t('sales.pay.pay')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-3" aria-live="polite">
          <div>
            <dt className="type-caption">{t('sales.pay.total')}</dt>
            <dd className="num type-section-title" data-testid="pay-total">
              {formatMoney(total)}
            </dd>
          </div>
          <div>
            <dt className="type-caption">{t('sales.pay.paid')}</dt>
            <dd className="num type-section-title" data-testid="pay-paid">
              {formatMoney(paid)}
            </dd>
          </div>
          <div>
            <dt className="type-caption">{t('sales.pay.remaining')}</dt>
            <dd
              className={`num type-section-title ${settled ? '' : 'text-danger-700'}`}
              data-testid="pay-remaining"
            >
              {formatMoney(remaining)}
            </dd>
          </div>
        </dl>

        <ul className="space-y-3">
          {lines.map((l) => {
            const tendered = positive(l.tendered);
            const amount = positive(l.amount);
            const short =
              l.method === 'cash' &&
              l.tendered !== '' &&
              amount !== null &&
              (!tendered || compareMoney(tendered, amount) < 0);
            const lineChange = l.method === 'cash' ? changeOf(l) : null;
            return (
              <li key={l.id} className="rounded-card border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="type-label">{t(`sales.detail.methods.${l.method}`)}</span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={t('sales.pay.removeLine', {
                        method: t(`sales.detail.methods.${l.method}`),
                      })}
                      onClick={() => remove(l.id)}
                    >
                      {t('sales.pay.remove')}
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MoneyInput
                    label={t('sales.pay.amountOf', {
                      method: t(`sales.detail.methods.${l.method}`),
                    })}
                    value={l.amount}
                    onValueChange={(v) => update(l.id, { amount: v })}
                  />
                  {l.method === 'cash' && (
                    <MoneyInput
                      label={t('sales.pay.received')}
                      value={l.tendered}
                      onValueChange={(v) => update(l.id, { tendered: v })}
                      {...(short ? { error: t('sales.pay.receivedShort') } : {})}
                    />
                  )}
                  {l.method === 'bank_transfer' && (
                    <>
                      <Select
                        label={t('sales.pay.account')}
                        value={l.account}
                        placeholder={t('sales.pay.accountPlaceholder')}
                        options={options}
                        onChange={(e) => update(l.id, { account: e.target.value })}
                      />
                      <div className="sm:col-span-2">
                        <label className="field-label" htmlFor={`ref-${l.id}`}>
                          {t('sales.pay.reference')}
                        </label>
                        <Input
                          id={`ref-${l.id}`}
                          value={l.reference}
                          maxLength={100}
                          ltr
                          onChange={(e) => update(l.id, { reference: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>
                {l.method === 'cash' && lineChange !== null && (
                  <p className="type-body mt-2" data-testid="pay-change">
                    {t('sales.pay.change', { amount: formatMoney(lineChange) })}
                  </p>
                )}
                {l.method === 'bank_transfer' && accounts.isSuccess && options.length === 0 && (
                  <Notice tone="info">{t('sales.pay.noAccounts')}</Notice>
                )}
                {l.method === 'store_credit' && storeCreditBalance !== null && (
                  <p className="type-caption mt-2">
                    {t('sales.pay.creditBalance', { amount: formatMoney(storeCreditBalance) })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={has('cash') || busy}
            onClick={() => add('cash')}
          >
            {t('sales.pay.addCash')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={banks >= SALE_MAX_BANK_TRANSFERS || busy}
            onClick={() => add('bank_transfer')}
          >
            {t('sales.pay.addTransfer')}
          </Button>
          {canCredit && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => add('store_credit')}
            >
              {t('sales.pay.addCredit')}
            </Button>
          )}
        </div>
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
