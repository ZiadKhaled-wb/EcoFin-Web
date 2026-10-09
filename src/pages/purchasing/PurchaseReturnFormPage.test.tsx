import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseReturnFormPage from './PurchaseReturnFormPage';
import {
  INVOICE,
  LINE_PHONE,
  LINE_TV,
  MAIN,
  SAFE,
  UNIT_2,
  branches,
  invoice,
  purchaseReturn,
  returnable,
} from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const page = (
  <Routes>
    <Route path="/purchasing/invoices/:id/return" element={<PurchaseReturnFormPage />} />
    <Route path="/purchasing/returns/:id" element={<p>posted return</p>} />
  </Routes>
);
const route = `/purchasing/invoices/${INVOICE}/return`;
const tvQuantity = () =>
  screen.findByLabelText(t('purchases.returns.form.quantityFor', { name: 'TV' }));
const submit = () => screen.getByRole('button', { name: t('purchases.returns.form.submit') });
const reason = () => screen.getByLabelText(t('purchases.returns.form.reason'));

describe('U04 purchase return form', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['purchase.return_create']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(purchaseReturnsApi, 'returnable').mockResolvedValue(returnable());
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(invoice({ status: 'approved' }));
    vi.spyOn(purchaseReturnsApi, 'prior').mockResolvedValue([purchaseReturn()]);
    vi.spyOn(purchaseReturnsApi, 'cashAccounts').mockResolvedValue({
      items: [{ id: SAFE, name: 'Main safe', kind: 'safe', branch_id: MAIN, balance: '100.00' }],
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('caps the quantity at the returnable and shows the live totals (D41)', async () => {
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const qty = await tvQuantity();
    expect(
      screen.getByRole('heading', { name: 'Return goods of MAIN-PI-26-000001' }),
    ).toBeInTheDocument();
    await user.type(qty, '9');
    expect(qty).toHaveValue('6');
    // The last 6 of 10 take what is left of the line: 1482.00 - 592.80.
    expect(await screen.findByText(formatMoney('889.20'))).toBeInTheDocument();
    await user.clear(qty);
    await user.type(qty, '2');
    expect(await screen.findByText(formatMoney('296.40'))).toBeInTheDocument();
    expect(screen.getByText(formatMoney('36.40'))).toBeInTheDocument();
  });

  it('serial checkboxes send unit_ids; a credit return sends no account', async () => {
    const create = vi.spyOn(purchaseReturnsApi, 'create').mockResolvedValue(purchaseReturn());
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.type(await tvQuantity(), '2');
    await user.click(screen.getByRole('checkbox', { name: 'SN-2' }));
    await user.type(reason(), '  Wrong model ');
    await user.click(submit());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0]).toEqual({
      purchase_invoice_id: INVOICE,
      refund_mode: 'supplier_credit',
      reason: 'Wrong model',
      lines: [
        { invoice_line_id: LINE_TV, quantity: 2 },
        { invoice_line_id: LINE_PHONE, unit_ids: [UNIT_2] },
      ],
    });
    expect(await screen.findByText('posted return')).toBeInTheDocument();
  });

  it('needs a line, a reason and, for cash, an account', async () => {
    const create = vi
      .spyOn(purchaseReturnsApi, 'create')
      .mockResolvedValue(purchaseReturn({ refund_mode: 'cash', cash_account_id: SAFE }));
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await tvQuantity();
    await user.click(screen.getByRole('radio', { name: /Cash refund/ }));
    await user.click(submit());
    expect(await screen.findByText(t('purchases.returns.errors.nothing'))).toBeInTheDocument();
    expect(screen.getByText(t('purchases.returns.errors.reasonInvalid'))).toBeInTheDocument();
    expect(screen.getByText(t('purchases.returns.errors.accountRequired'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.type(await tvQuantity(), '1');
    await user.type(reason(), 'Damaged');
    await user.selectOptions(screen.getByLabelText(t('purchases.returns.form.cashAccount')), SAFE);
    await user.click(submit());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0]).toMatchObject({ refund_mode: 'cash', cash_account_id: SAFE });
  });

  it('a double submit posts once, with one idempotency key', async () => {
    const create = vi
      .spyOn(purchaseReturnsApi, 'create')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(purchaseReturn()), 50)),
      );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.type(await tvQuantity(), '1');
    await user.type(reason(), 'Damaged');
    await user.dblClick(submit());
    expect(await screen.findByText('posted return')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('RETURN_QTY_EXCEEDED shows the returnable on its line', async () => {
    vi.spyOn(purchaseReturnsApi, 'create').mockRejectedValue(
      Object.assign(new ApiError(409, 'RETURN_QTY_EXCEEDED', 'Too many.'), {
        details: { invoice_line_id: LINE_TV, returnable: 3 },
      }),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.type(await tvQuantity(), '5');
    await user.type(reason(), 'Damaged');
    await user.click(submit());
    const row = (await screen.findByText('TV-55')).closest('tr')!;
    expect(await within(row).findByText('Only 3 can still be returned.')).toBeInTheDocument();
  });

  it.each(['UNIT_NOT_AVAILABLE', 'OUT_OF_STOCK'])(
    '%s explains that the goods are not in this branch',
    async (code) => {
      vi.spyOn(purchaseReturnsApi, 'create').mockRejectedValue(new ApiError(409, code, 'No.'));
      await renderApp(page, { lang: 'en', route });
      const user = userEvent.setup();
      await user.click(await screen.findByRole('checkbox', { name: 'SN-1' }));
      await user.type(reason(), 'Damaged');
      await user.click(submit());
      expect(
        await screen.findByText(t('purchases.returns.errors.notInBranch')),
      ).toBeInTheDocument();
    },
  );

  it('an invoice that is not approved cannot be returned; a non-UUID id makes no call', async () => {
    const read = vi.spyOn(purchaseReturnsApi, 'returnable').mockResolvedValue({
      ...returnable(),
      invoice: { ...returnable().invoice, status: 'draft' },
    });
    await renderApp(page, { lang: 'en', route });
    expect(await screen.findByText(t('purchases.returns.form.notApproved'))).toBeInTheDocument();
    read.mockClear();
    signOut();
    signIn();
    await renderApp(page, { lang: 'en', route: '/purchasing/invoices/not-a-uuid/return' });
    expect((await screen.findAllByText(t('purchases.detail.notFound'))).length).toBeGreaterThan(0);
    expect(read).not.toHaveBeenCalled();
  });
});
