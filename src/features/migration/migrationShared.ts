import {
  MigrationNotReversibleDetail,
  MigrationTotalMismatchDetail,
  type MigrationReportBatch,
} from '@ziadkhaled-wb/contracts';
import { t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  MIGRATION_SIGNED_OFF: 'migration.errors.MIGRATION_SIGNED_OFF',
  MIGRATION_NOT_REVERSIBLE: 'migration.errors.MIGRATION_NOT_REVERSIBLE',
  IMPORT_JOB_NOT_FOUND: 'migration.errors.IMPORT_JOB_NOT_FOUND',
  FILE_NOT_FOUND: 'migration.errors.FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'migration.errors.FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'migration.errors.FILE_TYPE_NOT_ALLOWED',
  PERMISSION_DENIED: 'migration.errors.PERMISSION_DENIED',
  SUBSCRIPTION_EXPIRED: 'migration.errors.SUBSCRIPTION_EXPIRED',
  VALIDATION_FAILED: 'migration.errors.VALIDATION_FAILED',
};

/** The three numbers of a refused sign-off (expected / system / difference). */
export function mismatchOf(error: unknown): MigrationTotalMismatchDetail | null {
  if (!(error instanceof ApiError) || error.code !== 'MIGRATION_TOTAL_MISMATCH') return null;
  const parsed = MigrationTotalMismatchDetail.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}

/** An API error of the migration screens in the active language. */
export function migrationErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return t('migration.errors.failed');
  const mismatch = mismatchOf(error);
  if (mismatch) {
    return t('migration.errors.MIGRATION_TOTAL_MISMATCH', {
      field: t(`migration.signOff.fields.${mismatch.field}`),
      expected: formatMoney(mismatch.expected),
      system: formatMoney(mismatch.system),
      difference: formatMoney(mismatch.difference),
    });
  }
  if (error.code === 'MIGRATION_NOT_REVERSIBLE') {
    const detail = MigrationNotReversibleDetail.safeParse(error.details);
    if (detail.success) {
      return t('migration.errors.notReversible', {
        reason: t(`migration.blocker.${detail.data.reason}`),
        number: detail.data.number ?? '',
      });
    }
  }
  const key = ERRORS[error.code];
  return key ? t(key) : t('migration.errors.failed');
}

/** A batch that a sign-off may still cover: completed, not reversed, not signed. */
export const canSign = (b: MigrationReportBatch): boolean => !b.reversed && b.signoff_id === null;

/** The state of a batch as one word key. */
export function batchState(b: MigrationReportBatch): 'reversed' | 'signed' | 'open' {
  if (b.reversed) return 'reversed';
  if (b.signoff_id !== null) return 'signed';
  return 'open';
}

/** True when the entered amount is a non-negative number with at most two decimals. */
export const isAmount = (v: string): boolean => /^\d{1,16}(\.\d{1,2})?$/.test(v.trim());
