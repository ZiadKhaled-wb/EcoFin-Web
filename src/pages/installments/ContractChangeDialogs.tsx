import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  compareMoney,
  PositiveMoney,
  roundMoney,
  subtractMoney,
  WaiverTooHighDetail,
  type Contract,
  type InstallmentFrequency,
  type Money,
  type SalePaymentInput,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import DateInput from '@/components/ui/DateInput';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Textarea from '@/components/ui/Textarea';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { contractChangeKeys, contractChangesApi } from '@/services/contractChangesApi';
import { collectionKeys } from '@/services/collectionsApi';
import { installmentKeys } from '@/services/installmentsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import PaymentDialog from '../sales/PaymentDialog';

const ZERO: Money = '0.00';
/** A typed amount as money, or null; empty is 0 (no waiver). */
const amountOf = (v: string): Money | null => {
  if (v.trim() === '') return ZERO;
  const parsed = PositiveMoney.safeParse(v);
  return parsed.success ? roundMoney(parsed.data) : v.trim() === '0' ? ZERO : null;
};

/** One key per thing sent: a double click or a retry is the same change; a new amount is new. */
function useKeys() {
  const [keys] = useState(() => new Map<string, string>());
  return (content: string) => {
    if (!keys.has(content)) keys.set(content, crypto.randomUUID());
    return keys.get(content)!;
  };
}

function useRefreshContract(contractId: string) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  return () => {
    void cache.invalidateQueries({ queryKey: installmentKeys.contract(orgId, contractId) });
    void cache.invalidateQueries({ queryKey: contractChangeKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: collectionKeys.all(orgId) });
  };
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-caption">{label}</dt>
      <dd className="num" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Early settlement

/**
 * N05 (D80): the customer pays everything left today. The quote shows the payoff and the policy's
 * suggested waiver, only a suggestion (Islamic finance rule 6): the manager decides the waiver
 * (up to the profit of the installments not yet due) and gives a reason for it. The payment is
 * N03's: S02's dialog with cash and bank transfers; the receipt follows.
 */
export function SettleDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const refresh = useRefreshContract(contract.id);
  const keyOf = useKeys();
  const quote = useQuery({
    queryKey: contractChangeKeys.quote(orgId, contract.id),
    queryFn: () => contractChangesApi.quote(contract.id),
    retry: false,
  });
  const [waiverText, setWaiverText] = useState('');
  const [reason, setReason] = useState('');
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const q = quote.data;
  const waiver = amountOf(waiverText);
  const tooHigh = !!q && waiver !== null && compareMoney(waiver, q.max_waiver) > 0;
  const needsReason = waiver !== null && compareMoney(waiver, ZERO) > 0;
  const reasonOk = !needsReason || reason.trim().length >= 3;
  const valid = !!q && waiver !== null && !tooHigh && reasonOk;
  const toPay = q && waiver !== null && !tooHigh ? subtractMoney(q.remaining, waiver) : null;

  async function settle(payments: SalePaymentInput[]) {
    if (!q || waiver === null) return null;
    const body = {
      waiver,
      ...(needsReason ? { reason: reason.trim() } : {}),
      expected_remaining: q.remaining,
      payments: payments.filter((p) => p.method !== 'store_credit'),
    };
    setBusy(true);
    try {
      const done = await contractChangesApi.settle(contract.id, body, keyOf(JSON.stringify(body)));
      refresh();
      navigate(`/collections/${done.collection.id}`);
      return null;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'WAIVER_TOO_HIGH' || code === 'COLLECTION_DUE_CHANGED') {
        setPaying(false);
        const detail = WaiverTooHighDetail.safeParse(err instanceof ApiError ? err.details : null);
        setNotice(
          code === 'WAIVER_TOO_HIGH' && detail.success
            ? t('contractChanges.settle.errors.waiverTooHigh', {
                max: formatMoney(detail.data.max_waiver),
              })
            : t('contractChanges.errors.dueChanged'),
        );
        void quote.refetch();
        return null;
      }
      if (code === 'CONTRACT_NOT_OPEN') {
        setPaying(false);
        setNotice(t('contractChanges.errors.notOpen'));
        refresh();
        return null;
      }
      return err;
    } finally {
      setBusy(false);
    }
  }

  if (paying && toPay) {
    return (
      <PaymentDialog
        total={toPay}
        customerId={null}
        storeCreditBalance={null}
        busy={busy}
        purpose="collection"
        onPay={settle}
        onClose={() => setPaying(false)}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('contractChanges.settle.title', { number: contract.number })}
      description={t('contractChanges.settle.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('contractChanges.cancel')}
          </Button>
          <Button disabled={!valid} onClick={() => setPaying(true)}>
            {t('contractChanges.settle.toPayment')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {notice && <Notice tone="error">{notice}</Notice>}
        {quote.isPending && <Skeleton className="h-24" />}
        {quote.isError && <Notice tone="error">{t('contractChanges.settle.quoteFailed')}</Notice>}
        {q && (
          <>
            <dl className="space-y-1">
              <Row
                label={t('contractChanges.settle.payoff')}
                value={formatMoney(q.remaining)}
                testId="settle-payoff"
              />
              <Row
                label={t('contractChanges.settle.principalLeft')}
                value={formatMoney(q.principal_left)}
              />
              <Row
                label={t('contractChanges.settle.profitLeft')}
                value={formatMoney(q.profit_left)}
              />
              <Row
                label={t('contractChanges.settle.futureProfit')}
                value={formatMoney(q.future_profit)}
              />
            </dl>
            <Notice tone="info">
              {t('contractChanges.settle.suggestion', {
                amount: formatMoney(q.suggested_waiver),
              })}
            </Notice>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <MoneyInput
                  label={t('contractChanges.settle.waiver')}
                  value={waiverText}
                  onValueChange={setWaiverText}
                  help={t('contractChanges.settle.max', { amount: formatMoney(q.max_waiver) })}
                  {...(tooHigh
                    ? {
                        error: t('contractChanges.settle.errors.waiverTooHigh', {
                          max: formatMoney(q.max_waiver),
                        }),
                      }
                    : {})}
                />
              </div>
              {compareMoney(q.suggested_waiver, ZERO) > 0 && (
                <Button variant="ghost" onClick={() => setWaiverText(q.suggested_waiver)}>
                  {t('contractChanges.settle.useSuggestion')}
                </Button>
              )}
            </div>
            {needsReason && (
              <Textarea
                label={t('contractChanges.settle.reason')}
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            {toPay && (
              <dl>
                <Row
                  label={t('contractChanges.settle.toPay')}
                  value={formatMoney(toPay)}
                  testId="settle-to-pay"
                />
              </dl>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Rescheduling

/** The rules a reschedule can break (N01's others don't apply to it). */
const RESCHEDULE_RULE_LIST = [
  'frequency_not_allowed',
  'first_due_date_out_of_range',
  'rounding',
] as const;
type RescheduleRule = (typeof RESCHEDULE_RULE_LIST)[number];
const RESCHEDULE_RULES = new Set<string>(RESCHEDULE_RULE_LIST);

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * N05 (D80): what is left spread over a new schedule. The total never grows (Islamic finance rule
 * 5): the preview shows the new installments adding up to exactly what is left. The old schedule
 * stays on the contract, superseded.
 */
export function RescheduleDialog({
  contract,
  onClose,
}: {
  contract: Contract;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const refresh = useRefreshContract(contract.id);
  const keyOf = useKeys();
  const dateId = useId();
  const [count, setCount] = useState('');
  const [frequency, setFrequency] = useState<InstallmentFrequency>(contract.frequency);
  const [firstDue, setFirstDue] = useState(inDays(30));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const n = Number(count);
  const planOk = Number.isInteger(n) && n >= 1 && n <= 520 && /^\d{4}-\d{2}-\d{2}$/.test(firstDue);
  const plan = { installments_count: n, frequency, first_due_date: firstDue };
  const preview = useQuery({
    queryKey: contractChangeKeys.preview(orgId, contract.id, JSON.stringify(plan)),
    queryFn: () => contractChangesApi.previewReschedule(contract.id, plan),
    enabled: planOk,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const p = planOk ? preview.data : undefined;
  const valid = !!p && p.violations.length === 0 && p.lines.length > 0 && reason.trim().length >= 3;

  async function reschedule() {
    if (!p || !valid || busy) return;
    const body = { ...plan, reason: reason.trim(), expected_remaining: p.remaining };
    setBusy(true);
    setError('');
    try {
      await contractChangesApi.reschedule(contract.id, body, keyOf(JSON.stringify(body)));
      refresh();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(
        code === 'COLLECTION_DUE_CHANGED'
          ? t('contractChanges.errors.dueChanged')
          : code === 'CONTRACT_NOT_OPEN'
            ? t('contractChanges.errors.notOpen')
            : code === 'INSTALLMENT_TERMS_INVALID'
              ? t('contractChanges.reschedule.errors.invalid')
              : t('contractChanges.errors.failed'),
      );
      if (code === 'COLLECTION_DUE_CHANGED') void preview.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('contractChanges.reschedule.title', { number: contract.number })}
      description={t('contractChanges.reschedule.description')}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('contractChanges.cancel')}
          </Button>
          <Button loading={busy} disabled={!valid || busy} onClick={() => void reschedule()}>
            {t('contractChanges.reschedule.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberInput
            label={t('contractChanges.reschedule.count')}
            value={count}
            onValueChange={setCount}
            decimals={0}
          />
          <Select
            label={t('installments.fields.frequency')}
            options={(['monthly', 'weekly'] as const).map((f) => ({
              value: f,
              label: t(`installments.frequency.${f}`),
            }))}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as InstallmentFrequency)}
          />
          <div>
            <label className="field-label" htmlFor={dateId}>
              {t('installments.fields.firstDue')}
            </label>
            <DateInput id={dateId} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
        </div>
        {planOk && preview.isPending && <Skeleton className="h-24" />}
        {planOk && preview.isError && (
          <Notice tone="error">{t('contractChanges.reschedule.previewFailed')}</Notice>
        )}
        {p && p.violations.length > 0 && (
          <Notice tone="error">
            {p.violations
              .map((v) =>
                RESCHEDULE_RULES.has(v.rule)
                  ? t(`contractChanges.reschedule.violations.${v.rule as RescheduleRule}`)
                  : t('contractChanges.reschedule.errors.invalid'),
              )
              .join(' ')}
          </Notice>
        )}
        {p && p.violations.length === 0 && (
          <>
            <Notice tone="info">
              {t('contractChanges.reschedule.totalSame', { amount: formatMoney(p.remaining) })}
            </Notice>
            <div className="max-h-64 overflow-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('contractChanges.reschedule.caption')}</caption>
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className="type-label px-3 py-2 text-start">
                      {t('installments.schedule.seq')}
                    </th>
                    <th className="type-label px-3 py-2 text-start">
                      {t('installments.schedule.due')}
                    </th>
                    <th className="type-label px-3 py-2 text-end">
                      {t('installments.schedule.amount')}
                    </th>
                    <th className="type-label px-3 py-2 text-end">
                      {t('installments.schedule.profit')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.lines.map((l) => (
                    <tr key={l.seq} className="border-b border-line">
                      <td className="type-body px-3 py-2 text-end">{formatNumber(l.seq)}</td>
                      <td className="type-body px-3 py-2">{formatBusinessDate(l.due_date)}</td>
                      <td className="type-body whitespace-nowrap px-3 py-2 text-end">
                        {formatMoney(l.amount)}
                      </td>
                      <td className="type-body whitespace-nowrap px-3 py-2 text-end">
                        {formatMoney(l.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Textarea
          label={t('contractChanges.reschedule.reason')}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Write-off (the owner)

/** N05 (D80): the owner marks what is left as lost. It can't be undone. */
export function WriteOffDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const refresh = useRefreshContract(contract.id);
  const keyOf = useKeys();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = reason.trim().length >= 3;
  const left = contract.balance.remaining;

  async function writeOff() {
    if (!ok || busy) return;
    const body = { reason: reason.trim(), expected_remaining: left };
    setBusy(true);
    setError('');
    try {
      await contractChangesApi.writeOff(contract.id, body, keyOf(JSON.stringify(body)));
      refresh();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(
        code === 'COLLECTION_DUE_CHANGED'
          ? t('contractChanges.errors.dueChanged')
          : code === 'CONTRACT_NOT_OPEN'
            ? t('contractChanges.errors.notOpen')
            : code === 'PERMISSION_DENIED'
              ? t('contractChanges.writeOff.errors.ownerOnly')
              : t('contractChanges.errors.failed'),
      );
      if (code === 'COLLECTION_DUE_CHANGED') refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('contractChanges.writeOff.title', { number: contract.number })}
      description={t('contractChanges.writeOff.description')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('contractChanges.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ok || busy}
            onClick={() => void writeOff()}
          >
            {t('contractChanges.writeOff.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl>
          <Row
            label={t('contractChanges.writeOff.amount')}
            value={formatMoney(left)}
            testId="write-off-amount"
          />
        </dl>
        <Notice tone="error">{t('contractChanges.writeOff.final')}</Notice>
        <Textarea
          label={t('contractChanges.writeOff.reason')}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
