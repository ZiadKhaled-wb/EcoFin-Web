import { t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
export function shopError(error: unknown) {
  const codes: Partial<Record<string, TranslationKey>> = {
    SLUG_TAKEN: 'shops.errors.slugTaken',
    SLUG_INVALID: 'shops.errors.slugInvalid',
    PLAN_NOT_FOUND: 'shops.errors.planMissing',
    OWNER_ALREADY_ACTIVE: 'shops.errors.ownerActive',
    ORG_NOT_FOUND: 'shops.errors.notFound',
    ORG_NOT_ACTIVE: 'shops.errors.notActive',
    REASON_REQUIRED: 'shops.errors.reasonRequired',
    NETWORK_ERROR: 'errors.network',
  };
  return t(error instanceof ApiError ? (codes[error.code] ?? 'errors.unknown') : 'errors.unknown');
}
