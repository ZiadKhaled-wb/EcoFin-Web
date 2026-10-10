import type { Customer, CustomerStatus, EgyptGovernorateCode } from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { t, type TranslationKey } from '@/i18n';

export const STATUS_TONE: Record<CustomerStatus, BadgeTone> = {
  active: 'success',
  watch: 'warning',
  blocked: 'danger',
};

/** The full national ID when the server sent it (customer.view_pii), else its mask, else nothing. */
export const shownNationalId = (customer: Customer): string =>
  customer.national_id ?? customer.national_id_masked ?? '';

/** Whole years between a birth date (YYYY-MM-DD) and `today`. */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const [year = 0, month = 1, day = 1] = birthDate.split('-').map(Number);
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

export const governorateName = (code: EgyptGovernorateCode): string =>
  t(`customers.governorates.${code}` as TranslationKey);

/** API refusals every customer screen can get, translated. */
export const CUSTOMER_API_ERRORS: Partial<Record<string, TranslationKey>> = {
  CUSTOMER_NOT_FOUND: 'customers.errors.notFound',
  PERMISSION_DENIED: 'customers.errors.permission',
  MODULE_NOT_IN_PLAN: 'customers.errors.module',
  VALIDATION_FAILED: 'customers.errors.validation',
};
