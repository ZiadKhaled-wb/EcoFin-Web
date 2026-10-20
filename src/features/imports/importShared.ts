import {
  IMPORT_COLUMNS,
  ImportMissingColumnsDetail,
  importColumn,
  type ImportKind,
  type ImportRowError,
  type ImportRowErrorCode,
  type ImportStatus,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { getLanguage, t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';

/** Where the imported records can be seen afterwards. */
export const KIND_LINK: Record<ImportKind, string> = {
  suppliers: '/suppliers',
  products: '/inventory/products',
  customers: '/customers',
  opening_stock: '/inventory/stock',
};

export const STATUS_TONE: Record<ImportStatus, BadgeTone> = {
  uploaded: 'neutral',
  validating: 'neutral',
  validated: 'brand',
  importing: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

/** Statuses after which nothing changes any more (the polling stops). */
export const FINAL_STATUSES: readonly ImportStatus[] = ['completed', 'failed', 'cancelled'];

/** The label of a field of a kind, in the active language (the key itself if it is unknown). */
export function columnLabel(kind: ImportKind, key: string): string {
  const def = importColumn(kind, key);
  if (!def) return key;
  return getLanguage() === 'en' ? def.label_en : def.label_ar;
}

/** "sku|barcode" (a group of alternatives) as "SKU / Barcode". */
export function groupLabel(kind: ImportKind, group: string): string {
  return group
    .split('|')
    .map((k) => columnLabel(kind, k))
    .join(' / ');
}

/** The separator of a list in the active language (the Arabic comma in Arabic). */
export const listSeparator = () => (getLanguage() === 'ar' ? '، ' : ', ');

/** The fields of a kind that a file may fill, in the registry's order. */
export const fieldsOf = (kind: ImportKind) => IMPORT_COLUMNS[kind];

const ROW_ERRORS: Record<ImportRowErrorCode, TranslationKey> = {
  IMPORT_REQUIRED: 'imports.rowErrors.IMPORT_REQUIRED',
  IMPORT_INVALID_VALUE: 'imports.rowErrors.IMPORT_INVALID_VALUE',
  IMPORT_DUPLICATE_ROW: 'imports.rowErrors.IMPORT_DUPLICATE_ROW',
  IMPORT_AMBIGUOUS_MATCH: 'imports.rowErrors.IMPORT_AMBIGUOUS_MATCH',
  IMPORT_APPLY_FAILED: 'imports.rowErrors.IMPORT_APPLY_FAILED',
  PRODUCT_ARCHIVED: 'imports.rowErrors.PRODUCT_ARCHIVED',
  PRODUCT_NOT_FOUND: 'imports.rowErrors.PRODUCT_NOT_FOUND',
  PRODUCT_SKU_TAKEN: 'imports.rowErrors.PRODUCT_SKU_TAKEN',
  PRODUCT_BARCODE_TAKEN: 'imports.rowErrors.PRODUCT_BARCODE_TAKEN',
  PRODUCT_SERIAL_LOCKED: 'imports.rowErrors.PRODUCT_SERIAL_LOCKED',
  PRODUCT_CATEGORY_ARCHIVED: 'imports.rowErrors.PRODUCT_CATEGORY_ARCHIVED',
  CATEGORY_DEPTH: 'imports.rowErrors.CATEGORY_DEPTH',
  CATEGORY_NAME_TAKEN: 'imports.rowErrors.CATEGORY_NAME_TAKEN',
  CUSTOMER_NATIONAL_ID_TAKEN: 'imports.rowErrors.CUSTOMER_NATIONAL_ID_TAKEN',
  CUSTOMER_NATIONAL_ID_LOCKED: 'imports.rowErrors.CUSTOMER_NATIONAL_ID_LOCKED',
  NATIONAL_ID_INVALID: 'imports.rowErrors.NATIONAL_ID_INVALID',
  SUPPLIER_PHONE_TAKEN: 'imports.rowErrors.SUPPLIER_PHONE_TAKEN',
  SUPPLIER_NAME_TAKEN: 'imports.rowErrors.SUPPLIER_NAME_TAKEN',
  SERIAL_INVALID: 'imports.rowErrors.SERIAL_INVALID',
  SERIAL_TAKEN: 'imports.rowErrors.SERIAL_TAKEN',
  UNIT_NOT_ALLOWED: 'imports.rowErrors.UNIT_NOT_ALLOWED',
  UNIT_REQUIRED: 'imports.rowErrors.UNIT_REQUIRED',
  OPENING_STOCK_LOCKED: 'imports.rowErrors.OPENING_STOCK_LOCKED',
  TAX_CLASS_NOT_FOUND: 'imports.rowErrors.TAX_CLASS_NOT_FOUND',
  MODULE_NOT_IN_PLAN: 'imports.rowErrors.MODULE_NOT_IN_PLAN',
  OUT_OF_STOCK: 'imports.rowErrors.OUT_OF_STOCK',
};

/** A row error in the active language. A repeated row names the first one ("same ... as row 4"). */
export function rowErrorText(error: Pick<ImportRowError, 'code' | 'message'>): string {
  const first = /row (\d+)/.exec(error.message)?.[1] ?? '';
  return t(ROW_ERRORS[error.code], { row: first });
}

const API_ERRORS: Partial<Record<string, TranslationKey>> = {
  IMPORT_FILE_UNREADABLE: 'imports.errors.IMPORT_FILE_UNREADABLE',
  IMPORT_MAPPING_INVALID: 'imports.errors.IMPORT_MAPPING_INVALID',
  IMPORT_TOO_MANY_ROWS: 'imports.errors.IMPORT_TOO_MANY_ROWS',
  IMPORT_SHEET_NOT_FOUND: 'imports.errors.IMPORT_SHEET_NOT_FOUND',
  IMPORT_NOT_VALIDATED: 'imports.errors.IMPORT_NOT_VALIDATED',
  IMPORT_JOB_NOT_FOUND: 'imports.errors.IMPORT_JOB_NOT_FOUND',
  FILE_NOT_FOUND: 'imports.errors.FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'imports.errors.FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'imports.errors.FILE_TYPE_NOT_ALLOWED',
  PERMISSION_DENIED: 'imports.errors.PERMISSION_DENIED',
  SUBSCRIPTION_EXPIRED: 'imports.errors.SUBSCRIPTION_EXPIRED',
  MODULE_NOT_IN_PLAN: 'imports.errors.MODULE_NOT_IN_PLAN',
  BRANCH_DENIED: 'imports.errors.BRANCH_DENIED',
  BRANCH_INACTIVE: 'imports.errors.BRANCH_DENIED',
};

/** An API error in the active language; the file's missing columns are named. */
export function apiErrorText(error: unknown, kind?: ImportKind): string {
  if (!(error instanceof ApiError)) return t('imports.errors.failed');
  if (error.code === 'IMPORT_MISSING_COLUMNS') {
    const detail = ImportMissingColumnsDetail.safeParse(error.details);
    const names = detail.success
      ? detail.data.columns.map((c) => (kind ? groupLabel(kind, c) : c)).join(listSeparator())
      : '';
    return t('imports.errors.IMPORT_MISSING_COLUMNS', { columns: names });
  }
  const key = API_ERRORS[error.code];
  return key ? t(key) : t('imports.errors.failed');
}

/** Saves a Blob as a file (the template). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
