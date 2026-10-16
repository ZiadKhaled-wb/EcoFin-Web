import {
  InstallmentTermsInvalidDetail,
  PolicyChangedDetail,
  type InstallmentViolation,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';
import { saleError } from '../sales/saleShared';

/**
 * N02 (D77): shared pieces of the installment screens. Words follow docs/ISLAMIC_FINANCE_RULES.md
 * rule 3: "profit" (ربح) and "installment price" (سعر البيع بالتقسيط), never interest or loan.
 */

const ERRORS: Partial<Record<string, TranslationKey>> = {
  CUSTOMER_NATIONAL_ID_REQUIRED: 'installments.errors.nationalIdRequired',
  CUSTOMER_BLOCKED: 'installments.errors.customerBlocked',
  MARKUP_VAT_NOT_SUPPORTED: 'installments.errors.markupVat',
  POLICY_NOT_SET: 'installments.errors.policyNotSet',
  INSTALLMENTS_DISABLED: 'installments.errors.disabled',
  CREDIT_LIMIT_EXCEEDED: 'installments.errors.creditLimit',
  CREDIT_SCORE_TOO_LOW: 'installments.errors.creditScore',
  CREDIT_CUSTOMER_WATCH: 'installments.errors.creditWatch',
  CREDIT_APPROVAL_INVALID: 'installments.errors.approvalInvalid',
  GUARANTOR_REQUIRED: 'installments.errors.guarantorRequired',
  GUARANTOR_NOT_LINKED: 'installments.errors.guarantorNotLinked',
  GUARANTOR_ARCHIVED: 'installments.errors.guarantorArchived',
  GUARANTOR_NOT_FOUND: 'installments.errors.guarantorNotLinked',
  SURVEY_REQUIRED: 'installments.errors.surveyRequired',
  CONTRACT_NOT_FOUND: 'installments.errors.contractNotFound',
  IDEMPOTENCY_CONFLICT: 'installments.errors.keyUsed',
};

/** One broken policy rule as a sentence for the cashier. */
export function violationText(v: InstallmentViolation): string {
  switch (v.rule) {
    case 'frequency_not_allowed':
      return t('installments.violations.frequency_not_allowed', {
        allowed: v.allowed.map((f) => t(`installments.frequency.${f}`)).join(' / '),
      });
    case 'sale_below_minimum':
      return t('installments.violations.sale_below_minimum', {
        amount: formatMoney(v.min_sale_amount),
      });
    case 'down_payment_too_high':
      return t('installments.violations.down_payment_too_high', {
        amount: formatMoney(v.max_down_payment),
      });
    case 'down_payment_too_low':
      return v.min_down_payment === null
        ? t('installments.violations.down_payment_none')
        : t('installments.violations.down_payment_too_low', {
            amount: formatMoney(v.min_down_payment),
          });
    case 'too_many_months':
      return t('installments.violations.too_many_months', {
        max: formatNumber(v.max_months),
        months: formatNumber(v.duration_months),
      });
    case 'installment_below_minimum':
      return t('installments.violations.installment_below_minimum', {
        amount: formatMoney(v.min_installment),
      });
    case 'rounding':
      return t('installments.violations.rounding', { step: formatMoney(v.rounding_step) });
    case 'first_due_date_out_of_range':
      return t('installments.violations.first_due_date_out_of_range', {
        earliest: formatBusinessDate(v.earliest),
        latest: formatBusinessDate(v.latest),
      });
  }
}

/** A translated message for a refused installment sale or contract read. */
export function installmentError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'POLICY_CHANGED') {
    const detail = PolicyChangedDetail.safeParse((err as ApiError).details);
    return detail.success
      ? t('installments.errors.policyChanged', { version: detail.data.current_version })
      : t('installments.errors.policyChangedPlain');
  }
  if (code === 'INSTALLMENT_TERMS_INVALID') {
    const detail = InstallmentTermsInvalidDetail.safeParse((err as ApiError).details);
    const first = detail.success ? detail.data.violations?.[0] : undefined;
    return first ? violationText(first) : t('installments.errors.termsInvalid');
  }
  const key = ERRORS[code];
  return key ? t(key) : saleError(err);
}

/** Today in the shop's time zone (Cairo until the shop's own zone is passed in), as YYYY-MM-DD. */
export function shopToday(now: Date = new Date(), timeZone = 'Africa/Cairo'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
