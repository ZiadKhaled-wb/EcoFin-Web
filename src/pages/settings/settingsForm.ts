// P03 settings form helpers. FinTech-Pro's page kept one nested config object and saved it all
// at once; here each tab sends only the fields it changed (PATCH /api/settings is partial).
import {
  CREDIT_SCORE_FACTORS,
  DISCOUNT_CAP_ROLES,
  INSTALLMENT_FREQUENCIES,
  RECEIPT_FIELDS,
  ShopSettingsUpdateBody,
  type ShopSettings,
} from '@ziadkhaled-wb/contracts';
import { padDecimals } from '@/lib/number';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

export const SETTINGS_TABS = [
  'general',
  'receipt',
  'tax',
  'sales',
  'installments',
  'credit',
  'legal',
  'inventory',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export type FieldTab = Exclude<SettingsTab, 'installments'>;

type CapRole = (typeof DISCOUNT_CAP_ROLES)[number];
type Factor = (typeof CREDIT_SCORE_FACTORS)[number];
type Frequency = (typeof INSTALLMENT_FREQUENCIES)[number];
type ReceiptField = (typeof RECEIPT_FIELDS)[number];

/** What the inputs hold. Numbers stay strings until saved (never floats in the form). */
export interface SettingsForm {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  default_language: 'ar' | 'en';
  logo_file_id: string | null;
  tax_registration_no: string;
  theme_color: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_width_mm: '58' | '80';
  receipt_fields: Record<ReceiptField, boolean>;
  prices_include_vat: boolean;
  default_tax_class_id: string;
  discount_caps: Record<CapRole, string>;
  return_policy_days: string;
  purchase_approval_threshold: string;
  collector_commission_pct: string;
  allow_negative_bank: boolean;
  credit_min_score: string;
  credit_limit_income_multiple: string;
  credit_score_weights: Record<Factor, string>;
  legal_referral_days: Record<Frequency, string>;
  customer_ban_days: string;
  overdue_warning_interval_days: string;
  global_min_stock: string;
  installment_markup_vat: 'not_taxed' | 'taxed';
  delivery_fee_tax_class_id: string;
  deposit_vat_timing: 'on_delivery' | 'on_deposit';
}

export const TAB_FIELDS: Record<FieldTab, readonly (keyof SettingsForm)[]> = {
  general: [
    'name',
    'address',
    'phone',
    'timezone',
    'default_language',
    'logo_file_id',
    'tax_registration_no',
    'theme_color',
  ],
  receipt: ['receipt_header', 'receipt_footer', 'receipt_width_mm', 'receipt_fields'],
  tax: [
    'prices_include_vat',
    'default_tax_class_id',
    'installment_markup_vat',
    'delivery_fee_tax_class_id',
    'deposit_vat_timing',
  ],
  sales: [
    'discount_caps',
    'return_policy_days',
    'purchase_approval_threshold',
    'collector_commission_pct',
    'allow_negative_bank',
  ],
  credit: ['credit_min_score', 'credit_limit_income_multiple', 'credit_score_weights'],
  legal: ['legal_referral_days', 'customer_ban_days', 'overdue_warning_interval_days'],
  inventory: ['global_min_stock'],
};

const str = (v: number | string | null | undefined) =>
  v === null || v === undefined ? '' : String(v);
const mapOf = <K extends string>(keys: readonly K[], f: (k: K) => string) =>
  Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<K, string>;

export function toForm(s: ShopSettings): SettingsForm {
  return {
    name: s.name,
    address: s.address ?? '',
    phone: s.phone ?? '',
    timezone: s.timezone,
    default_language: s.default_language,
    logo_file_id: s.logo_file_id,
    tax_registration_no: s.tax_registration_no ?? '',
    theme_color: s.theme_color,
    receipt_header: s.receipt_header ?? '',
    receipt_footer: s.receipt_footer ?? '',
    receipt_width_mm: s.receipt_width_mm === 58 ? '58' : '80',
    receipt_fields: { ...s.receipt_fields },
    prices_include_vat: s.prices_include_vat,
    default_tax_class_id: s.default_tax_class_id ?? '',
    discount_caps: mapOf(DISCOUNT_CAP_ROLES, (r) => str(s.discount_caps[r])),
    return_policy_days: str(s.return_policy_days),
    purchase_approval_threshold: str(s.purchase_approval_threshold),
    collector_commission_pct: str(s.collector_commission_pct),
    allow_negative_bank: s.allow_negative_bank,
    credit_min_score: str(s.credit_min_score),
    credit_limit_income_multiple: str(s.credit_limit_income_multiple),
    credit_score_weights: mapOf(CREDIT_SCORE_FACTORS, (f) => str(s.credit_score_weights[f])),
    legal_referral_days: mapOf(INSTALLMENT_FREQUENCIES, (f) => str(s.legal_referral_days[f])),
    customer_ban_days: str(s.customer_ban_days),
    overdue_warning_interval_days: str(s.overdue_warning_interval_days),
    global_min_stock: str(s.global_min_stock),
    installment_markup_vat: s.installment_markup_vat,
    delivery_fee_tax_class_id: s.delivery_fee_tax_class_id ?? '',
    deposit_vat_timing: s.deposit_vat_timing,
  };
}

const int = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());
/** Two decimals, the way the server returns numeric(5,2) and numeric(6,2), so equal values compare equal. */
const decimal = (v: string) => (v.trim() === '' ? '' : padDecimals(v.trim(), 2));

/** The API value of one field (what PATCH would send). */
function apiValue(form: SettingsForm, key: keyof SettingsForm): unknown {
  switch (key) {
    case 'address':
    case 'phone':
    case 'tax_registration_no':
    case 'receipt_header':
    case 'receipt_footer':
      return orNull(form[key]);
    case 'name':
      return form.name.trim();
    case 'default_tax_class_id':
    case 'delivery_fee_tax_class_id':
      return form[key] || null;
    case 'receipt_width_mm':
      return Number(form.receipt_width_mm);
    case 'discount_caps':
      return Object.fromEntries(
        DISCOUNT_CAP_ROLES.filter((r) => form.discount_caps[r].trim() !== '').map((r) => [
          r,
          Number(form.discount_caps[r]),
        ]),
      );
    case 'credit_score_weights':
      return mapNumbers(form.credit_score_weights);
    case 'legal_referral_days':
      return Object.fromEntries(
        INSTALLMENT_FREQUENCIES.filter((f) => form.legal_referral_days[f].trim() !== '').map(
          (f) => [f, int(form.legal_referral_days[f])],
        ),
      );
    case 'purchase_approval_threshold':
      return form.purchase_approval_threshold.trim() === ''
        ? null
        : padDecimals(form.purchase_approval_threshold.trim(), 2);
    case 'credit_limit_income_multiple':
      return orNull(decimal(form.credit_limit_income_multiple));
    case 'collector_commission_pct':
      return decimal(form.collector_commission_pct);
    case 'return_policy_days':
    case 'credit_min_score':
    case 'customer_ban_days':
    case 'overdue_warning_interval_days':
    case 'global_min_stock':
      return int(form[key]);
    default:
      return form[key];
  }
}

function mapNumbers<K extends string>(m: Record<K, string>): Record<K, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, int(v as string)])) as Record<
    K,
    number
  >;
}

export type TabChanges =
  | { ok: true; body: ShopSettingsUpdateBody | null }
  | { ok: false; reason: 'validation' | 'weightsSum' };

/** The PATCH body for one tab: only the fields that differ from the saved settings. */
export function tabChanges(tab: FieldTab, form: SettingsForm, saved: ShopSettings): TabChanges {
  const before = toForm(saved);
  const changed: Record<string, unknown> = {};
  for (const key of TAB_FIELDS[tab]) {
    const value = apiValue(form, key);
    if (JSON.stringify(value) !== JSON.stringify(apiValue(before, key))) changed[key] = value;
  }
  if (Object.keys(changed).length === 0) return { ok: true, body: null };
  const parsed = ShopSettingsUpdateBody.safeParse(changed);
  if (parsed.success) return { ok: true, body: parsed.data };
  const weights = parsed.error.issues.some((i) => i.path[0] === 'credit_score_weights');
  return { ok: false, reason: weights ? 'weightsSum' : 'validation' };
}

/** Sum of the credit weights as typed (for the live "Total: n / 100" line). */
export function weightsTotal(form: SettingsForm): number {
  return CREDIT_SCORE_FACTORS.reduce(
    (sum, f) => sum + (Number(form.credit_score_weights[f]) || 0),
    0,
  );
}

const KNOWN_ERRORS = new Set([
  'SETTINGS_INVALID',
  'POLICY_INVALID',
  'TAX_CLASS_NOT_FOUND',
  'FILE_NOT_FOUND',
  'NAME_REQUIRED',
  'MODULE_NOT_IN_PLAN',
]);

/** A translated message for a failed save. */
export function settingsError(e: unknown): string {
  if (e instanceof ApiError && KNOWN_ERRORS.has(e.code))
    return t(`settings.errors.${e.code}` as TranslationKey);
  if (e instanceof ApiError && e.code === 'VALIDATION_FAILED')
    return t('settings.errors.validation');
  return t('errors.unknown');
}
