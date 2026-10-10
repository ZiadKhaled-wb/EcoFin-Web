import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey, Shift } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { shiftsApi } from '@/services/shiftsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import ShiftsPage from './ShiftsPage';
import ShiftPage from './ShiftPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0600000-0000-4000-8000-000000000001';
const SAFE = 'a0600000-0000-4000-8000-000000000002';
const SHIFT = 'a0600000-0000-4000-8000-000000000003';
const ts = '2026-10-11T08:00:00.000Z';

const shift = (over: Partial<Shift> = {}): Shift => ({
  id: SHIFT,
  number: 'MAIN-SH-26-000001',
  branch_id: MAIN,
  device_id: null,
  device_name: null,
  employee_id: SAFE,
  employee_name: 'Mona Cashier',
  drawer_account_id: MAIN,
  status: 'open',
  opening_float: '500.00',
  opened_at: ts,
  closed_at: null,
  closed_by_name: null,
  expected_cash: '650.00',
  counted_cash: null,
  difference: null,
  count_breakdown: null,
  difference_reason: null,
  movements: [
    {
      id: 'a0600000-0000-4000-8000-000000000011',
      created_at: ts,
      type: 'float_in',
      amount: '500.00',
      source_type: 'cash_transfer',
      source_number: 'MAIN-CX-26-000001',
      note: null,
    },
    {
      id: 'a0600000-0000-4000-8000-000000000012',
      created_at: ts,
      type: 'sale',
      amount: '150.00',
      source_type: 'sale',
      source_number: null,
      note: null,
    },
  ],
  ...over,
});
const summary = (over: Partial<Shift> = {}) => {
  const { movements, ...rest } = shift(over);
  void movements;
  return rest;
};
const closedShift = () =>
  shift({
    status: 'closed',
    closed_at: ts,
    closed_by_name: 'Mona Cashier',
    counted_cash: '640.00',
    difference: '-10.00',
    count_breakdown: { '200': 3, '20': 2 },
    difference_reason: 'Ten pounds short',
  });
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const detail = (
  <Routes>
    <Route path="/accounting/shifts/:id" element={<ShiftPage />} />
  </Routes>
);

describe('K02 shifts', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['shift.operate']);
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
    vi.spyOn(shiftsApi, 'vaults').mockResolvedValue([{ id: SAFE, name: 'Main safe' }]);
    vi.spyOn(shiftsApi, 'list').mockResolvedValue({
      items: [summary({ ...closedShift(), id: SAFE, movements: [] })],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(shift());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('with no open shift the cashier opens one in Arabic; a float needs a safe; one request', async () => {
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    const open = vi
      .spyOn(shiftsApi, 'open')
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(shift()), 50)));
    await renderApp(<ShiftsPage />, { lang: 'ar' });
    const user = userEvent.setup();
    expect(await screen.findByText('لا توجد وردية مفتوحة لك.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('عهدة البداية'), '500');
    await user.click(screen.getByRole('button', { name: 'فتح الوردية' }));
    expect(await screen.findByText('اختر الخزنة التي تؤخذ منها العهدة.')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    const vault = screen.getByLabelText('الخزنة');
    await waitFor(() => expect(vault.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
    await user.selectOptions(vault, SAFE);
    await user.dblClick(screen.getByRole('button', { name: 'فتح الوردية' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const [body, key] = open.mock.calls[0]!;
    expect(body).toMatchObject({ branch_id: MAIN, vault_id: SAFE });
    expect(Number(body.opening_float)).toBe(500);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no float opens with 0 and no safe', async () => {
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    const open = vi.spyOn(shiftsApi, 'open').mockResolvedValue(shift());
    await renderApp(<ShiftsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open shift' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0]![0]).toEqual({ branch_id: MAIN, opening_float: '0' });
  });

  it('an open shift shows the cash it should hold and its drawer movements', async () => {
    await renderApp(<ShiftsPage />, { lang: 'en' });
    expect(await screen.findByTestId('shift-expected')).toHaveTextContent('650.00');
    const table = screen.getByRole('table', { name: t('cash.shifts.current.movements') });
    expect(within(table).getByText('Cash in from the safe')).toBeInTheDocument();
    expect(within(table).getByText('MAIN-CX-26-000001')).toBeInTheDocument();
    expect(within(table).getByText('Sale')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open shift' })).not.toBeInTheDocument();
  });

  it('cash out needs an amount, a safe and a note, then sends them once', async () => {
    const cash = vi.spyOn(shiftsApi, 'cash').mockResolvedValue(shift({ expected_cash: '450.00' }));
    await renderApp(<ShiftsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cash out' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter an amount above 0.')).toBeInTheDocument();
    expect(within(dialog).getByText('Write a note of 3 to 500 characters.')).toBeInTheDocument();
    expect(cash).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Amount'), '200');
    const vault = within(dialog).getByLabelText('Safe');
    await waitFor(() => expect(vault.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
    await user.selectOptions(vault, SAFE);
    await user.type(within(dialog).getByLabelText('Note'), '  Too much in the till ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(cash).toHaveBeenCalledTimes(1));
    const [id, body] = cash.mock.calls[0]!;
    expect(id).toBe(SHIFT);
    expect(body).toMatchObject({ direction: 'out', vault_id: SAFE, note: 'Too much in the till' });
    expect(Number(body.amount)).toBe(200);
  });

  it('closing counts by denomination, shows the difference and needs a reason and a safe', async () => {
    const close = vi.spyOn(shiftsApi, 'close').mockResolvedValue(closedShift());
    await renderApp(<ShiftsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Close shift' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('How many 200'), '3');
    await user.type(within(dialog).getByLabelText('How many 20'), '2');
    expect(within(dialog).getByTestId('shift-counted')).toHaveTextContent('640.00');
    expect(within(dialog).getByTestId('shift-difference')).toHaveTextContent('-10.00');
    await user.click(within(dialog).getByRole('button', { name: 'Close shift' }));
    expect(
      await within(dialog).findByText(t('cash.shifts.close.reasonRequired')),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(t('cash.shifts.close.vaultRequired'))).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Reason for the difference'), 'Ten pounds short');
    const vault = within(dialog).getByLabelText('Safe the cash goes to');
    await waitFor(() => expect(vault.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
    await user.selectOptions(vault, SAFE);
    await user.click(within(dialog).getByRole('button', { name: 'Close shift' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(close.mock.calls[0]).toEqual([
      SHIFT,
      { counts: { '200': 3, '20': 2 }, vault_id: SAFE, difference_reason: 'Ten pounds short' },
    ]);
  }, 20_000);

  it('an exact count needs no reason; the server refusal shows expected and counted', async () => {
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(
      shift({ expected_cash: '0.00', movements: [] }),
    );
    const close = vi.spyOn(shiftsApi, 'close').mockRejectedValue(
      Object.assign(new ApiError(400, 'SHIFT_DIFFERENCE_REASON_REQUIRED', 'Reason.'), {
        details: { expected: '150.00', counted: '0.00', difference: '-150.00' },
      }),
    );
    await renderApp(<ShiftsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Close shift' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Reason for the difference')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close shift' }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(SHIFT, { counts: {} }));
    // A sale came in between: the server names what it expected.
    expect(
      await within(dialog).findByText(
        'Expected 150.00 EGP, counted 0.00 EGP: write a reason for the difference.',
      ),
    ).toBeInTheDocument();
  });

  it('the history lists shifts with expected, counted and difference; a reader has no "My shift"', async () => {
    setPermissions(['cash.view']);
    const current = vi.spyOn(shiftsApi, 'current');
    await renderApp(<ShiftsPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: 'Shift history' });
    const row = await within(table).findByRole('row', { name: /MAIN-SH-26-000001/ });
    expect(within(row).getByText('Mona Cashier')).toBeInTheDocument();
    expect(within(row).getByText('Closed')).toBeInTheDocument();
    expect(within(row).getByText('-10.00 EGP')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-SH-26-000001' })).toHaveAttribute(
      'href',
      `/accounting/shifts/${SAFE}`,
    );
    expect(screen.queryByText(t('cash.shifts.mine'))).not.toBeInTheDocument();
    expect(current).not.toHaveBeenCalled();
  });

  it('the detail shows a closed shift with its count; a non-UUID id makes no call', async () => {
    const get = vi.spyOn(shiftsApi, 'get').mockResolvedValue(closedShift());
    await renderApp(detail, { lang: 'en', route: `/accounting/shifts/${SHIFT}` });
    expect(
      await screen.findByRole('heading', { name: 'Shift MAIN-SH-26-000001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ten pounds short')).toBeInTheDocument();
    expect(screen.getByText(/200 × 3\s+·\s+20 × 2/)).toBeInTheDocument();
    get.mockClear();
    signOut();
    signIn();
    await renderApp(detail, { lang: 'en', route: '/accounting/shifts/not-a-uuid' });
    expect((await screen.findAllByText(t('cash.shifts.detail.notFound'))).length).toBeGreaterThan(
      0,
    );
    expect(get).not.toHaveBeenCalled();
  });
});
