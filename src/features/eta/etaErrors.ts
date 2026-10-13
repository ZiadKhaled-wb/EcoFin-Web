import { ApiError, type ApiErrorCode } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

/** T02: the server codes the ETA screens explain; anything else is the generic message. */
const MESSAGES: Partial<Record<ApiErrorCode, TranslationKey>> = {
  ETA_ENV_BUSY: 'eta.errors.ETA_ENV_BUSY',
  MODULE_NOT_IN_PLAN: 'eta.errors.MODULE_NOT_IN_PLAN',
  VALIDATION_FAILED: 'eta.errors.VALIDATION_FAILED',
  DEVICE_NOT_FOUND: 'eta.errors.DEVICE_NOT_FOUND',
  DEVICE_SERIAL_TAKEN: 'eta.errors.DEVICE_SERIAL_TAKEN',
  PERMISSION_DENIED: 'eta.errors.PERMISSION_DENIED',
};

export function etaErrorText(error: unknown): string {
  return t((error instanceof ApiError && MESSAGES[error.code]) || 'errors.unknown');
}
