import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SaleHistoryDetails,
  SaleReturnable,
  SalesReturn,
  SalesReturnQuote,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { meApi } from '@/features/me/meApi';
import { returnsApi } from '@/services/returnsApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import ReturnPage from './ReturnPage';
import ReturnDetailPage from './ReturnDetailPage';
import ReturnsPage from './ReturnsPage';
import { defaultRefunds, refundBody } from './returnShared';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const SALE = '5a1e0000-0000-4000-8000-000000000001';
const BRANCH = '5a1e0000-0000-4000-8000-000000000002';
const CHAIR_LINE = '5a1e0000-0000-4000-8000-000000000003';
const PHONE_LINE = '5a1e0000-0000-4000-8000-000000000004';
const UNIT = '5a1e0000-0000-4000-8000-000000000005';
const PRODUCT = '5a1e0000-0000-4000-8000-000000000006';
const CUSTOMER = '5a1e0000-0000-4000-8000-000000000007';
const RETURN = '5a1e0000-0000-4000-8000-000000000008';
const CONTRACT = '5a1e0000-0000-4000-8000-000000000009';

function returnable(over: Partial<SaleReturnable> = {}): SaleReturnable {
  return {
    sale: {
      id: SALE,
      number: 'MAIN-SL-26-000001',
      business_date: '2026-10-22',
      branch_id: BRANCH,
      total: '6000.00',
      customer_id: CUSTOMER,
      customer_name: 'Mona',
    },
    lines: [
      {
        sale_line_id: CHAIR_LINE,
        line_no: 1,
        product_id: PRODUCT,
        sku: 'CH',
        name_ar: 'كرسي',
        name_en: 'Chair',
        is_serialized: false,
        unit_id: null,
        serial: null,
        sold: 4,
        returned: 0,
        returnable: 4,
        unit_price: '250.00',
        line_total: '1000.00',
        tax_amount: '122.81',
        refunded: '0.00',
        warranty_claim_id: null,
      },
      {
        sale_line_id: PHONE_LINE,
        line_no: 2,
        product_id: PRODUCT,
        sku: 'PH',
        name_ar: 'هاتف',
        name_en: 'Phone',
        is_serialized: true,
        unit_id: UNIT,
        serial: 'IMEI-1',
        sold: 1,
        returned: 0,
        returnable: 1,
        unit_price: '5000.00',
        line_total: '5000.00',
        tax_amount: '614.04',
        refunded: '0.00',
        warranty_claim_id: null,
      },
    ],
    paid_by_method: { cash: '3000.00', bank_transfer: '3000.00', store_credit: '0.00' },
    deadline: '2026-11-05',
    period_passed: false,
    can_pass_period: false,
    contract: null,
    blocked: null,
    ...over,
  };
}

function quote(over: Partial<SalesReturnQuote> = {}): SalesReturnQuote {
  return {
    sale_id: SALE,
    sale_number: 'MAIN-SL-26-000001',
    kind: 'return',
    lines: [],
    subtotal: '219.30',
    tax_total: '30.70',
    total: '250.00',
    deadline: '2026-11-05',
    period_override: false,
    warranty_claim_id: null,
    contract: null,
    refund_due: '250.00',
    refunds: [],
    refundable: { cash: '3000.00', bank_transfer: '3000.00', store_credit: '0.00' },
    exchange: null,
    ...over,
  };
}

const posted = {
  id: RETURN,
  number: 'MAIN-RT-26-000001',
  kind: 'return',
  refund_method: 'cash',
  sale: { id: SALE, number: 'MAIN-SL-26-000001', business_date: '2026-10-22', total: '6000.00' },
  branch: { id: BRANCH, name: 'Main' },
  customer: { id: CUSTOMER, name: 'Mona' },
  shift_id: null,
  subtotal: '219.30',
  tax_total: '30.70',
  total: '250.00',
  reason: 'Changed his mind',
  business_date: '2026-10-22',
  created_at: '2026-10-22T10:00:00+00:00',
  created_by: { id: null, name: 'Manager' },
  lines: [
    {
      id: '5a1e0000-0000-4000-8000-00000000000a',
      sale_line_id: CHAIR_LINE,
      line_no: 1,
      product_id: PRODUCT,
      sku: 'CH',
      name_ar: 'كرسي',
      name_en: 'Chair',
      unit_id: null,
      serial: null,
      quantity: 1,
      condition: 'resellable',
      refund_amount: '250.00',
      tax_amount: '30.70',
      tax_rate: '14.00',
    },
  ],
  refunds: [],
  contract_change: null,
  exchange_sale: null,
  fiscal: null,
  receipt_prints: 0,
} satisfies SalesReturn;

const page = (
  <Routes>
    <Route path="/sales/:id/return" element={<ReturnPage />} />
    <Route path="/sales/returns/:id" element={<p>posted return</p>} />
  </Routes>
);
const route = `/sales/${SALE}/return`;

describe('S05 return page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['refund.create', 'sale.create']),
    );
    vi.spyOn(returnsApi, 'returnable').mockResolvedValue(returnable());
    vi.spyOn(salesHistoryApi, 'get').mockResolvedValue({
      payments: [],
    } as unknown as SaleHistoryDetails);
    vi.spyOn(returnsApi, 'quote').mockResolvedValue(quote());
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it("shows the server's amounts, starts the refund in cash and posts once with the quote's total", async () => {
    const create = vi.spyOn(returnsApi, 'create').mockResolvedValue(posted);
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const [chairQty] = await screen.findAllByLabelText(t('returns.lines.quantity'));
    await user.type(chairQty!, '1');
    expect(await screen.findByTestId('return-total')).toHaveTextContent(formatMoney('250.00'));
    expect(screen.getByTestId('refund-sum')).toHaveTextContent(formatMoney('250.00'));
    await user.type(screen.getByLabelText(t('returns.reason')), 'Changed his mind');
    await user.click(screen.getByRole('button', { name: t('returns.confirm') }));
    expect(await screen.findByText('posted return')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    const [body, key] = create.mock.calls[0]!;
    expect(body).toMatchObject({
      sale_id: SALE,
      kind: 'return',
      lines: [{ sale_line_id: CHAIR_LINE, quantity: 1, condition: 'resellable' }],
      refunds: [{ method: 'cash', amount: '250.00' }],
      expected_total: '250.00',
      reason: 'Changed his mind',
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the refund lines must add up to what goes back before Confirm', async () => {
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const [chairQty] = await screen.findAllByLabelText(t('returns.lines.quantity'));
    await user.type(chairQty!, '1');
    const amount = await screen.findByLabelText(t('returns.refunds.amount'));
    await user.clear(amount);
    await user.type(amount, '200');
    expect(screen.getByTestId('refund-sum')).toHaveTextContent(
      t('returns.refunds.mismatch', { amount: formatMoney('250.00') }),
    );
    await user.type(screen.getByLabelText(t('returns.reason')), 'Changed his mind');
    expect(screen.getByRole('button', { name: t('returns.confirm') })).toBeDisabled();
  });

  it('a scanned serial ticks its unit; another serial is refused', async () => {
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const scan = await screen.findByLabelText(t('returns.scan.label'));
    await user.type(scan, 'IMEI-9{Enter}');
    expect(
      await screen.findByText(t('returns.scan.notFound', { serial: 'IMEI-9' })),
    ).toBeInTheDocument();
    await user.clear(scan);
    await user.type(scan, 'imei-1{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: t('returns.lines.pick') })).toBeChecked(),
    );
    await waitFor(() =>
      expect(returnsApi.quote).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({ sale_line_id: PHONE_LINE, unit_id: UNIT })],
        }),
      ),
    );
  }, 20_000);

  it('an installment return shows what is owed before and after and the new installments', async () => {
    vi.mocked(returnsApi.returnable).mockResolvedValue(
      returnable({
        contract: {
          id: CONTRACT,
          number: 'CT-1',
          status: 'active',
          remaining: '9000.00',
          installments_left: 10,
        },
      }),
    );
    vi.mocked(returnsApi.quote).mockResolvedValue(
      quote({
        total: '4000.00',
        refund_due: '0.00',
        refundable: null,
        contract: {
          contract_id: CONTRACT,
          number: 'CT-1',
          status_before: 'active',
          status_after: 'active',
          version_before: 1,
          remaining_before: '9000.00',
          profit_share: '720.00',
          credit: '4720.00',
          applied: '4720.00',
          remaining_after: '4280.00',
          principal_after: '3500.00',
          profit_after: '780.00',
          overpaid: '0.00',
          installments_left: 10,
          installment_amount: '428.00',
          lines: [],
        },
      }),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const [chairQty] = await screen.findAllByLabelText(t('returns.lines.quantity'));
    await user.type(chairQty!, '1');
    expect(await screen.findByTestId('remaining-after')).toHaveTextContent(formatMoney('4280.00'));
    expect(screen.getByTestId('new-installments')).toHaveTextContent(
      t('returns.contract.installments', { count: '10', amount: formatMoney('428.00') }),
    );
    expect(screen.getByText(t('returns.refunds.noneNeeded'))).toBeInTheDocument();
    // No exchange for an installment sale.
    expect(screen.queryByLabelText(t('returns.exchange.toggle'))).not.toBeInTheDocument();
  });

  it("shows the server's refusal in words", async () => {
    vi.spyOn(returnsApi, 'create').mockRejectedValue(
      new ApiError(409, 'RETURN_PERIOD_EXPIRED', 'late'),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    const [chairQty] = await screen.findAllByLabelText(t('returns.lines.quantity'));
    await user.type(chairQty!, '1');
    await screen.findByTestId('return-total');
    await user.type(screen.getByLabelText(t('returns.reason')), 'Changed his mind');
    await user.click(screen.getByRole('button', { name: t('returns.confirm') }));
    expect(await screen.findByText(t('returns.errors.RETURN_PERIOD_EXPIRED'))).toBeInTheDocument();
  });

  it('a voided sale says so instead of a form', async () => {
    vi.mocked(returnsApi.returnable).mockResolvedValue(returnable({ blocked: 'voided' }));
    await renderApp(page, { lang: 'ar', route });
    expect(await screen.findByText(t('returns.blocked.voided'))).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('S05 returns list and detail', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['refund.create']));
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists returns with links to the return and its sale; the kind filter goes to the URL', async () => {
    const list = vi.spyOn(returnsApi, 'list').mockResolvedValue({
      items: [
        {
          id: RETURN,
          number: 'MAIN-RT-26-000001',
          kind: 'exchange',
          refund_method: 'cash',
          sale_id: SALE,
          sale_number: 'MAIN-SL-26-000001',
          branch: { id: BRANCH, name: 'Main' },
          customer: null,
          total: '250.00',
          reason: 'x',
          business_date: '2026-10-22',
          created_at: '2026-10-22T10:00:00+00:00',
          created_by: { id: null, name: null },
        },
      ],
      total_count: 1,
      page: 1,
      page_size: 20,
    });
    await renderApp(<ReturnsPage />, { lang: 'en', route: '/sales/returns?kind=exchange' });
    expect(await screen.findByRole('link', { name: 'MAIN-RT-26-000001' })).toHaveAttribute(
      'href',
      `/sales/returns/${RETURN}`,
    );
    expect(screen.getByRole('link', { name: 'MAIN-SL-26-000001' })).toHaveAttribute(
      'href',
      `/sales/${SALE}`,
    );
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ kind: 'exchange', page: 1 }));
  });

  it('the detail shows the contract change and the total', async () => {
    vi.spyOn(returnsApi, 'get').mockResolvedValue({
      ...posted,
      refund_method: 'contract_adjustment',
      contract_change: {
        id: CONTRACT,
        contract_id: CONTRACT,
        contract_number: 'CT-1',
        old_version: 1,
        new_version: 2,
        remaining_after: '4280.00',
        status_after: 'active',
        credit: '4720.00',
        profit_share: '720.00',
      },
    });
    await renderApp(
      <Routes>
        <Route path="/sales/returns/:id" element={<ReturnDetailPage />} />
      </Routes>,
      { lang: 'en', route: `/sales/returns/${RETURN}` },
    );
    expect(await screen.findByTestId('contract-change')).toHaveTextContent(
      t('returns.detail.contractChange', { number: 'CT-1', amount: formatMoney('4280.00') }),
    );
    expect(screen.getByTestId('return-detail-total')).toHaveTextContent(formatMoney('250.00'));
  });
});

describe('S05 return helpers', () => {
  it('refund lines leave out blank and zero amounts and keep a bank transfer whole', () => {
    expect(
      refundBody([
        { method: 'cash', amount: '', cash_account_id: '', reference: '' },
        { method: 'cash', amount: '0.00', cash_account_id: '', reference: '' },
        { method: 'bank_transfer', amount: '10.00', cash_account_id: BRANCH, reference: ' T1 ' },
      ]),
    ).toEqual([
      { method: 'bank_transfer', amount: '10.00', cash_account_id: BRANCH, reference: 'T1' },
    ]);
  });
  it('the first refund line: cash when the sale took enough, else store credit for a customer', () => {
    expect(defaultRefunds(quote(), false, true)[0]!.method).toBe('cash');
    const short = quote({
      refundable: { cash: '100.00', bank_transfer: '0.00', store_credit: '0.00' },
    });
    expect(defaultRefunds(short, false, true)[0]!.method).toBe('store_credit');
    expect(defaultRefunds(short, false, false)[0]!.method).toBe('cash');
    expect(defaultRefunds(quote({ refund_due: '0.00' }), true, true)).toEqual([]);
  });
});
