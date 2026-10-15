import {
  GUARANTOR_RELATIONS,
  type Guarantor,
  type GuarantorRelation,
} from '@ziadkhaled-wb/contracts';
import type { SelectOption } from '@/components/ui/Select';
import { t, type TranslationKey } from '@/i18n';

export const relationLabel = (relation: GuarantorRelation): string =>
  t(`guarantors.relation.${relation}`);

export const relationOptions = (): SelectOption[] =>
  GUARANTOR_RELATIONS.map((relation) => ({ value: relation, label: relationLabel(relation) }));

/** API refusals every guarantor screen can get, translated. */
export const GUARANTOR_API_ERRORS: Partial<Record<string, TranslationKey>> = {
  GUARANTOR_NOT_FOUND: 'guarantors.errors.GUARANTOR_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'guarantors.errors.CUSTOMER_NOT_FOUND',
  GUARANTOR_NATIONAL_ID_TAKEN: 'guarantors.errors.GUARANTOR_NATIONAL_ID_TAKEN',
  GUARANTOR_ALREADY_LINKED: 'guarantors.errors.GUARANTOR_ALREADY_LINKED',
  GUARANTOR_NOT_LINKED: 'guarantors.errors.GUARANTOR_NOT_LINKED',
  GUARANTOR_LIMIT_REACHED: 'guarantors.errors.GUARANTOR_LIMIT_REACHED',
  GUARANTOR_IS_CUSTOMER: 'guarantors.errors.GUARANTOR_IS_CUSTOMER',
  GUARANTOR_ARCHIVED: 'guarantors.errors.GUARANTOR_ARCHIVED',
  GUARANTOR_ON_ACTIVE_CONTRACT: 'guarantors.errors.GUARANTOR_ON_ACTIVE_CONTRACT',
  GUARANTOR_REQUIRED: 'guarantors.errors.GUARANTOR_REQUIRED',
  CUSTOMER_BLOCKED: 'guarantors.errors.CUSTOMER_BLOCKED',
  PERMISSION_DENIED: 'guarantors.errors.PERMISSION_DENIED',
  MODULE_NOT_IN_PLAN: 'guarantors.errors.MODULE_NOT_IN_PLAN',
  VALIDATION_FAILED: 'guarantors.errors.validation',
};

export const guarantorErrorText = (code: string): string =>
  t(GUARANTOR_API_ERRORS[code] ?? 'guarantors.errors.failed');

/** The guarantor form as typed (every value a string; empty means "not given"). */
export interface GuarantorFormState {
  full_name: string;
  phone: string;
  national_id: string;
  address: string;
  job: string;
  monthly_income: string;
}
export type GuarantorField = keyof GuarantorFormState;
export type GuarantorFieldErrors = Partial<Record<GuarantorField | 'relation', string>>;

export const emptyGuarantorForm: GuarantorFormState = {
  full_name: '',
  phone: '',
  national_id: '',
  address: '',
  job: '',
  monthly_income: '',
};

/** The full number is only here for a user with customer.view_pii; a mask is never put in a field. */
export function guarantorToForm(g: Guarantor): GuarantorFormState {
  return {
    full_name: g.full_name,
    phone: g.phone,
    national_id: g.national_id ?? '',
    address: g.address ?? '',
    job: g.job ?? '',
    monthly_income: g.monthly_income ?? '',
  };
}

const FIELD_ERRORS: Record<GuarantorField | 'relation', TranslationKey> = {
  full_name: 'guarantors.errors.fullName',
  phone: 'guarantors.errors.phone',
  national_id: 'guarantors.errors.nationalId',
  address: 'guarantors.errors.address',
  job: 'guarantors.errors.job',
  monthly_income: 'guarantors.errors.monthlyIncome',
  relation: 'guarantors.errors.relation',
};

/** Turns the contract's zod issues into one message per field. */
export function guarantorFieldErrors(
  issues: { path: (string | number)[] }[],
): GuarantorFieldErrors {
  const out: GuarantorFieldErrors = {};
  for (const issue of issues) {
    const first = String(issue.path[0] ?? '');
    const key = (first === 'link' ? String(issue.path[1] ?? '') : first) as GuarantorField;
    if (key in FIELD_ERRORS) out[key] = t(FIELD_ERRORS[key]);
  }
  return out;
}
