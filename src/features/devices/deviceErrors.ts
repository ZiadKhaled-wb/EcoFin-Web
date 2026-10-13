import { ApiError, type ApiErrorCode } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

/** O03: the server codes the device screens explain; anything else is the generic message. */
const MESSAGES: Partial<Record<ApiErrorCode, TranslationKey>> = {
  DEVICE_NAME_TAKEN: 'devices.errors.DEVICE_NAME_TAKEN',
  DEVICE_HAS_OPEN_SHIFT: 'devices.errors.DEVICE_HAS_OPEN_SHIFT',
  DEVICE_NOT_FOUND: 'devices.errors.DEVICE_NOT_FOUND',
  DEVICE_INVALID: 'devices.errors.DEVICE_INVALID',
  DEVICE_REVOKED: 'devices.revoked',
  DEVICE_REQUIRED: 'devices.errors.DEVICE_REQUIRED',
  DEVICE_BRANCH_MISMATCH: 'devices.errors.DEVICE_BRANCH_MISMATCH',
  DEVICE_MISMATCH: 'devices.errors.DEVICE_MISMATCH',
  PAIRING_CODE_INVALID: 'devices.errors.PAIRING_CODE_INVALID',
  REASON_REQUIRED: 'devices.errors.REASON_REQUIRED',
  BRANCH_NOT_FOUND: 'devices.errors.BRANCH_NOT_FOUND',
  BRANCH_DENIED: 'devices.errors.BRANCH_NOT_FOUND',
  PLAN_LIMIT_REACHED: 'devices.errors.PLAN_LIMIT_REACHED',
  TOO_MANY_REQUESTS: 'devices.errors.TOO_MANY_REQUESTS',
  PERMISSION_DENIED: 'devices.errors.PERMISSION_DENIED',
  VALIDATION_FAILED: 'devices.errors.VALIDATION_FAILED',
};

export function deviceErrorText(error: unknown): string {
  return t((error instanceof ApiError && MESSAGES[error.code]) || 'errors.unknown');
}
