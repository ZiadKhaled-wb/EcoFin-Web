import { useEffect, useId, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  InstallmentPreviewBody,
  MAX_INSTALLMENTS,
  computeInstallmentTerms,
  compareMoney,
  roundMoney,
  type InstallmentFrequency,
  type InstallmentPolicy,
  type InstallmentPreview,
  type InstallmentTerms,
  type InstallmentTermsInput,
} from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import DateInput from '@/components/ui/DateInput';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { guarantorKeys, guarantorsApi } from '@/services/guarantorsApi';
import { installmentKeys, installmentsApi } from '@/services/installmentsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import AddGuarantorDialog from '../../customers/AddGuarantorDialog';
import CreditExceptionDialog from '../../customers/CreditExceptionDialog';
import { relationLabel } from '../../customers/guarantorShared';
import { installmentError, shopToday, violationText } from '../../installments/installmentShared';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const PREVIEW_DELAY_MS = 300;

/** What the cashier agreed on, to be sold: the terms of the preview and the customer's checks. */
export interface InstallmentPlan {
  down_payment: string;
  installments_count: number;
  frequency: InstallmentFrequency;
  first_due_date?: string;
  policy_version: number;
  guarantor_ids: string[];
  credit_approval_id?: string;
  /** The server's preview the cashier saw (the receipt and the done card show it). */
  terms: InstallmentTerms;
}

/** The engine's input from the typed fields; null while one is not valid yet. */
function inputOf(
  cashPrice: string,
  down: string,
  count: string,
  frequency: InstallmentFrequency,
  firstDue: string,
): InstallmentTermsInput | null {
  const n = Number(count);
  if (!MONEY.test(down) || !Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) return null;
  return {
    cash_price: cashPrice,
    // "0", "0.0" and "0.00" are the same terms (the field reformats on blur): one preview.
    down_payment: roundMoney(down),
    installments_count: n,
    frequency,
    ...(firstDue ? { first_due_date: firstDue } : {}),
  };
}

/**
 * N02 (D77): the terms of an installment sale of the cart, for the chosen customer. The numbers
 * appear as the cashier types (the contracts' copy of the engine, with the shop's policy), then the
 * server's preview replaces them and adds the customer's credit, guarantor and survey checks.
 * Continue opens only when the server says the sale can be confirmed. The installment price is the
 * cash price plus the profit for the whole term (docs/ISLAMIC_FINANCE_RULES.md).
 */
export default function InstallmentDialog({
  cashPrice,
  customer,
  policy,
  initial,
  error,
  busy,
  onContinue,
  onClose,
}: {
  /** The cart's total from the quote: the cash price of the sale. */
  cashPrice: string;
  customer: { id: string; name: string | null };
  /** The shop's current policy (any employee reads the settings). */
  policy: InstallmentPolicy;
  /** The plan the cashier had chosen, when the dialog opens again after a refused sale. */
  initial: InstallmentPlan | null;
  /** Why the last attempt was refused. */
  error: string;
  busy: boolean;
  onContinue: (plan: InstallmentPlan) => void;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const dateId = useId();
  const [today] = useState(() => shopToday());
  const [frequency, setFrequency] = useState<InstallmentFrequency>(
    initial?.frequency ?? policy.allowed_frequencies[0] ?? 'monthly',
  );
  const [count, setCount] = useState(
    String(initial?.installments_count ?? Math.min(12, policy.max_months)),
  );
  const [firstDue, setFirstDue] = useState(initial?.first_due_date ?? '');
  // The down payment starts at the smallest the policy allows for these terms.
  const [down, setDown] = useState(() => {
    if (initial) return initial.down_payment;
    const input = inputOf(cashPrice, '0.00', count, frequency, '');
    return (input && computeInstallmentTerms(policy, input, today).min_down_payment) ?? '0.00';
  });
  const [picked, setPicked] = useState<string[]>(initial?.guarantor_ids ?? []);
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState(false);

  const input = inputOf(cashPrice, down, count, frequency, firstDue);
  const live = input ? computeInstallmentTerms(policy, input, today) : null;

  // The server's preview follows the fields a moment after the last change.
  const wanted = input
    ? JSON.stringify({ ...input, customer_id: customer.id, guarantor_ids: picked })
    : '';
  const [asked, setAsked] = useState(wanted);
  useEffect(() => {
    const id = setTimeout(() => setAsked(wanted), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [wanted]);
  const preview = useQuery({
    queryKey: installmentKeys.preview(orgId, asked),
    queryFn: () => installmentsApi.preview(InstallmentPreviewBody.parse(JSON.parse(asked))),
    enabled: asked !== '',
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const current = asked === wanted && wanted !== '' && preview.isSuccess && !preview.isFetching;
  const server: InstallmentPreview | undefined = current ? preview.data : undefined;
  const terms = server?.terms ?? live;
  const checks = server?.customer ?? null;

  const guarantors = useQuery({
    queryKey: guarantorKeys.ofCustomer(orgId, customer.id),
    queryFn: () => guarantorsApi.ofCustomer(customer.id),
  });
  const linked = (guarantors.data ?? []).filter((g) => g.archived_at === null);
  const toggle = (id: string, on: boolean) =>
    setPicked((list) => (on ? [...list, id].slice(0, 3) : list.filter((g) => g !== id)));

  const credit = checks?.credit;
  // The server answers allowed + approved_approval_id when an approved exception covers the amount:
  // the sale must carry that id, or the server raises CREDIT_LIMIT_EXCEEDED (EC-148).
  const approvalId = credit?.approved_approval_id ?? undefined;
  const canContinue = !!server?.can_confirm && !busy && input !== null;

  function next() {
    if (!canContinue || !server || !input) return;
    onContinue({
      down_payment: input.down_payment,
      installments_count: input.installments_count,
      frequency: input.frequency,
      ...(input.first_due_date ? { first_due_date: input.first_due_date } : {}),
      policy_version: server.terms.policy_version,
      guarantor_ids: picked,
      ...(approvalId ? { credit_approval_id: approvalId } : {}),
      terms: server.terms,
    });
  }

  const frequencies = policy.allowed_frequencies.map((f) => ({
    value: f,
    label: t(`installments.frequency.${f}`),
  }));
  const message =
    error || (preview.isError && asked === wanted ? installmentError(preview.error) : '');

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('installments.dialog.title')}
      description={t('installments.dialog.description')}
      className="max-w-4xl!"
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('installments.dialog.cancel')}
          </Button>
          <Button type="button" loading={busy} disabled={!canContinue} onClick={next}>
            {compareMoney(input?.down_payment ?? '0', '0') > 0
              ? t('installments.dialog.toDownPayment')
              : t('installments.dialog.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyInput
            label={t('installments.fields.downPayment')}
            value={down}
            onValueChange={setDown}
            {...(terms?.min_down_payment
              ? {
                  help: t('installments.fields.downAtLeast', {
                    amount: formatMoney(terms.min_down_payment),
                  }),
                }
              : {})}
          />
          <NumberInput
            label={t('installments.fields.count')}
            value={count}
            decimals={0}
            maxLength={3}
            onValueChange={setCount}
            {...(terms
              ? {
                  help: t('installments.fields.maxMonths', {
                    months: formatNumber(terms.max_months_allowed),
                  }),
                }
              : {})}
          />
          <Select
            label={t('installments.fields.frequency')}
            value={frequency}
            options={frequencies}
            onChange={(e) => setFrequency(e.target.value as InstallmentFrequency)}
          />
          <div>
            <label className="field-label" htmlFor={dateId}>
              {t('installments.fields.firstDue')}
            </label>
            <DateInput id={dateId} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
        </div>

        {terms && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4" aria-live="polite">
            <Fact label={t('installments.terms.cashPrice')} value={formatMoney(terms.cash_price)} />
            <Fact
              label={t('installments.terms.downPayment')}
              value={formatMoney(terms.down_payment)}
            />
            <Fact
              label={t('installments.terms.financed')}
              value={formatMoney(terms.financed_amount)}
            />
            <Fact
              label={t('installments.terms.profit')}
              value={formatMoney(terms.markup_amount)}
              testId="terms-profit"
            />
            <Fact
              label={t('installments.terms.installmentPrice')}
              value={formatMoney(terms.total_payable)}
              testId="terms-total"
            />
            <Fact
              label={t('installments.terms.installment')}
              value={
                terms.installment_amount
                  ? t('installments.terms.countTimes', {
                      count: formatNumber(terms.installments_count),
                      amount: formatMoney(terms.installment_amount),
                    })
                  : '—'
              }
            />
            <Fact
              label={t('installments.terms.firstDue')}
              value={formatBusinessDate(terms.first_due_date)}
            />
            <Fact
              label={t('installments.terms.lastDue')}
              value={formatBusinessDate(terms.last_due_date)}
            />
          </dl>
        )}
        {!server && input && <p className="type-caption">{t('installments.dialog.checking')}</p>}

        {terms && terms.violations.length > 0 && (
          <Notice tone="error">
            <ul className="space-y-1" data-testid="terms-violations">
              {terms.violations.map((v) => (
                <li key={v.rule}>{violationText(v)}</li>
              ))}
            </ul>
          </Notice>
        )}

        {checks && (
          <section className="space-y-3 rounded-control border border-line p-3">
            <h3 className="type-label">{t('installments.checks.title')}</h3>
            <div className="flex flex-wrap items-center gap-2" data-testid="check-credit">
              <Badge tone={approvalId ? 'warning' : checks.credit.allowed ? 'success' : 'danger'}>
                {approvalId
                  ? t('installments.checks.creditApproved')
                  : checks.credit.allowed
                    ? t('installments.checks.creditOk')
                    : checks.credit.pending_approval_id
                      ? t('installments.checks.creditPending')
                      : t('installments.checks.creditNo')}
              </Badge>
              <span className="type-caption">
                {t('installments.checks.available', {
                  amount: formatMoney(checks.credit.available),
                })}
              </span>
              {!checks.credit.allowed && !approvalId && !checks.credit.pending_approval_id && (
                <Can permission="sale.create">
                  <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
                    {t('installments.checks.askException')}
                  </Button>
                </Can>
              )}
              {!checks.credit.allowed && checks.credit.pending_approval_id && (
                <Button size="sm" variant="ghost" onClick={() => void preview.refetch()}>
                  {t('installments.checks.refresh')}
                </Button>
              )}
            </div>

            <div className="space-y-2" data-testid="check-guarantors">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={checks.guarantors.selected_met ? 'success' : 'danger'}>
                  {checks.guarantors.required_count === 0
                    ? t('installments.checks.guarantorsNone')
                    : t('installments.checks.guarantorsNeeded', {
                        count: formatNumber(checks.guarantors.required_count),
                        picked: formatNumber(checks.guarantors.selected),
                      })}
                </Badge>
                <Can permission="customer.create">
                  <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                    {t('installments.checks.addGuarantor')}
                  </Button>
                </Can>
              </div>
              {linked.length > 0 && (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {linked.map((g) => (
                    <li key={g.id}>
                      <Checkbox
                        label={
                          <bdi>
                            {g.full_name}
                            {` · ${relationLabel(g.relation)}`}
                          </bdi>
                        }
                        checked={picked.includes(g.id)}
                        disabled={!picked.includes(g.id) && picked.length >= 3}
                        onChange={(e) => toggle(g.id, e.target.checked)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2" data-testid="check-survey">
              <Badge tone={checks.survey.met ? 'success' : 'danger'}>
                {!checks.survey.required
                  ? t('installments.checks.surveyNone')
                  : checks.survey.met
                    ? t('installments.checks.surveyOk')
                    : checks.survey.open_survey
                      ? t('installments.checks.surveyOpen')
                      : t('installments.checks.surveyMissing')}
              </Badge>
            </div>
          </section>
        )}

        {terms && terms.lines.length > 0 && (
          <details>
            <summary className="type-label cursor-pointer">
              {t('installments.schedule.title', { count: formatNumber(terms.lines.length) })}
            </summary>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('installments.schedule.caption')}</caption>
                <thead>
                  <tr>
                    <th className="type-label py-1 text-start">{t('installments.schedule.seq')}</th>
                    <th className="type-label py-1 text-start">{t('installments.schedule.due')}</th>
                    <th className="type-label py-1 text-end">
                      {t('installments.schedule.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {terms.lines.map((l) => (
                    <tr key={l.seq} className="border-t border-line">
                      <td className="num py-1">{formatNumber(l.seq)}</td>
                      <td className="py-1">{formatBusinessDate(l.due_date)}</td>
                      <td className="num py-1 text-end">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <FormError message={message} />
      </div>

      {asking && credit && (
        <CreditExceptionDialog
          open
          onOpenChange={(v) => !v && setAsking(false)}
          customerId={customer.id}
          amount={terms?.financed_amount ?? ''}
          onSent={() => {
            setAsking(false);
            void preview.refetch();
          }}
        />
      )}
      {adding && (
        <AddGuarantorDialog
          open
          onOpenChange={(v) => !v && setAdding(false)}
          customer={{ id: customer.id, full_name: customer.name ?? '' }}
          linkedIds={(guarantors.data ?? []).map((g) => g.id)}
          onDone={() => {
            setAdding(false);
            void guarantors.refetch();
            void preview.refetch();
          }}
        />
      )}
    </Dialog>
  );
}

function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd className="num" {...(testId ? { 'data-testid': testId } : {})}>
        {value}
      </dd>
    </div>
  );
}
