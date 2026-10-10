import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Expense, ExpenseCategory, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { cashApi } from '@/services/cashApi';
import { expensesApi } from '@/services/expensesApi';
import { shiftsApi } from '@/services/shiftsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { useAuthStore } from '@/store/authStore';
import ExpensesPage from './ExpensesPage';
import { monthRange } from './expenseShared';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0610000-0000-4000-8000-000000000001';
const SAFE = 'a0610000-0000-4000-8000-000000000002';
const OTHER_SAFE = 'a0610000-0000-4000-8000-000000000003';
const RENT = 'a0610000-0000-4000-8000-000000000004';
const EXPENSE = 'a0610000-0000-4000-8000-000000000005';
const SHIFT = 'a0610000-0000-4000-8000-000000000006';
const REVERSAL = 'a0610000-0000-4000-8000-000000000007';
const ts = '2026-10-11T08:00:00.000Z';

const category = (over: Partial<ExpenseCategory> = {}): ExpenseCategory => ({
  id: RENT,
  name: 'Rent',
  archived_at: null,
  created_at: ts,
  updated_at: ts,
  ...over,
});
const expense = (over: Partial<Expense> = {}): Expense => ({
  id: EXPENSE,
  number: 'MAIN-EX-26-000001',
  branch_id: MAIN,
  category_id: RENT,
  category_name: 'Rent',
  amount: '1200.00',
  cash_account_id: SAFE,
  cash_account_name: 'Main safe',
  cash_account_kind: 'safe',
  shift_id: null,
  shift_number: null,
  note: 'October',
  receipt_file_id: null,
  reverses_expense_id: null,
  reversed_by_expense_id: null,
  business_date: '2026-10-11',
  created_at: ts,
  created_by_name: 'Sara Accountant',
  ...over,
});
const account = (id: string, name: string, branch_id: string | null) => ({
  id,
  name,
  kind: 'safe' as const,
  branch_id,
  branch_name: null,
  is_active: true,
  archived_at: null,
  balance: '5000.00',
  is_default: false,
  created_at: ts,
  updated_at: ts,
});
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const setRole = (role: 'OWNER' | 'ACCOUNTANT') => {
  const user = useAuthStore.getState().user;
  if (user) useAuthStore.setState({ user: { ...user, role } });
};

describe('K03 expenses', () => {
  beforeEach(() => {
    signIn();
    setRole('ACCOUNTANT');
    setPermissions(['expense.create', 'cash.view']);
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
    vi.spyOn(cashApi, 'list').mockResolvedValue([
      account(SAFE, 'Main safe', MAIN),
      account(OTHER_SAFE, 'Other branch safe', OTHER_SAFE),
    ]);
    vi.spyOn(expensesApi, 'categories').mockResolvedValue([category()]);
    vi.spyOn(expensesApi, 'list').mockResolvedValue({
      items: [
        expense(),
        expense({
          id: SHIFT,
          number: 'MAIN-EX-26-000002',
          amount: '40.00',
          shift_id: SHIFT,
          shift_number: 'MAIN-SH-26-000003',
          cash_account_kind: 'drawer',
          note: 'Taxi',
          reversed_by_expense_id: REVERSAL,
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    vi.spyOn(expensesApi, 'report').mockResolvedValue({
      from: '2026-10-01',
      to: '2026-10-31',
      items: [{ category_id: RENT, category_name: 'Rent', count: 1, total: '1200.00' }],
      count: 1,
      total: '1200.00',
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the expenses in Arabic with the total by category for this month', async () => {
    await renderApp(<ExpensesPage />, { lang: 'ar' });
    expect(await screen.findByRole('heading', { name: 'المصروفات' })).toBeInTheDocument();
    const list = await screen.findByRole('table', { name: 'المصروفات' });
    expect(await within(list).findByText('MAIN-EX-26-000001')).toBeInTheDocument();
    expect(within(list).getByText('وردية MAIN-SH-26-000003')).toBeInTheDocument();
    expect(within(list).getByText('معكوس')).toBeInTheDocument();
    expect(await screen.findByTestId('expense-total')).toHaveTextContent(/1[,٬]?200/);
    const { from, to } = monthRange();
    expect(expensesApi.report).toHaveBeenCalledWith({ from, to });
    expect(expensesApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ from, to, include_reversals: true, page: 1 }),
    );
    // Only the owner reverses.
    expect(screen.queryByRole('button', { name: 'عكس' })).not.toBeInTheDocument();
  });

  it('a new expense needs a category, an amount and a vault of the branch; one request', async () => {
    const create = vi
      .spyOn(expensesApi, 'create')
      .mockImplementation(() => new Promise((r) => setTimeout(() => r(expense()), 50)));
    await renderApp(<ExpensesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New expense' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Record expense' }));
    expect(await within(dialog).findByText('Choose a category.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter an amount above zero.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the vault the money leaves.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    const cat = within(dialog).getByLabelText('Category');
    await waitFor(() => expect(cat.querySelector(`option[value="${RENT}"]`)).not.toBeNull());
    await user.selectOptions(cat, RENT);
    await user.type(within(dialog).getByLabelText(/^Amount/), '1200');
    const vault = within(dialog).getByLabelText('Vault or bank');
    await waitFor(() => expect(vault.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
    // A safe of another branch is not offered.
    expect(vault.querySelector(`option[value="${OTHER_SAFE}"]`)).toBeNull();
    await user.selectOptions(vault, SAFE);
    await user.type(within(dialog).getByLabelText('Note'), '  October ');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Record expense' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [body, key] = create.mock.calls[0]!;
    expect(body).toMatchObject({
      category_id: RENT,
      branch_id: MAIN,
      cash_account_id: SAFE,
      note: 'October',
    });
    expect(Number(body.amount)).toBe(1200);
    expect(body).not.toHaveProperty('from_shift');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('with an open shift the expense can leave its drawer', async () => {
    setPermissions(['expense.create', 'cash.view', 'shift.operate']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue({
      number: 'MAIN-SH-26-000003',
      expected_cash: '300.00',
    } as Awaited<ReturnType<typeof shiftsApi.current>>);
    const create = vi.spyOn(expensesApi, 'create').mockResolvedValue(expense());
    await renderApp(<ExpensesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New expense' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('radio', { name: 'My open shift' }));
    expect(await within(dialog).findByTestId('expense-shift')).toHaveTextContent(
      'Shift MAIN-SH-26-000003: the drawer should hold',
    );
    expect(within(dialog).queryByLabelText('Vault or bank')).not.toBeInTheDocument();
    const cat = within(dialog).getByLabelText('Category');
    await waitFor(() => expect(cat.querySelector(`option[value="${RENT}"]`)).not.toBeNull());
    await user.selectOptions(cat, RENT);
    await user.type(within(dialog).getByLabelText(/^Amount/), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Record expense' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0]![0];
    expect(body).toMatchObject({ category_id: RENT, from_shift: true });
    expect(body).not.toHaveProperty('cash_account_id');
    expect(body).not.toHaveProperty('branch_id');
  });

  it('a refused expense shows why and can be sent again', async () => {
    const create = vi
      .spyOn(expensesApi, 'create')
      .mockRejectedValueOnce(new ApiError(409, 'INSUFFICIENT_FUNDS', 'no'))
      .mockResolvedValue(expense());
    await renderApp(<ExpensesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New expense' }));
    const dialog = await screen.findByRole('dialog');
    const cat = within(dialog).getByLabelText('Category');
    await waitFor(() => expect(cat.querySelector(`option[value="${RENT}"]`)).not.toBeNull());
    await user.selectOptions(cat, RENT);
    await user.type(within(dialog).getByLabelText(/^Amount/), '9000');
    const vault = within(dialog).getByLabelText('Vault or bank');
    await waitFor(() => expect(vault.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
    await user.selectOptions(vault, SAFE);
    await user.click(within(dialog).getByRole('button', { name: 'Record expense' }));
    expect(
      await within(dialog).findByText('There is not enough money there for this expense.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record expense' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    // The same key: the server would answer the first expense, never a second one.
    expect(create.mock.calls[1]![1]).toBe(create.mock.calls[0]![1]);
  });

  it('the owner reverses an expense with a reason; a reversed one has no button', async () => {
    setRole('OWNER');
    const reverse = vi
      .spyOn(expensesApi, 'reverse')
      .mockResolvedValue(expense({ id: REVERSAL, reverses_expense_id: EXPENSE }));
    await renderApp(<ExpensesPage />, { lang: 'en' });
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: 'Reverse' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Reverse expense MAIN-EX-26-000001' });
    await user.click(within(dialog).getByRole('button', { name: 'Reverse expense' }));
    expect(
      await within(dialog).findByText('Write a reason of 3 to 500 characters.'),
    ).toBeInTheDocument();
    expect(reverse).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/^Reason/), ' Entered twice ');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Reverse expense' }));
    await waitFor(() => expect(reverse).toHaveBeenCalledTimes(1));
    expect(reverse.mock.calls[0]![0]).toBe(EXPENSE);
    expect(reverse.mock.calls[0]![1]).toEqual({ reason: 'Entered twice' });
  });

  it('categories: add, rename, archive; a taken name is explained', async () => {
    vi.spyOn(expensesApi, 'categories').mockResolvedValue([
      category(),
      category({ id: SHIFT, name: 'Old', archived_at: ts }),
    ]);
    const add = vi
      .spyOn(expensesApi, 'createCategory')
      .mockRejectedValueOnce(new ApiError(409, 'EXPENSE_CATEGORY_NAME_TAKEN', 'no'))
      .mockResolvedValue(category({ id: REVERSAL, name: 'Transport' }));
    const rename = vi.spyOn(expensesApi, 'renameCategory').mockResolvedValue(category());
    const archive = vi.spyOn(expensesApi, 'archiveCategory').mockResolvedValue(category());
    const restore = vi.spyOn(expensesApi, 'restoreCategory').mockResolvedValue(category());
    await renderApp(<ExpensesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Categories' }));
    const dialog = await screen.findByRole('dialog', { name: 'Expense categories' });
    expect(await within(dialog).findByText('Old')).toBeInTheDocument();
    expect(within(dialog).getByText('Archived')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(
      await within(dialog).findByText('Write a name of 1 to 80 characters.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Category name'), ' Transport ');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(
      await within(dialog).findByText('Another category already has this name.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(add).toHaveBeenLastCalledWith('Transport');

    await user.click(within(dialog).getAllByRole('button', { name: 'Rename' })[0]!);
    const edit = within(dialog).getAllByLabelText('Category name')[1]!;
    await user.clear(edit);
    await user.type(edit, 'Shop rent');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(RENT, 'Shop rent'));
    await user.click(await within(dialog).findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith(RENT));
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(SHIFT));
  });

  it('without expense.create the page only reads', async () => {
    setPermissions(['cash.view']);
    await renderApp(<ExpensesPage />, { lang: 'en' });
    expect(await screen.findByText('MAIN-EX-26-000001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New expense' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories' })).not.toBeInTheDocument();
  });
});
