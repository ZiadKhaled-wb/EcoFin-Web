// P03 installment terms. FinTech-Pro's "sales terms" tab plus its XConfig rules (duration tiers
// by amount, minimum installment and down payment rule per frequency, max down payment) become
// one form that publishes a new immutable policy version.
import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOWN_PAYMENT_RULES,
  EARLY_SETTLEMENT_RULES,
  INSTALLMENT_FREQUENCIES,
  LATE_FEE_TYPES,
  SURVEY_VALID_DAYS,
  type InstallmentFrequency,
  type InstallmentPolicy,
} from '@ziadkhaled-wb/contracts';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Notice from '@/components/ui/Notice';
import { notify } from '@/components/ui/notify';
import { settingsApi } from '@/services/settingsApi';
import { settingsKeys } from '@/features/settings/useSettings';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatNumber } from '@/lib/format';
import { t } from '@/i18n';
import { settingsError } from './settingsForm';
import { policyBody, toPolicyForm, type PolicyForm, type Rule } from './policyForm';

export default function InstallmentPolicyTab({ current }: { current: InstallmentPolicy | null }) {
  const orgId = useAuthStore((st) => st.orgId);
  const cache = useQueryClient();
  const history = useQuery({
    queryKey: settingsKeys.policies(orgId),
    queryFn: settingsApi.policies,
  });
  const [form, setForm] = useState<PolicyForm>(() => toPolicyForm(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const label = (k: InstallmentFrequency) => t(`settings.policy.frequency.${k}`);

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = policyBody(form);
    if (!parsed.success) {
      setError(t('settings.errors.validation'));
      return;
    }
    setBusy(true);
    try {
      const saved = await settingsApi.publishPolicy(parsed.data);
      if (current && saved.id === current.id) notify.info(t('settings.policy.unchanged'));
      else notify.success(t('settings.policy.published', { version: saved.version }));
      await Promise.all([
        cache.invalidateQueries({ queryKey: settingsKeys.settings(orgId) }),
        cache.invalidateQueries({ queryKey: settingsKeys.policies(orgId) }),
      ]);
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setBusy(false);
    }
  }

  const older = (history.data ?? []).filter((p) => p.id !== current?.id);

  return (
    <form onSubmit={(e) => void publish(e)} noValidate className="space-y-6">
      <Notice tone="info">
        {current
          ? t('settings.policy.current', {
              version: current.version,
              date: formatDate(current.effective_from),
            })
          : t('settings.policy.none')}{' '}
        {t('settings.policy.intro')}
      </Notice>

      <Card title={t('settings.policy.downPayment')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NumberInput
            label={t('settings.policy.minDown')}
            decimals={2}
            suffix="%"
            value={form.min_down_payment_pct}
            onValueChange={(v) => set('min_down_payment_pct', v)}
          />
          <NumberInput
            label={t('settings.policy.maxDown')}
            help={t('settings.policy.maxDownHelp')}
            decimals={2}
            suffix="%"
            value={form.max_down_payment_pct}
            onValueChange={(v) => set('max_down_payment_pct', v)}
          />
        </div>
      </Card>

      <Card title={t('settings.policy.duration')}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <NumberInput
              label={t('settings.policy.maxMonths')}
              decimals={0}
              value={form.max_months}
              onValueChange={(v) => set('max_months', v)}
            />
            <MoneyInput
              label={t('settings.policy.minSale')}
              value={form.min_sale_amount}
              onValueChange={(v) => set('min_sale_amount', v)}
            />
            <MoneyInput
              label={t('settings.policy.minInstallment')}
              value={form.min_installment}
              onValueChange={(v) => set('min_installment', v)}
            />
            <MoneyInput
              label={t('settings.policy.roundingStep')}
              value={form.rounding_step}
              onValueChange={(v) => set('rounding_step', v)}
            />
          </div>
          <TierRows
            title={t('settings.policy.amountTiers')}
            help={t('settings.policy.amountTiersHelp')}
            rows={form.amount_tiers}
            empty={{ up_to_amount: '', max_months: '' }}
            onChange={(rows) => set('amount_tiers', rows)}
            render={(row, update) => (
              <>
                <MoneyInput
                  label={t('settings.policy.upToAmount')}
                  value={row.up_to_amount}
                  onValueChange={(v) => update({ ...row, up_to_amount: v })}
                />
                <NumberInput
                  label={t('settings.policy.tierMaxMonths')}
                  decimals={0}
                  value={row.max_months}
                  onValueChange={(v) => update({ ...row, max_months: v })}
                />
              </>
            )}
          />
          <TierRows
            title={t('settings.policy.markupTiers')}
            help={t('settings.policy.markupHelp')}
            rows={form.markup_tiers}
            minRows={1}
            empty={{ up_to_months: '', pct: '' }}
            onChange={(rows) => set('markup_tiers', rows)}
            render={(row, update) => (
              <>
                <NumberInput
                  label={t('settings.policy.upToMonths')}
                  decimals={0}
                  value={row.up_to_months}
                  onValueChange={(v) => update({ ...row, up_to_months: v })}
                />
                <NumberInput
                  label={t('settings.policy.markupPct')}
                  decimals={2}
                  suffix="%"
                  value={row.pct}
                  onValueChange={(v) => update({ ...row, pct: v })}
                />
              </>
            )}
          />
        </div>
      </Card>

      <Card title={t('settings.policy.perFrequency')}>
        <div className="space-y-4">
          <fieldset>
            <legend className="type-label mb-1">{t('settings.policy.frequencies')}</legend>
            <div className="flex flex-wrap gap-x-6">
              {INSTALLMENT_FREQUENCIES.map((k) => (
                <Checkbox
                  key={k}
                  label={label(k)}
                  checked={form.allowed_frequencies.includes(k)}
                  onChange={(e) =>
                    set(
                      'allowed_frequencies',
                      e.target.checked
                        ? [...form.allowed_frequencies, k]
                        : form.allowed_frequencies.filter((x) => x !== k),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          {INSTALLMENT_FREQUENCIES.filter((k) => form.allowed_frequencies.includes(k)).map((k) => (
            <div key={k} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MoneyInput
                label={t('settings.policy.minInstallmentFor', { frequency: label(k) })}
                value={form.min_installment_by_frequency[k]}
                onValueChange={(v) =>
                  set('min_installment_by_frequency', {
                    ...form.min_installment_by_frequency,
                    [k]: v,
                  })
                }
              />
              <Select
                label={t('settings.policy.downPaymentRule', { frequency: label(k) })}
                value={form.down_payment_rules[k]}
                options={DOWN_PAYMENT_RULES.filter(
                  (r) => r !== 'installment_per_day_of_month' || k === 'daily',
                ).map((r) => ({ value: r, label: t(`settings.policy.rules.${r}`) }))}
                onChange={(e) =>
                  set('down_payment_rules', {
                    ...form.down_payment_rules,
                    [k]: e.target.value as Rule,
                  })
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('settings.policy.lateFees')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label={t('settings.policy.lateFeeType')}
            value={form.late_fee_type}
            options={LATE_FEE_TYPES.map((v) => ({
              value: v,
              label: t(`settings.policy.lateFeeTypes.${v}`),
            }))}
            onChange={(e) => set('late_fee_type', e.target.value as PolicyForm['late_fee_type'])}
          />
          {form.late_fee_type !== 'none' && (
            <>
              {form.late_fee_type === 'percent' ? (
                <NumberInput
                  label={t('settings.policy.lateFeeValue')}
                  decimals={2}
                  suffix="%"
                  value={form.late_fee_value}
                  onValueChange={(v) => set('late_fee_value', v)}
                />
              ) : (
                <MoneyInput
                  label={t('settings.policy.lateFeeValue')}
                  value={form.late_fee_value}
                  onValueChange={(v) => set('late_fee_value', v)}
                />
              )}
              <MoneyInput
                label={t('settings.policy.lateFeeCap')}
                help={t('settings.optional')}
                value={form.late_fee_cap}
                onValueChange={(v) => set('late_fee_cap', v)}
              />
              <Checkbox
                label={t('settings.policy.lateFeeRecurring')}
                checked={form.late_fee_recurring}
                onChange={(e) => set('late_fee_recurring', e.target.checked)}
              />
            </>
          )}
          <NumberInput
            label={t('settings.policy.graceDays')}
            decimals={0}
            value={form.grace_days}
            onValueChange={(v) => set('grace_days', v)}
          />
          <Select
            label={t('settings.policy.earlySettlement')}
            value={form.early_settlement_rule}
            options={EARLY_SETTLEMENT_RULES.map((v) => ({
              value: v,
              label: t(`settings.policy.earlyRules.${v}`),
            }))}
            onChange={(e) =>
              set('early_settlement_rule', e.target.value as PolicyForm['early_settlement_rule'])
            }
          />
          {form.early_settlement_rule === 'percent_of_future_profit' && (
            <NumberInput
              label={t('settings.policy.earlyPct')}
              decimals={2}
              suffix="%"
              value={form.early_settlement_pct}
              onValueChange={(v) => set('early_settlement_pct', v)}
            />
          )}
          <MoneyInput
            label={t('settings.policy.guarantorAbove')}
            help={t('settings.optional')}
            value={form.guarantor_required_above}
            onValueChange={(v) => set('guarantor_required_above', v)}
          />
          <NumberInput
            label={t('settings.policy.guarantorsCount')}
            help={t('settings.policy.guarantorsCountHelp')}
            decimals={0}
            value={form.guarantors_required_count}
            disabled={form.guarantor_required_above.trim() === ''}
            onValueChange={(v) => set('guarantors_required_count', v)}
          />
          <MoneyInput
            label={t('settings.policy.surveyAbove')}
            help={`${t('settings.optional')} · ${t('surveys.policyHint', { days: formatNumber(SURVEY_VALID_DAYS) })}`}
            value={form.survey_required_above}
            onValueChange={(v) => set('survey_required_above', v)}
          />
        </div>
      </Card>

      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {t('settings.policy.publish')}
        </Button>
      </div>

      {older.length > 0 && (
        <Card title={t('settings.policy.history')}>
          <ul className="type-body space-y-1">
            {older.map((p) => (
              <li key={p.id}>
                {t('settings.policy.historyRow', {
                  version: p.version,
                  date: formatDate(p.effective_from),
                  months: p.max_months,
                })}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </form>
  );
}

/** Editable rows (amount tiers, markup tiers) with add and remove. */
function TierRows<Row>({
  title,
  help,
  rows,
  empty,
  minRows = 0,
  onChange,
  render,
}: {
  title: string;
  help: string;
  rows: Row[];
  empty: Row;
  minRows?: number;
  onChange: (rows: Row[]) => void;
  render: (row: Row, update: (row: Row) => void) => ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="type-label">{title}</legend>
      <p className="type-caption">{help}</p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={rows.length <= minRows}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            {t('settings.policy.removeTier')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={rows.length >= 20}
        onClick={() => onChange([...rows, empty])}
      >
        {t('settings.policy.addTier')}
      </Button>
    </fieldset>
  );
}
