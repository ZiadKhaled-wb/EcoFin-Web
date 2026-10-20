import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloseDayBody,
  ReopenDayBody,
  dayCloseNeedsNote,
  type DayClose,
  type DayCloseIssue,
  type DayClosePreview,
  type DayCloseTotals,
} from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { dayCloseKeys, dayClosesApi } from '@/services/dayClosesApi';
import { useAuthStore } from '@/store/authStore';
import { directionOf, getLanguage, t, type TranslationKey } from '@/i18n';
import { SEVERITY_TONE, dayCloseError, issueHref, issueText, sortIssues } from './dayCloseShared';

const MOVEMENT_TYPES = new Set([
  'float_in',
  'float_out',
  'sale',
  'refund',
  'deposit',
  'collection',
  'supplier_payment',
  'supplier_refund',
  'expense',
  'transfer_in',
  'transfer_out',
  'settlement',
  'adjustment',
  'opening',
]);
const movementLabel = (type: string) =>
  MOVEMENT_TYPES.has(type) ? t(`dayClose.movementTypes.${type}` as TranslationKey) : type;

/** A label and a money amount from the server, side by side. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="type-body">{label}</dt>
      <dd className={strong ? 'num type-section-title' : 'num'}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title} className="break-inside-avoid">
      <dl className="divide-y divide-line">{children}</dl>
    </Card>
  );
}

const m = formatMoney;
const n = (v: number) => formatNumber(v);

/** The day's numbers, in sections. Every amount is the server's; nothing is added up here. */
export function DayTotals({ totals }: { totals: DayCloseTotals }) {
  const { sales, returns, collections, expenses, cash, shifts, eta } = totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('dayClose.sections.sales')}>
          <Row label={t('dayClose.fields.count')} value={n(sales.count)} />
          <Row label={t('dayClose.fields.total')} value={m(sales.total)} strong />
          <Row label={t('dayClose.fields.cash')} value={m(sales.paid_by_method.cash)} />
          <Row
            label={t('dayClose.fields.bankTransfer')}
            value={m(sales.paid_by_method.bank_transfer)}
          />
          <Row
            label={t('dayClose.fields.storeCredit')}
            value={m(sales.paid_by_method.store_credit)}
          />
          <Row label={t('dayClose.fields.onContract')} value={m(sales.on_contract)} />
          <Row label={t('dayClose.fields.discount')} value={m(sales.discount_total)} />
          <Row label={t('dayClose.fields.tax')} value={m(sales.tax_total)} />
          <Row
            label={`${t('dayClose.fields.voided')} (${n(sales.voided.count)})`}
            value={m(sales.voided.total)}
          />
        </Section>
        <Section title={t('dayClose.sections.collections')}>
          <Row label={t('dayClose.fields.count')} value={n(collections.count)} />
          <Row label={t('dayClose.fields.total')} value={m(collections.total)} strong />
          <Row label={t('dayClose.fields.principal')} value={m(collections.principal)} />
          <Row label={t('dayClose.fields.profit')} value={m(collections.profit)} />
          <Row label={t('dayClose.fields.cash')} value={m(collections.by_method.cash)} />
          <Row
            label={t('dayClose.fields.bankTransfer')}
            value={m(collections.by_method.bank_transfer)}
          />
          <Row label={t('dayClose.fields.inField')} value={m(collections.in_field)} />
          <Row
            label={`${t('dayClose.fields.reversed')} (${n(collections.reversed.count)})`}
            value={m(collections.reversed.total)}
          />
        </Section>
        <Section title={t('dayClose.sections.expenses')}>
          <Row label={t('dayClose.fields.count')} value={n(expenses.count)} />
          <Row label={t('dayClose.fields.total')} value={m(expenses.total)} strong />
          {expenses.by_category.map((c) => (
            <Row key={c.category_id} label={c.name} value={m(c.total)} />
          ))}
          <Row
            label={`${t('dayClose.fields.reversed')} (${n(expenses.reversed.count)})`}
            value={m(expenses.reversed.total)}
          />
        </Section>
        <Section title={t('dayClose.sections.returns')}>
          <Row label={t('dayClose.fields.count')} value={n(returns.count)} />
          <Row label={t('dayClose.fields.total')} value={m(returns.total)} strong />
          <Row
            label={`${t('dayClose.fields.refunded')} · ${t('dayClose.fields.cash')}`}
            value={m(returns.refunded_by_method.cash)}
          />
          <Row
            label={`${t('dayClose.fields.refunded')} · ${t('dayClose.fields.bankTransfer')}`}
            value={m(returns.refunded_by_method.bank_transfer)}
          />
          <Row
            label={`${t('dayClose.fields.supplierPayments')} (${n(totals.supplier_payments.count)})`}
            value={m(totals.supplier_payments.total)}
          />
          <Row
            label={`${t('dayClose.fields.supplierRefunds')} (${n(totals.supplier_refunds.count)})`}
            value={m(totals.supplier_refunds.total)}
          />
        </Section>
      </div>

      <Card title={t('dayClose.sections.cash')} padded={false} className="break-inside-avoid">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-start">
                <th className="px-4 py-2 text-start">{t('dayClose.fields.account')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.opening')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.in')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.out')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.closing')}</th>
                <th className="px-4 py-2 text-start">{t('dayClose.fields.byType')}</th>
              </tr>
            </thead>
            <tbody>
              {cash.accounts.map((a) => (
                <tr key={a.account.id} className="border-b border-line align-top">
                  <td className="px-4 py-2">
                    <div>{a.account.name}</div>
                    <div className="type-caption">
                      {t(`dayClose.kinds.${a.account.kind}`)}
                      {a.account.shop_wide ? ` · ${t('dayClose.fields.shopWide')}` : ''}
                    </div>
                  </td>
                  <td className="num px-4 py-2 text-end">{a.opening ? m(a.opening) : ''}</td>
                  <td className="num px-4 py-2 text-end">{m(a.in)}</td>
                  <td className="num px-4 py-2 text-end">{m(a.out)}</td>
                  <td className="num px-4 py-2 text-end">{a.closing ? m(a.closing) : ''}</td>
                  <td className="px-4 py-2">
                    <ul className="type-caption space-y-0.5">
                      {Object.entries(a.by_type).map(([type, amount]) => (
                        <li key={type} className="flex justify-between gap-3">
                          <span>{movementLabel(type)}</span>
                          <span className="num">{m(amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="border-t border-line px-5 py-3">
          <Row
            label={t('dayClose.fields.totalClosingCash')}
            value={m(cash.total_closing_cash)}
            strong
          />
        </dl>
      </Card>

      <Card title={t('dayClose.sections.shifts')} padded={false} className="break-inside-avoid">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-start">{t('dayClose.fields.number')}</th>
                <th className="px-4 py-2 text-start">{t('dayClose.fields.cashier')}</th>
                <th className="px-4 py-2 text-start">{t('dayClose.fields.opened')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.expected')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.counted')}</th>
                <th className="px-4 py-2 text-end">{t('dayClose.fields.difference')}</th>
                <th className="px-4 py-2 text-start">{t('dayClose.fields.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.items.map((s) => (
                <tr key={s.id} className="border-b border-line">
                  <td className="px-4 py-2">
                    <Link
                      to={`/accounting/shifts/${s.id}`}
                      className="text-brand-700 hover:underline"
                      dir="ltr"
                    >
                      {s.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.cashier.name}</td>
                  <td className="px-4 py-2">{formatDateTime(s.opened_at)}</td>
                  <td className="num px-4 py-2 text-end">{m(s.expected)}</td>
                  <td className="num px-4 py-2 text-end">
                    {s.counted ? m(s.counted) : t('dayClose.fields.stillOpen')}
                  </td>
                  <td className="num px-4 py-2 text-end">{s.difference ? m(s.difference) : ''}</td>
                  <td className="px-4 py-2">{s.difference_reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="border-t border-line px-5 py-3">
          <Row label={t('dayClose.fields.differenceTotal')} value={m(shifts.difference_total)} />
        </dl>
      </Card>

      <Section title={t('dayClose.sections.eta')}>
        {eta === null ? (
          <p className="type-body py-1">{t('dayClose.fields.noEta')}</p>
        ) : (
          <>
            <Row label={t('dayClose.fields.total')} value={n(eta.total)} />
            <Row label={t('dayClose.fields.accepted')} value={n(eta.accepted)} />
            <Row label={t('dayClose.fields.waiting')} value={n(eta.waiting)} />
            <Row label={t('dayClose.fields.rejected')} value={n(eta.rejected)} />
            <Row label={t('dayClose.fields.sendFailed')} value={n(eta.send_failed)} />
            <Row label={t('dayClose.fields.blocked')} value={n(eta.blocked)} />
            <Row label={t('dayClose.fields.cancelled')} value={n(eta.cancelled)} />
          </>
        )}
      </Section>
    </div>
  );
}

/** The day's problems and notes, each with a link to its cause. */
export function IssuesList({
  issues,
  date,
  links = true,
}: {
  issues: readonly DayCloseIssue[];
  date: string;
  links?: boolean;
}) {
  if (issues.length === 0) return <Notice tone="success">{t('dayClose.issues.none')}</Notice>;
  return (
    <ul className="divide-y divide-line" aria-label={t('dayClose.issues.title')}>
      {sortIssues(issues).map((issue, i) => {
        const href = links ? issueHref(issue, date) : null;
        return (
          <li
            key={`${issue.code}-${issue.link?.id ?? ''}-${i}`}
            className="flex flex-wrap items-start gap-3 py-2"
            data-issue={issue.code}
          >
            <Badge tone={SEVERITY_TONE[issue.severity]}>
              {t(`dayClose.issues.severity.${issue.severity}`)}
            </Badge>
            <span className="type-body min-w-0 flex-1">{issueText(issue)}</span>
            {href && (
              <Link to={href} className="text-brand-700 hover:underline">
                {t('dayClose.issues.open')}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Close the day: warnings need a note; the preview's hash goes back unchanged. */
export function CloseDayDialog({
  preview,
  onClose,
  onChanged,
  onClosed,
}: {
  preview: DayClosePreview;
  onClose: () => void;
  /** DAY_CHANGED: the page reloads the preview. */
  onChanged: () => void;
  onClosed: (close: DayClose) => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);
  const needsNote = dayCloseNeedsNote(preview.issues);
  const warnings = preview.issues.filter((i) => i.severity === 'warning').length;

  async function submit() {
    if (posting.current) return;
    setError('');
    setNoteError('');
    const trimmed = note.trim();
    if (needsNote && trimmed.length < 3) {
      setNoteError(t('dayClose.close.noteRequired'));
      return;
    }
    const parsed = CloseDayBody.safeParse({
      branch_id: preview.branch_id,
      business_date: preview.business_date,
      preview_hash: preview.hash,
      ...(trimmed ? { note: trimmed } : {}),
    });
    if (!parsed.success) {
      setNoteError(t('dayClose.close.noteRequired'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const closed = await dayClosesApi.close(parsed.data);
      await cache.invalidateQueries({ queryKey: dayCloseKeys.all(orgId) });
      notify.success(t('dayClose.close.done'));
      onClosed(closed);
    } catch (err) {
      posting.current = false;
      setBusy(false);
      if (err instanceof ApiError && err.code === 'DAY_CHANGED') {
        notify.error(t('dayClose.close.changed'));
        onChanged();
        return;
      }
      setError(dayCloseError(err));
    }
  }

  return (
    <Dialog
      open
      title={t('dayClose.close.title')}
      description={t('dayClose.close.description')}
      onOpenChange={(open) => !open && onClose()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        {preview.is_today && <Notice tone="error">{t('dayClose.close.today')}</Notice>}
        {needsNote && (
          <Notice tone="info">{t('dayClose.close.warnings', { count: n(warnings) })}</Notice>
        )}
        <Textarea
          label={t('dayClose.close.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={needsNote}
          maxLength={500}
          error={noteError || undefined}
        />
        <FormError message={error} />
        <Button type="submit" variant="danger" loading={busy} disabled={busy}>
          {t('dayClose.close.confirm')}
        </Button>
      </form>
    </Dialog>
  );
}

/** Reopen a closed day (day.reopen): a reason of 3 to 500 characters. */
export function ReopenDayDialog({
  close,
  onClose,
  onReopened,
}: {
  close: DayClose;
  onClose: () => void;
  onReopened: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);

  async function submit() {
    if (posting.current) return;
    setError('');
    setReasonError('');
    const parsed = ReopenDayBody.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(t('dayClose.reopen.reasonRequired'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      await dayClosesApi.reopen(close.id, parsed.data);
      await cache.invalidateQueries({ queryKey: dayCloseKeys.all(orgId) });
      notify.success(t('dayClose.reopen.done'));
      onReopened();
    } catch (err) {
      posting.current = false;
      setBusy(false);
      setError(dayCloseError(err));
    }
  }

  return (
    <Dialog
      open
      title={t('dayClose.reopen.title')}
      description={t('dayClose.reopen.description')}
      onOpenChange={(open) => !open && onClose()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Textarea
          label={t('dayClose.reopen.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          error={reasonError || undefined}
        />
        <FormError message={error} />
        <Button type="submit" loading={busy} disabled={busy}>
          {t('dayClose.reopen.confirm')}
        </Button>
      </form>
    </Dialog>
  );
}

/** The stored close on paper (A4, the browser's print): drawn only while printing. */
export function DayClosePrint({ close, onDone }: { close: DayClose; onDone: () => void }) {
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [onDone]);
  return createPortal(
    <div className="print-root day-close-print p-6" dir={directionOf(getLanguage())}>
      <h1 className="type-page-title mb-2">
        {t('dayClose.view.printTitle', {
          branch: close.branch_name,
          date: formatBusinessDate(close.business_date),
        })}
      </h1>
      <p className="type-caption mb-4">
        {t('dayClose.view.closedBy', {
          name: close.closed_by.name ?? '',
          at: formatDateTime(close.closed_at),
        })}
        {close.note ? ` · ${t('dayClose.view.note')}: ${close.note}` : ''}
      </p>
      <DayTotals totals={close.totals} />
      <h2 className="type-section-title mb-2 mt-4">{t('dayClose.issues.title')}</h2>
      <IssuesList issues={close.issues} date={close.business_date} links={false} />
    </div>,
    document.body,
  );
}
