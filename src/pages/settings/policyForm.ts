// P03 installment policy form: the inputs (strings) and the contract body built from them.
import {
  DOWN_PAYMENT_RULES,
  EARLY_SETTLEMENT_RULES,
  INSTALLMENT_FREQUENCIES,
  InstallmentPolicyBody,
  type InstallmentFrequency,
  type InstallmentPolicy,
} from '@ziadkhaled-wb/contracts';
import { padDecimals } from '@/lib/number';

export type Rule = (typeof DOWN_PAYMENT_RULES)[number];
type AmountRow = { up_to_amount: string; max_months: string };
type MarkupRow = { up_to_months: string; pct: string };

/** Inputs as strings; turned into the contract body on publish. */
export interface PolicyForm {
  min_down_payment_pct: string;
  max_down_payment_pct: string;
  max_months: string;
  allowed_frequencies: InstallmentFrequency[];
  min_installment_by_frequency: Record<InstallmentFrequency, string>;
  down_payment_rules: Record<InstallmentFrequency, Rule>;
  amount_tiers: AmountRow[];
  markup_tiers: MarkupRow[];
  min_sale_amount: string;
  min_installment: string;
  rounding_step: string;
  grace_days: string;
  early_settlement_rule: (typeof EARLY_SETTLEMENT_RULES)[number];
  early_settlement_pct: string;
  guarantor_required_above: string;
  guarantors_required_count: string;
  survey_required_above: string;
}

const s = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '' : String(v);

export function toPolicyForm(p: InstallmentPolicy | null): PolicyForm {
  const freq = <T>(f: (k: InstallmentFrequency) => T) =>
    Object.fromEntries(INSTALLMENT_FREQUENCIES.map((k) => [k, f(k)])) as Record<
      InstallmentFrequency,
      T
    >;
  return {
    min_down_payment_pct: s(p?.min_down_payment_pct ?? '0'),
    max_down_payment_pct: s(p?.max_down_payment_pct),
    max_months: s(p?.max_months ?? 12),
    allowed_frequencies: p?.allowed_frequencies ?? ['monthly'],
    min_installment_by_frequency: freq((k) => s(p?.min_installment_by_frequency[k])),
    down_payment_rules: freq((k) => p?.down_payment_rules[k] ?? 'percent'),
    amount_tiers: (p?.amount_tiers ?? []).map((r) => ({
      up_to_amount: r.up_to_amount,
      max_months: String(r.max_months),
    })),
    markup_tiers: (p?.markup_tiers ?? [{ up_to_months: 12, pct: 0 }]).map((r) => ({
      up_to_months: String(r.up_to_months),
      pct: String(r.pct),
    })),
    min_sale_amount: s(p?.min_sale_amount ?? '0.00'),
    min_installment: s(p?.min_installment ?? '0.00'),
    rounding_step: s(p?.rounding_step ?? '1.00'),
    grace_days: s(p?.grace_days ?? 0),
    early_settlement_rule: p?.early_settlement_rule ?? 'no_discount',
    early_settlement_pct: s(p?.early_settlement_pct),
    guarantor_required_above: s(p?.guarantor_required_above),
    guarantors_required_count: s(p?.guarantors_required_count ?? 1),
    survey_required_above: s(p?.survey_required_above),
  };
}

const money = (v: string) => padDecimals(v.trim(), 2);
const moneyOrNull = (v: string) => (v.trim() === '' ? null : money(v));
const pctOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

/** The full policy body. Per-frequency rules only for the allowed frequencies. */
export function policyBody(f: PolicyForm) {
  const allowed = INSTALLMENT_FREQUENCIES.filter((k) => f.allowed_frequencies.includes(k));
  return InstallmentPolicyBody.safeParse({
    min_down_payment_pct: f.min_down_payment_pct.trim() || '0',
    max_down_payment_pct: pctOrNull(f.max_down_payment_pct),
    max_months: num(f.max_months),
    allowed_frequencies: allowed,
    min_installment_by_frequency: Object.fromEntries(
      allowed
        .filter((k) => f.min_installment_by_frequency[k].trim() !== '')
        .map((k) => [k, money(f.min_installment_by_frequency[k])]),
    ),
    down_payment_rules: Object.fromEntries(allowed.map((k) => [k, f.down_payment_rules[k]])),
    amount_tiers: f.amount_tiers.map((r) => ({
      up_to_amount: money(r.up_to_amount),
      max_months: num(r.max_months),
    })),
    markup_tiers: f.markup_tiers.map((r) => ({
      up_to_months: num(r.up_to_months),
      pct: num(r.pct),
    })),
    min_sale_amount: money(f.min_sale_amount || '0'),
    min_installment: money(f.min_installment || '0'),
    rounding_step: money(f.rounding_step || '1'),
    // N04 (D79): no late fees (Islamic finance rule 4); the server saves every version without one.
    grace_days: num(f.grace_days || '0'),
    early_settlement_rule: f.early_settlement_rule,
    early_settlement_pct: pctOrNull(f.early_settlement_pct),
    guarantor_required_above: moneyOrNull(f.guarantor_required_above),
    guarantors_required_count: num(f.guarantors_required_count || '1'),
    survey_required_above: moneyOrNull(f.survey_required_above),
  });
}
