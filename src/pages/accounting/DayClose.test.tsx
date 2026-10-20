import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  DayClose,
  DayCloseIssue,
  DayClosePreview,
  DayCloseTotals,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { dayClosesApi } from '@/services/dayClosesApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import DayClosePage from './DayClosePage';
import DayClosesPage from './DayClosesPage';
import { dayCloseError, issueHref, issueText, shopToday } from './dayCloseShared';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0400000-0000-4000-8000-000000000001';
const SHIFT = 'a0400000-0000-4000-8000-000000000002';
const CLOSE = 'a0400000-0000-4000-8000-000000000003';
const SAFE = 'a0400000-0000-4000-8000-000000000004';
const DAY = '2026-10-20';
const ts = '2026-10-20T20:00:00.000Z';
const HASH = '0123456789abcdef0123456789abcdef';
const zeros = { cash: '0.00', bank_transfer: '0.00', store_credit: '0.00' };
const ct = { count: 0, total: '0.00' };

const totals: DayCloseTotals = {
  sales: {
    count: 2,
    total: '800.00',
    discount_total: '0.00',
    tax_total: '98.25',
    paid_by_method: { cash: '500.00', bank_transfer: '300.00', store_credit: '0.00' },
    on_contract: '0.00',
    voided: ct,
  },
  returns: { count: 0, total: '0.00', refunded_by_method: zeros },
  collections: {
    count: 1,
    total: '1000.00',
    principal: '833.33',
    profit: '166.67',
    by_method: { ...zeros, cash: '1000.00' },
    in_field: '0.00',
    reversed: ct,
  },
  expenses: {
    count: 1,
    total: '150.00',
    by_category: [{ category_id: SAFE, name: 'Rent', total: '150.00' }],
    reversed: ct,
  },
  supplier_payments: { ...ct, reversed: ct },
  supplier_refunds: ct,
  cash: {
    accounts: [
      {
        account: { id: SAFE, name: 'Main safe', kind: 'safe', shop_wide: false },
        opening: '1000.00',
        in: '1500.00',
        out: '150.00',
        closing: '2350.00',
        by_type: { sale: '500.00', collection: '1000.00', expense: '-150.00' },
      },
    ],
    total_closing_cash: '2350.00',
  },
  shifts: { items: [], difference_total: '0.00' },
  eta: null,
};
const warning: DayCloseIssue = {
  code: 'ETA_NOT_ACCEPTED',
  severity: 'warning',
  params: { accepted: 1, total: 3, waiting: 2 },
  link: { kind: 'eta_monitor', id: MAIN },
};
const blocking: DayCloseIssue = {
  code: 'SHIFT_OPEN',
  severity: 'blocking',
  params: { number: 'MAIN-SH-26-000002', cashier_name: 'Mona' },
  link: { kind: 'shift', id: SHIFT },
};
const preview = (over: Partial<DayClosePreview> = {}): DayClosePreview => ({
  branch_id: MAIN,
  branch_name: 'Main',
  business_date: DAY,
  status: 'open',
  is_today: true,
  totals,
  issues: [],
  hash: HASH,
  last_close: null,
  ...over,
});
const stored = (over: Partial<DayClose> = {}): DayClose => ({
  id: CLOSE,
  branch_id: MAIN,
  branch_name: 'Main',
  business_date: DAY,
  status: 'closed',
  totals,
  issues: [],
  note: 'ETA down',
  closed_by: { id: SHIFT, name: 'Owner' },
  closed_at: ts,
  reopened_by: null,
  reopened_at: null,
  reopen_reason: null,
  drift: false,
  ...over,
});
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const routes = (
  <Routes>
    <Route path="/accounting/day-close" element={<DayClosesPage />} />
    <Route path="/accounting/day-close/closed/:id" element={<DayClosePage />} />
    <Route path="/accounting/day-close/:branchId/:date" element={<DayClosePage />} />
  </Routes>
);

describe('K04 day close', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['day.close', 'cash.view']);
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the server numbers and closes with the hash; warnings need a note', async () => {
    vi.spyOn(dayClosesApi, 'preview').mockResolvedValue(preview({ issues: [warning] }));
    const close = vi.spyOn(dayClosesApi, 'close').mockResolvedValue(stored());
    vi.spyOn(dayClosesApi, 'get').mockResolvedValue(stored());
    await renderApp(routes, { lang: 'en', route: `/accounting/day-close/${MAIN}/${DAY}` });
    const user = userEvent.setup();
    expect(await screen.findByText('Main safe')).toBeInTheDocument();
    expect(screen.getByText(/ETA has accepted 1 of the day's 3 receipts/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      `/tax/eta-receipts?branch_id=${MAIN}&from=${DAY}&to=${DAY}`,
    );
    await user.click(screen.getByRole('button', { name: 'Close the day' }));
    expect(await screen.findByText(/no more sales, payments or expenses/)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await user.click(dialog.querySelector('button[type="submit"]')!);
    expect(await screen.findByText('Write a note of at least 3 characters.')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Note/), 'ETA down');
    await user.dblClick(dialog.querySelector('button[type="submit"]')!);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(close.mock.calls[0]![0]).toEqual({
      branch_id: MAIN,
      business_date: DAY,
      preview_hash: HASH,
      note: 'ETA down',
    });
  });

  it('a blocking issue disables the close and links its cause', async () => {
    vi.spyOn(dayClosesApi, 'preview').mockResolvedValue(preview({ issues: [blocking, warning] }));
    await renderApp(routes, { lang: 'ar', route: `/accounting/day-close/${MAIN}/${DAY}` });
    expect(await screen.findByRole('button', { name: 'إقفال اليوم' })).toBeDisabled();
    expect(screen.getByText('عالج المشكلات المانعة قبل إقفال اليوم.')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'فتح' });
    expect(links[0]).toHaveAttribute('href', `/accounting/shifts/${SHIFT}`);
  });

  it('DAY_CHANGED reloads the preview instead of closing', async () => {
    const load = vi.spyOn(dayClosesApi, 'preview').mockResolvedValue(preview({ is_today: false }));
    vi.spyOn(dayClosesApi, 'close').mockRejectedValue(
      new ApiError(409, 'DAY_CHANGED', 'Day changed.'),
    );
    await renderApp(routes, { lang: 'en', route: `/accounting/day-close/${MAIN}/${DAY}` });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Close the day' }));
    const dialog = screen.getByRole('dialog');
    await user.click(dialog.querySelector('button[type="submit"]')!);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a closed day shows its snapshot; drift is announced; reopen needs day.reopen', async () => {
    const closed = new ApiError(409, 'DAY_ALREADY_CLOSED', 'Closed.');
    closed.details = { id: CLOSE };
    vi.spyOn(dayClosesApi, 'preview').mockRejectedValue(closed);
    vi.spyOn(dayClosesApi, 'get').mockResolvedValue(stored({ drift: true }));
    await renderApp(routes, { lang: 'en', route: `/accounting/day-close/${MAIN}/${DAY}` });
    expect(await screen.findByText(/no longer match its ledgers/)).toBeInTheDocument();
    expect(screen.getByText('ETA down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen the day' })).not.toBeInTheDocument();
  });

  it('the owner reopens with a reason', async () => {
    setPermissions(['day.close', 'day.reopen', 'cash.view']);
    vi.spyOn(dayClosesApi, 'get').mockResolvedValue(stored());
    const reopen = vi
      .spyOn(dayClosesApi, 'reopen')
      .mockResolvedValue(stored({ status: 'reopened' }));
    vi.spyOn(dayClosesApi, 'preview').mockResolvedValue(preview({ status: 'reopened' }));
    await renderApp(routes, { lang: 'en', route: `/accounting/day-close/closed/${CLOSE}` });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reopen the day' }));
    const dialog = screen.getByRole('dialog');
    await user.type(screen.getByLabelText(/Reason/), 'ab');
    await user.click(dialog.querySelector('button[type="submit"]')!);
    expect(await screen.findByText('Write a reason of 3 to 500 characters.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason/), 'c late receipt');
    await user.click(dialog.querySelector('button[type="submit"]')!);
    await waitFor(() => expect(reopen).toHaveBeenCalledWith(CLOSE, { reason: 'abc late receipt' }));
  });

  it('the day picker starts on the shop today and opens it', async () => {
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(dayClosesApi, 'list').mockResolvedValue({ items: [], from: DAY, to: DAY });
    const load = vi.spyOn(dayClosesApi, 'preview').mockResolvedValue(preview());
    const today = shopToday('Africa/Cairo');
    await renderApp(routes, { lang: 'en', route: '/accounting/day-close' });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Show the day' });
    // The first date field is the picker (the list filters come after it).
    await waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe(today),
    );
    await user.click(screen.getByRole('button', { name: 'Show the day' }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(MAIN, today));
  });

  it('the list shows days with their status and links to them', async () => {
    vi.spyOn(dayClosesApi, 'list').mockResolvedValue({
      items: [
        {
          branch_id: MAIN,
          branch_name: 'Main',
          business_date: DAY,
          status: 'closed',
          id: CLOSE,
          closed_by_name: 'Owner',
          closed_at: ts,
          sales_total: '800.00',
          issues_count: 1,
        },
      ],
      from: '2026-09-21',
      to: DAY,
    });
    await renderApp(routes, { lang: 'en', route: '/accounting/day-close' });
    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link')
        .some((l) => l.getAttribute('href') === `/accounting/day-close/${MAIN}/${DAY}`),
    ).toBe(true);
  });
});

describe('K04 issue words and links', () => {
  beforeEach(() => signIn());
  afterEach(() => signOut());

  it('says each issue with formatted amounts and links its cause', async () => {
    await renderApp(<div />, { lang: 'en' });
    expect(
      issueText({
        code: 'DOCUMENT_WITHOUT_LEDGER',
        severity: 'warning',
        params: {
          document: 'expense',
          number: 'EX-1',
          missing_document: false,
          document_amount: '-33.00',
          ledger_amount: '0.00',
        },
        link: { kind: 'expense', id: CLOSE },
      }),
    ).toMatch(/^The expense EX-1 says .*33.* but the cash ledger has .*0.*\.$/);
    expect(
      issueText({
        code: 'DOCUMENT_WITHOUT_LEDGER',
        severity: 'warning',
        params: { more: 7 },
        link: null,
      }),
    ).toBe("And 7 more documents that don't match.");
    expect(issueHref(blocking, DAY)).toBe(`/accounting/shifts/${SHIFT}`);
    expect(
      issueHref(
        {
          code: 'DAY_DRIFT',
          severity: 'warning',
          params: {},
          link: { kind: 'day_close', id: CLOSE },
        },
        DAY,
      ),
    ).toBe(`/accounting/day-close/closed/${CLOSE}`);
    expect(dayCloseError(new ApiError(422, 'NOTE_REQUIRED', 'x'))).toBe(
      'The day has warnings: write a note.',
    );
    expect(dayCloseError(new Error('boom'))).toBe('Something went wrong. Try again.');
    // A UTC evening is already the next day in Cairo (the CI runner's browser is in UTC).
    expect(shopToday('Africa/Cairo', new Date('2026-10-20T22:30:00Z'))).toBe('2026-10-21');
    expect(shopToday('UTC', new Date('2026-10-20T22:30:00Z'))).toBe('2026-10-20');
  });
});
