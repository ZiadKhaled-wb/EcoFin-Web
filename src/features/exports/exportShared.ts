import {
  ExportRunningDetail,
  ExportTooSoonDetail,
  type ExportFailureCode,
  type ExportStatus,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';

export const STATUS_TONE: Record<ExportStatus, BadgeTone> = {
  queued: 'neutral',
  running: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

/** The polling runs while an export is queued or running. */
export const isActive = (status: ExportStatus): boolean =>
  status === 'queued' || status === 'running';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  EXPORT_RUNNING: 'exports.errors.EXPORT_RUNNING',
  EXPORT_NOT_FOUND: 'exports.errors.EXPORT_NOT_FOUND',
  PERMISSION_DENIED: 'exports.errors.PERMISSION_DENIED',
  FILE_NOT_FOUND: 'exports.errors.FILE_NOT_FOUND',
  ORG_NOT_ACTIVE: 'exports.errors.ORG_NOT_ACTIVE',
};

/** Seconds as "N minutes" (rounded up) for the "too soon" message. */
export const minutesOf = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

/** An API error of the export screen in the active language. */
export function exportErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return t('exports.errors.failed');
  if (error.code === 'EXPORT_TOO_SOON') {
    const detail = ExportTooSoonDetail.safeParse(error.details);
    return t('exports.errors.EXPORT_TOO_SOON', {
      minutes: detail.success ? minutesOf(detail.data.retry_after) : 60,
    });
  }
  const key = ERRORS[error.code];
  return key ? t(key) : t('exports.errors.failed');
}

/** The id of the export that is already running, from an EXPORT_RUNNING error. */
export function runningJobOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'EXPORT_RUNNING') return null;
  const detail = ExportRunningDetail.safeParse(error.details);
  return detail.success ? detail.data.job_id : null;
}

export const failureKey = (code: ExportFailureCode | null): TranslationKey =>
  code ? (`exports.failure.${code}` as TranslationKey) : 'exports.failure.EXPORT_FAILED';

/** Bytes as a short size ("3.2 MB"). */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
