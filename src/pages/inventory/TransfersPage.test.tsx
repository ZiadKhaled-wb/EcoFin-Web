import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Product, StockTransfer, StockTransferLine } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { productsApi } from '@/services/productsApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import TransferPage from './TransferPage';
import TransfersPage from './TransfersPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0c00000-0000-4000-8000-000000000001';
const SECOND = 'a0c00000-0000-4000-8000-000000000002';
const TR = 'a0c00000-0000-4000-8000-000000000003';
const CABLE = 'a0c00000-0000-4000-8000-000000000004';
const PHONE = 'a0c00000-0000-4000-8000-000000000005';
const UNIT = 'a0c00000-0000-4000-8000-000000000006';

const cableLine: StockTransferLine = {
  id: 'a0c00000-0000-4000-8000-000000000010',
  product_id: CABLE,
  name_ar: 'كابل',
  name_en: 'Cable',
  sku: 'CB-1',
  is_serialized: false,
  unit_id: null,
  serial: null,
  qty_sent: 6,
  qty_received: null,
  discrepancy_reason: null,
};
const phoneLine: StockTransferLine = {
  ...cableLine,
  id: 'a0c00000-0000-4000-8000-000000000011',
  product_id: PHONE,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  is_serialized: true,
  unit_id: UNIT,
  serial: 'SN-1',
  qty_sent: 1,
};
const transfer = (over: Partial<StockTransfer> = {}): StockTransfer => ({
  id: TR,
  number: 'MAIN-TR-26-000001',
  from_branch_id: MAIN,
  to_branch_id: SECOND,
  from_branch_name: 'Main',
  to_branch_name: 'Second',
  status: 'draft',
  notes: null,
  created_at: '2026-10-10T08:00:00.000Z',
  created_by_name: 'Keeper',
  sent_at: null,
  sent_by_name: null,
  received_at: null,
  received_by_name: null,
  lines_count: 2,
  quantity_sent: 7,
  quantity_received: null,
  adjustments: [],
  lines: [cableLine, phoneLine],
  ...over,
});
const product: Product = {
  id: CABLE,
  name_ar: 'كابل',
  name_en: 'Cable',
  sku: 'CB-1',
  barcode: null,
  category_id: null,
  unit_of_measure: 'piece',
  cash_price: '5.00',
  installment_price: null,
  avg_cost: '0.0000',
  tax_class_id: 'a0c00000-0000-4000-8000-000000000009',
  warranty_months: 0,
  is_serialized: false,
  min_stock: 0,
  image_file_id: null,
  eta_item_code: null,
  eta_item_type: null,
  archived_at: null,
  created_at: '2026-10-10T08:00:00.000Z',
  updated_at: '2026-10-10T08:00:00.000Z',
};
const detailRoute = `/inventory/transfers/${TR}`;
const detail = (
  <Routes>
    <Route path="/inventory/transfers/:id" element={<TransferPage />} />
  </Routes>
);

function permissions(keys: string[], branches = [MAIN]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys as never));
  vi.spyOn(branchApi, 'list').mockResolvedValue(
    branches.map((id) => ({
      id,
      code: id === MAIN ? 'B1' : 'B2',
      name: id === MAIN ? 'Main' : 'Second',
      is_main: id === MAIN,
    })),
  );
}

describe('I03 transfers', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(stockApi, 'transferDestinations').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main' },
      { id: SECOND, code: 'B2', name: 'Second' },
    ]);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)('lists transfers with both branch names (%s)', async (lang) => {
    permissions(['stock.view', 'stock.transfer_send']);
    vi.spyOn(stockApi, 'transfers').mockResolvedValue({
      items: [transfer({ status: 'sent' })],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    await renderApp(<TransfersPage />, { lang });
    const table = await screen.findByRole('table', { name: t('stock.transfers.title') });
    const row = within(table).getByRole('row', { name: /MAIN-TR-26-000001/ });
    expect(within(row).getByText('Main')).toBeInTheDocument();
    expect(within(row).getByText('Second')).toBeInTheDocument();
    expect(within(row).getByText(t('stock.transfers.statuses.sent'))).toBeInTheDocument();
  });

  it('a new draft goes to any branch of the shop, with one key, and opens', async () => {
    permissions(['stock.view', 'stock.transfer_send']);
    vi.spyOn(stockApi, 'transfers').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [product],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    const create = vi
      .spyOn(stockApi, 'createTransfer')
      .mockRejectedValueOnce(new ApiError(409, 'OUT_OF_STOCK', 'Out of stock.'))
      .mockResolvedValueOnce(transfer());
    vi.spyOn(stockApi, 'transfer').mockResolvedValue(transfer());
    await renderApp(
      <Routes>
        <Route path="/" element={<TransfersPage />} />
        <Route path="/inventory/transfers/:id" element={<TransferPage />} />
      </Routes>,
      { lang: 'en' },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.transfers.new') }));
    const dialog = await screen.findByRole('dialog');
    // The sender works in Main only, but Second is offered as a destination.
    await user.selectOptions(within(dialog).getByLabelText(t('stock.transfers.form.to')), SECOND);
    await user.type(
      within(dialog).getByRole('searchbox', { name: t('stock.transfers.form.search') }),
      'cable',
    );
    await user.click(
      await within(dialog).findByRole('button', { name: t('stock.transfers.form.add') }),
    );
    const qty = within(dialog).getByLabelText(`${t('stock.transfers.form.quantity')}: Cable`);
    await user.clear(qty);
    await user.type(qty, '6');
    await user.click(within(dialog).getByRole('button', { name: t('stock.transfers.form.save') }));
    expect(await within(dialog).findByText(t('stock.transfers.errors.outOfStock'))).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('stock.transfers.form.save') }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0]![0]).toEqual({
      from_branch_id: MAIN,
      to_branch_id: SECOND,
      lines: [{ product_id: CABLE, quantity: 6 }],
    });
    expect(create.mock.calls[1]![1]).toBe(create.mock.calls[0]![1]);
    expect(
      await screen.findByRole('heading', {
        name: t('stock.transfers.detail.title', { number: 'MAIN-TR-26-000001' }),
      }),
    ).toBeInTheDocument();
  });

  it('the sender sends a draft after confirming; receive is not offered in the source', async () => {
    permissions(['stock.view', 'stock.transfer_send', 'stock.transfer_receive']);
    vi.spyOn(stockApi, 'transfer').mockResolvedValue(transfer());
    const send = vi.spyOn(stockApi, 'sendTransfer').mockResolvedValue(transfer({ status: 'sent' }));
    await renderApp(detail, { lang: 'en', route: detailRoute });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.transfers.detail.send') }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        t('stock.transfers.detail.sendHelp', { count: '7', from: 'Main', to: 'Second' }),
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.transfers.detail.send') }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledWith(TR));
    expect(screen.queryByRole('button', { name: t('stock.transfers.detail.receive') })).toBeNull();
  });

  it.each(['ar', 'en'] as const)(
    'the receiver records a short cable and a damaged serial (%s)',
    async (lang) => {
      permissions(['stock.view', 'stock.transfer_receive'], [SECOND]);
      vi.spyOn(stockApi, 'transfer').mockResolvedValue(transfer({ status: 'sent' }));
      const receive = vi
        .spyOn(stockApi, 'receiveTransfer')
        .mockResolvedValue(transfer({ status: 'partially_received' }));
      await renderApp(detail, { lang, route: detailRoute });
      const user = userEvent.setup();
      expect(screen.queryByRole('button', { name: t('stock.transfers.detail.send') })).toBeNull();
      await user.click(
        await screen.findByRole('button', { name: t('stock.transfers.detail.receive') }),
      );
      const dialog = await screen.findByRole('dialog');
      const name = lang === 'en' ? 'Cable' : 'كابل';
      const arrived = within(dialog).getByLabelText(
        `${t('stock.transfers.receive.arrived')}: ${name}`,
      );
      await user.clear(arrived);
      await user.type(arrived, '5');
      await user.selectOptions(
        within(dialog).getByLabelText(`${t('stock.transfers.receive.reason')}: ${name}`),
        'damage',
      );
      const phone = lang === 'en' ? 'Phone' : 'موبايل';
      await user.selectOptions(
        within(dialog).getByLabelText(`${t('stock.transfers.receive.arrived')}: ${phone} SN-1`),
        'loss',
      );
      await user.click(
        within(dialog).getByRole('button', { name: t('stock.transfers.receive.submit') }),
      );
      await waitFor(() =>
        expect(receive).toHaveBeenCalledWith(TR, [
          { line_id: cableLine.id, qty_received: 5, reason: 'damage' },
          { line_id: phoneLine.id, qty_received: 0, reason: 'loss' },
        ]),
      );
    },
  );

  it('a received transfer shows what was written off and offers nothing', async () => {
    permissions(['stock.view', 'stock.transfer_send', 'stock.transfer_receive'], [MAIN, SECOND]);
    vi.spyOn(stockApi, 'transfer').mockResolvedValue(
      transfer({
        status: 'partially_received',
        adjustments: [{ id: UNIT, number: 'B2-SA-26-000001', reason: 'loss' }],
        lines: [{ ...cableLine, qty_received: 5, discrepancy_reason: 'loss' }],
      }),
    );
    await renderApp(detail, { lang: 'en', route: detailRoute });
    expect(await screen.findByText('B2-SA-26-000001')).toBeInTheDocument();
    for (const action of ['send', 'receive', 'cancel', 'edit'] as const) {
      expect(
        screen.queryByRole('button', { name: t(`stock.transfers.detail.${action}`) }),
      ).toBeNull();
    }
  });

  it('cancels a draft after confirming', async () => {
    permissions(['stock.view', 'stock.transfer_send']);
    vi.spyOn(stockApi, 'transfer').mockResolvedValue(transfer());
    const cancel = vi
      .spyOn(stockApi, 'cancelTransfer')
      .mockResolvedValue(transfer({ status: 'cancelled' }));
    await renderApp(detail, { lang: 'en', route: detailRoute });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: t('stock.transfers.detail.cancel') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.transfers.detail.cancelConfirm') }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(TR));
  });
});
