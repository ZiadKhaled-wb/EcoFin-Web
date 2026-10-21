import {
  dayCloseBlockers,
  type DayCloseIssue,
  type DayCloseIssueSeverity,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';

const ERRORS: Partial<Record<string, TranslationKey>> = {
  NOT_FOUND: 'dayClose.errors.notFound',
  BRANCH_NOT_FOUND: 'dayClose.errors.branchNotFound',
  BRANCH_DENIED: 'dayClose.errors.branchDenied',
  BRANCH_INACTIVE: 'dayClose.errors.branchDenied',
  PERMISSION_DENIED: 'dayClose.errors.permission',
  FUTURE_BUSINESS_DATE: 'dayClose.errors.future',
  DAY_CHANGED: 'dayClose.errors.changed',
  DAY_CLOSE_BLOCKED: 'dayClose.errors.blocked',
  NOTE_REQUIRED: 'dayClose.errors.noteRequired',
  DAY_ALREADY_CLOSED: 'dayClose.errors.alreadyClosed',
  DAY_NOT_CLOSED: 'dayClose.errors.notClosed',
  REASON_REQUIRED: 'dayClose.errors.reason',
  VALIDATION_FAILED: 'dayClose.errors.validation',
};

/** A translated message for a refused day-close call. */
export function dayCloseError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  return t(ERRORS[code] ?? 'dayClose.errors.failed');
}

/** The id of the stored close when the server says the day is already closed. */
export function alreadyClosedId(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== 'DAY_ALREADY_CLOSED') return null;
  const id = (err.details as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : null;
}

export const SEVERITY_TONE: Record<DayCloseIssueSeverity, 'danger' | 'warning' | 'neutral'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'neutral',
};

const DOCUMENTS = [
  'sale',
  'payment',
  'sales_return',
  'expense',
  'supplier_payment',
  'purchase_return',
  'cash_transfer',
] as const;
type DocumentKind = (typeof DOCUMENTS)[number];
const isDocument = (v: unknown): v is DocumentKind =>
  typeof v === 'string' && (DOCUMENTS as readonly string[]).includes(v);

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const money = (v: unknown) => {
  const s = str(v);
  return s === '' ? '' : formatMoney(s);
};
const count = (v: unknown) => formatNumber(Number(str(v) || 0));

/** An issue in words: the server sends the code and its values, the client says it. */
export function issueText(issue: DayCloseIssue): string {
  const p = issue.params;
  switch (issue.code) {
    case 'SHIFT_OPEN':
      return t('dayClose.issues.SHIFT_OPEN', {
        number: str(p['number']),
        cashier: str(p['cashier_name']),
      });
    case 'LEDGER_MISMATCH':
      return t('dayClose.issues.LEDGER_MISMATCH', {
        name: str(p['name']),
        cached: p['ledger'] === 'cash' ? money(p['cached']) : count(p['cached']),
        fromLedger: p['ledger'] === 'cash' ? money(p['from_ledger']) : count(p['from_ledger']),
      });
    case 'DOCUMENT_WITHOUT_LEDGER': {
      if (p['more'] !== undefined) {
        return t('dayClose.issues.DOCUMENT_WITHOUT_LEDGER_more', { count: count(p['more']) });
      }
      const document = isDocument(p['document'])
        ? t(`dayClose.documents.${p['document']}`)
        : str(p['document']);
      if (p['missing_document'] === true) {
        return t('dayClose.issues.DOCUMENT_WITHOUT_LEDGER_missing', {
          document,
          ledgerAmount: money(p['ledger_amount']),
        });
      }
      return t('dayClose.issues.DOCUMENT_WITHOUT_LEDGER', {
        document,
        number: str(p['number']),
        documentAmount: money(p['document_amount']),
        ledgerAmount: money(p['ledger_amount']),
      });
    }
    case 'ETA_NOT_ACCEPTED':
      return t('dayClose.issues.ETA_NOT_ACCEPTED', {
        accepted: count(p['accepted']),
        total: count(p['total']),
      });
    case 'DAY_DRIFT':
      return t('dayClose.issues.DAY_DRIFT');
    case 'SHIFT_DIFFERENCE':
      return t('dayClose.issues.SHIFT_DIFFERENCE', {
        number: str(p['number']),
        cashier: str(p['cashier_name']),
        difference: money(p['difference']),
        reason: str(p['reason']),
      });
    case 'WALLET_SHORTAGE':
      return t('dayClose.issues.WALLET_SHORTAGE', {
        number: str(p['number']),
        wallet: str(p['wallet_name']),
        shortage: money(p['shortage']),
        reason: str(p['reason']),
      });
    case 'EARLIER_DAY_OPEN':
      return t('dayClose.issues.EARLIER_DAY_OPEN', {
        count: count(p['count']),
        date: str(p['first_date']) ? formatBusinessDate(str(p['first_date'])) : '',
      });
  }
}

/** Where an issue's link goes; null when there is no page for it. */
export function issueHref(issue: DayCloseIssue, date: string): string | null {
  const link = issue.link;
  if (!link) return null;
  switch (link.kind) {
    case 'shift':
      return `/accounting/shifts/${link.id}`;
    case 'cash_account':
      return `/accounting/vaults/${link.id}`;
    case 'product':
      return '/inventory/stock';
    case 'sale':
      return `/sales/${link.id}`;
    case 'payment':
      return `/collections/${link.id}`;
    case 'expense':
      return '/accounting/expenses';
    case 'supplier_payment':
      return `/purchasing/payments/${link.id}`;
    case 'purchase_return':
      return `/purchasing/returns/${link.id}`;
    case 'sales_return':
    case 'cash_transfer':
      return null;
    case 'eta_monitor':
      return `/tax/eta-receipts?${new URLSearchParams({ branch_id: link.id, from: date, to: date }).toString()}`;
    case 'day_list':
      return `/accounting/day-close?branch_id=${link.id}`;
    case 'day_close':
      return `/accounting/day-close/closed/${link.id}`;
  }
}

/** Blocking first, then warnings, then notes; the server's order inside each. */
export function sortIssues(issues: readonly DayCloseIssue[]): DayCloseIssue[] {
  const rank: Record<DayCloseIssueSeverity, number> = { blocking: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The day page of a branch and business date. */
export const dayHref = (branchId: string, date: string) =>
  `/accounting/day-close/${branchId}/${date}`;

/** Blocking issues stop the close; the button is disabled with a hint. */
export const hasBlockers = (issues: readonly DayCloseIssue[]) =>
  dayCloseBlockers(issues).length > 0;

/** Today in the shop's time zone (the business date the server uses), not the browser's. */
export { shopToday } from '@/lib/format';
