import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  Contract,
  Customer,
  InstallmentPolicy,
  InstallmentPreview,
  InstallmentPreviewBody,
  PermissionKey,
  Product,
  Sale,
  SaleQuote,
  SaleQuoteBody,
  ShopProfile,
  ShopSettings,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { categoriesApi } from '@/services/categoriesApi';
import { customersApi } from '@/services/customersApi';
import { guarantorsApi } from '@/services/guarantorsApi';
import { installmentsApi } from '@/services/installmentsApi';
import { productsApi } from '@/services/productsApi';
import { salesApi } from '@/services/salesApi';
import { settingsApi } from '@/services/settingsApi';
import { shiftsApi } from '@/services/shiftsApi';
import { shopProfileApi } from '@/services/shopProfileApi';
import { ORG_A, USER_ID } from '@/test/authFixtures';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { shopToday } from '../../installments/installmentShared';
import { posScope } from './posStorage';
import PosPage from '../PosPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0770000-0000-4000-8000-000000000001';
const SHIFT = 'a0770000-0000-4000-8000-000000000002';
const TV = 'a0770000-0000-4000-8000-000000000003';
const MONA = 'a0770000-0000-4000-8000-000000000004';
const SALE = 'a0770000-0000-4000-8000-000000000005';
const CONTRACT = 'a0770000-0000-4000-8000-000000000006';
const POLICY = 'a0770000-0000-4000-8000-000000000007';
const APPROVAL = 'a0770000-0000-4000-8000-000000000008';
const SARA = 'a0770000-0000-4000-8000-000000000009';
const GONE = 'a0770000-0000-4000-8000-00000000000a';
const HELD_KEY = `ecofin.pos.held.${posScope(ORG_A, USER_ID)}`;
const SEARCH_EN = 'Find a product by name, SKU or barcode';
const ts = '2026-10-16T08:00:00.000Z';

const tv = {
  id: TV,
  name_ar: 'تلفزيون',
  name_en: 'TV',
  sku: 'N02-TV',
  cash_price: '12000.00',
  is_serialized: false,
} as Product;

const policy = {
  id: POLICY,
  version: 3,
  effective_from: ts,
  created_at: ts,
  created_by: null,
  min_down_payment_pct: '10',
  max_down_payment_pct: null,
  down_payment_rules: {},
  max_months: 24,
  amount_tiers: [],
  markup_tiers: [
    { up_to_months: 6, pct: '10' },
    { up_to_months: 24, pct: '20' },
  ],
  allowed_frequencies: ['monthly'],
  min_sale_amount: '0.00',
  min_installment: '0.00',
  min_installment_by_frequency: {},
  rounding_step: '1.00',
  late_fee_type: 'none',
  late_fee_value: '0.00',
  late_fee_recurring: false,
  late_fee_cap: null,
  grace_days: 0,
  early_settlement_rule: 'no_discount',
  early_settlement_pct: null,
  guarantor_required_above: null,
  guarantors_required_count: 1,
  survey_required_above: null,
} as unknown as InstallmentPolicy;

function quoteOf(body: SaleQuoteBody): SaleQuote {
  const total = (12000 * (body.lines[0]?.quantity ?? 1)).toFixed(2);
  return {
    prices_include_vat: true,
    lines: body.lines.map((l) => ({
      product_id: tv.id,
      name_ar: tv.name_ar,
      name_en: tv.name_en,
      sku: tv.sku,
      is_serialized: false,
      unit_id: null,
      serial: null,
      quantity: l.quantity,
      list_price: '12000.00',
      unit_price: '12000.00',
      overridden: false,
      tax_rate: '14.00',
      tax_amount: '0.00',
      line_total: total,
      discount_amount: '0.00',
      effective_pct: '0.00',
      available: 5,
    })),
    subtotal: total,
    discount_total: '0.00',
    max_effective_pct: '0.00',
    tax_total: '0.00',
    total,
    paid: total,
    remaining: '0.00',
    change: '0.00',
    store_credit_balance: body.customer_id ? '0.00' : null,
  } as SaleQuote;
}

/**
 * The server's preview: 20 % profit for 12 months. The credit check is `ok` (within the limit),
 * `blocked` (over it) or `approved` (over it, but an approved exception covers it: the API answers
 * allowed + approved_approval_id, see get_customer_credit_check).
 */
function previewOf(
  body: InstallmentPreviewBody,
  credit: 'ok' | 'blocked' | 'approved' = 'ok',
): InstallmentPreview {
  const ok = credit === 'ok';
  const covered = credit === 'approved';
  const financed = Number(body.cash_price) - Number(body.down_payment);
  const profit = (financed * 0.2).toFixed(2);
  const total = (financed * 1.2).toFixed(2);
  const n = body.installments_count;
  return {
    terms: {
      policy_id: POLICY,
      policy_version: 3,
      cash_price: body.cash_price,
      down_payment: body.down_payment,
      financed_amount: financed.toFixed(2),
      markup_pct: '20',
      markup_amount: profit,
      total_payable: total,
      installments_count: n,
      frequency: body.frequency,
      duration_months: n,
      installment_amount: (Number(total) / n).toFixed(2),
      last_installment_amount: (Number(total) / n).toFixed(2),
      first_due_date: '2026-11-16',
      last_due_date: '2027-10-16',
      min_down_payment: '1200.00',
      max_down_payment: body.cash_price,
      max_months_allowed: 24,
      lines: Array.from({ length: n }, (_, i) => ({
        seq: i + 1,
        due_date: '2026-11-16',
        principal: (financed / n).toFixed(2),
        profit: (Number(profit) / n).toFixed(2),
        amount: (Number(total) / n).toFixed(2),
      })),
      violations: [],
    },
    customer: {
      credit: {
        allowed: ok || covered,
        reasons: ok ? [] : ['limit'],
        needs_approval: !ok && !covered,
        limit: '100000.00',
        exposure: '0.00',
        available: ok ? '100000.00' : '0.00',
        score: 80,
        min_score: 0,
        pending_approval_id: null,
        approved_approval_id: covered ? APPROVAL : null,
      },
      guarantors: {
        policy_id: POLICY,
        policy_version: 3,
        required_above: null,
        required_count: 0,
        linked_active_count: 0,
        met: true,
        selected: 0,
        selected_met: true,
      },
      survey: {
        policy_id: POLICY,
        policy_version: 3,
        required_above: null,
        required: false,
        valid_survey: null,
        open_survey: null,
        met: true,
      },
    },
    can_confirm: true,
  } as InstallmentPreview;
}

const contract = {
  id: CONTRACT,
  number: 'MAIN-CT-26-000001',
  status: 'active',
  branch_id: MAIN,
  sale_id: SALE,
  sale_number: 'MAIN-SL-26-000001',
  customer: { id: MONA, name: 'Mona Adel', phone: '01001234567' },
  guarantors: [],
  policy_version: 3,
  creditor: 'in_house',
  cash_price: '12000.00',
  down_payment: '1200.00',
  financed_amount: '10800.00',
  markup_pct: '20',
  markup_amount: '2160.00',
  total_payable: '12960.00',
  installments_count: 12,
  frequency: 'monthly',
  first_due_date: '2026-11-16',
  last_due_date: '2027-10-16',
  current_version: 1,
  credit_approval_id: null,
  created_at: ts,
  created_by_name: 'Cashier',
  lines: [],
  balance: { paid: '0.00', remaining: '12960.00', overdue: '0.00' },
} as Contract;
const sale = {
  id: SALE,
  number: 'MAIN-SL-26-000001',
  total: '12000.00',
  payments: [{ id: SALE, method: 'cash', amount: '1200.00' }],
  change_total: '0.00',
  lines: [],
} as unknown as Sale;

describe('N02 installment sale in the POS', () => {
  let sell: ReturnType<typeof vi.spyOn>;
  let preview: ReturnType<typeof vi.spyOn>;

  function setPermissions(keys: PermissionKey[]) {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  }

  beforeEach(() => {
    signIn('CASHIER');
    setPermissions(['sale.create', 'customer.create', 'installment.create']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue({
      id: SHIFT,
      number: 'MAIN-SH-26-000003',
      branch_id: MAIN,
    } as Awaited<ReturnType<typeof shiftsApi.current>>);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [tv],
      page: 1,
      pageSize: 24,
      total: 1,
    });
    vi.spyOn(productsApi, 'lookup').mockResolvedValue(tv);
    vi.spyOn(salesApi, 'quote').mockImplementation(async (body) => quoteOf(body));
    vi.spyOn(salesApi, 'paymentAccounts').mockResolvedValue({ items: [] });
    vi.spyOn(customersApi, 'get').mockResolvedValue({
      id: MONA,
      full_name: 'Mona Adel',
      phones: ['01001234567'],
      status: 'active',
    } as Customer);
    vi.spyOn(shopProfileApi, 'get').mockResolvedValue({
      installments_enabled: true,
    } as ShopProfile);
    vi.spyOn(settingsApi, 'get').mockResolvedValue({
      installment_policy: policy,
    } as ShopSettings);
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([]);
    preview = vi
      .spyOn(installmentsApi, 'preview')
      .mockImplementation(async (body) => previewOf(body));
    sell = vi.spyOn(installmentsApi, 'sell').mockResolvedValue({ sale, contract });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    signOut();
  });

  async function open(route = `/sales/pos?customer=${MONA}`) {
    await renderApp(<PosPage />, { lang: 'en', route });
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', { name: SEARCH_EN });
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard(`${tv.sku}{Enter}`);
    return user;
  }
  const termsButton = () => screen.getByRole('button', { name: /Installment terms/ });

  it(
    'the "choose the customer first" hint goes away once a customer is picked',
    { timeout: 20_000 },
    async () => {
      vi.spyOn(customersApi, 'list').mockResolvedValue({
        items: [
          {
            id: MONA,
            full_name: 'Mona Adel',
            phones: ['01001234567'],
            status: 'active',
          } as Customer,
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      } as Awaited<ReturnType<typeof customersApi.list>>);
      const user = await open('/sales/pos');
      await user.click(await screen.findByRole('button', { name: 'Installments' }));
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());
      const hint = 'Choose the customer first: an installment sale needs one.';
      expect(screen.getByText(hint)).toBeInTheDocument();
      const picker = await screen.findByRole('dialog');
      await user.type(within(picker).getByRole('searchbox'), 'Mona');
      await user.click(await within(picker).findByRole('button', { name: /Mona Adel/ }));
      await waitFor(() => expect(screen.queryByText(hint)).not.toBeInTheDocument());
    },
  );

  it('shows the switch only with installment.create', async () => {
    setPermissions(['sale.create', 'customer.create']);
    await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Confirm and pay/ })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: 'Installments' })).not.toBeInTheDocument();
  });

  it(
    'sells on installments: terms, server checks, down payment, contract on the done card',
    { timeout: 20_000 },
    async () => {
      const user = await open();
      await user.click(await screen.findByRole('button', { name: 'Installments' }));
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());

      const dialog = await screen.findByRole('dialog', { name: 'Installment sale' });
      // The down payment starts at the policy's minimum (10 % of 12 000).
      expect(within(dialog).getByLabelText('Down payment')).toHaveValue('1200.00');
      await waitFor(() =>
        expect(within(dialog).getByTestId('terms-profit')).toHaveTextContent('2,160.00'),
      );
      expect(within(dialog).getByTestId('terms-total')).toHaveTextContent('12,960.00');
      await waitFor(() => expect(preview).toHaveBeenCalled());
      expect(preview.mock.calls.at(-1)![0]).toMatchObject({
        cash_price: '12000.00',
        down_payment: '1200.00',
        installments_count: 12,
        customer_id: MONA,
      });
      const next = within(dialog).getByRole('button', { name: 'Next: down payment' });
      await waitFor(() => expect(next).toBeEnabled());
      await user.click(next);

      const pay = await screen.findByRole('dialog', { name: 'Down payment' });
      expect(within(pay).getByTestId('pay-total')).toHaveTextContent('1,200.00');
      await user.click(within(pay).getByRole('button', { name: 'Pay' }));

      await waitFor(() => expect(sell).toHaveBeenCalledTimes(1));
      const [body, key] = sell.mock.calls[0]!;
      expect(body).toMatchObject({
        lines: [{ product_id: TV, quantity: 1 }],
        expected_total: '12000.00',
        customer_id: MONA,
        terms: {
          down_payment: '1200.00',
          installments_count: 12,
          frequency: 'monthly',
          policy_version: 3,
        },
        guarantor_ids: [],
        payments: [{ method: 'cash', amount: '1200.00' }],
      });
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      const done = await screen.findByTestId('done-contract');
      expect(done).toHaveTextContent('MAIN-CT-26-000001');
      expect(done).toHaveTextContent('12,960.00');
      expect(screen.getByRole('link', { name: 'View contract' })).toHaveAttribute(
        'href',
        `/contracts/${CONTRACT}`,
      );
    },
  );

  it(
    'a changed policy sends the cashier back to the terms with a message',
    { timeout: 20_000 },
    async () => {
      sell.mockRejectedValueOnce(
        Object.assign(new ApiError(409, 'POLICY_CHANGED', 'refused'), {
          details: { current_version: 4 },
        }),
      );
      const user = await open();
      await user.click(await screen.findByRole('button', { name: 'Installments' }));
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());
      const dialog = await screen.findByRole('dialog', { name: 'Installment sale' });
      const next = within(dialog).getByRole('button', { name: 'Next: down payment' });
      await waitFor(() => expect(next).toBeEnabled());
      await user.click(next);
      const pay = await screen.findByRole('dialog', { name: 'Down payment' });
      await user.click(within(pay).getByRole('button', { name: 'Pay' }));

      const back = await screen.findByRole('dialog', { name: 'Installment sale' });
      expect(
        await within(back).findByText(
          'The installment policy changed (version 4). Check the new terms.',
        ),
      ).toBeInTheDocument();
    },
  );

  it(
    'uses an approved credit exception and sells with no down payment step at 0.00',
    { timeout: 20_000 },
    async () => {
      preview.mockImplementation(async (body: InstallmentPreviewBody) =>
        previewOf(body, 'approved'),
      );
      const user = await open();
      await user.click(await screen.findByRole('button', { name: 'Installments' }));
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());
      const dialog = await screen.findByRole('dialog', { name: 'Installment sale' });
      const down = within(dialog).getByLabelText('Down payment');
      await user.clear(down);
      await user.type(down, '0');
      expect(
        await within(dialog).findByText('Credit: an approved exception covers it'),
      ).toBeInTheDocument();
      const confirm = () => screen.getByRole('button', { name: 'Confirm the sale' });
      await waitFor(() => expect(confirm()).toBeEnabled());
      await user.click(confirm());

      await waitFor(() => expect(sell).toHaveBeenCalledTimes(1));
      const [body] = sell.mock.calls[0]!;
      expect(body).toMatchObject({ credit_approval_id: APPROVAL, terms: { down_payment: '0.00' } });
      expect(body).not.toHaveProperty('payments');
      expect(screen.queryByRole('dialog', { name: 'Down payment' })).not.toBeInTheDocument();
    },
  );

  it(
    'a sale within the credit limit sends no credit_approval_id',
    { timeout: 20_000 },
    async () => {
      const user = await open();
      await user.click(await screen.findByRole('button', { name: 'Installments' }));
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());
      const dialog = await screen.findByRole('dialog', { name: 'Installment sale' });
      expect(await within(dialog).findByText('Credit: OK')).toBeInTheDocument();
      const next = within(dialog).getByRole('button', { name: 'Next: down payment' });
      await waitFor(() => expect(next).toBeEnabled());
      await user.click(next);
      const pay = await screen.findByRole('dialog', { name: 'Down payment' });
      await user.click(within(pay).getByRole('button', { name: 'Pay' }));

      await waitFor(() => expect(sell).toHaveBeenCalledTimes(1));
      expect(sell.mock.calls[0]![0]).not.toHaveProperty('credit_approval_id');
    },
  );

  describe('EC-151 held installment carts', () => {
    const sara = {
      id: SARA,
      full_name: 'Sara Adel',
      relation: 'sister',
      archived_at: null,
    } as unknown as Awaited<ReturnType<typeof guarantorsApi.ofCustomer>>[number];
    const inDays = (n: number) => {
      const d = new Date(`${shopToday()}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    /** A cart held on this device, as the hold stores it; `installment` is the EC-151 part. */
    const held = (installment?: Record<string, unknown>) => [
      {
        id: 'b0660000-0000-4000-8000-000000000001',
        at: ts,
        note: '',
        lines: [
          {
            key: TV,
            product_id: TV,
            name: 'TV',
            sku: tv.sku,
            unit_id: null,
            serial: null,
            quantity: '1',
            price: '',
            discount: { type: 'percent', value: '' },
          },
        ],
        customer: { id: MONA, name: 'Mona Adel', phone: null },
        saleDiscount: { type: 'percent', value: '' },
        reason: '',
        ...(installment ? { installment } : {}),
      },
    ];
    const withWeekly = () =>
      vi.spyOn(settingsApi, 'get').mockResolvedValue({
        installment_policy: { ...policy, allowed_frequencies: ['monthly', 'weekly'] },
      } as unknown as ShopSettings);

    /** Opens the page, resumes the held cart and opens its installment terms. */
    async function resumeToTerms(switchToInstallments = false) {
      await renderApp(<PosPage />, { lang: 'en', route: '/sales/pos' });
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Held carts (1)' }));
      const list = await screen.findByRole('dialog', { name: 'Held carts' });
      await user.click(within(list).getByRole('button', { name: 'Resume' }));
      // A cart held with terms comes back in installment mode; one held without them does not.
      if (switchToInstallments) {
        await user.click(await screen.findByRole('button', { name: 'Installments' }));
      }
      await waitFor(() => expect(termsButton()).toBeEnabled());
      await user.click(termsButton());
      return { user, dialog: await screen.findByRole('dialog', { name: 'Installment sale' }) };
    }

    it(
      'hold then resume keeps the down payment, the count and the ticked guarantor',
      { timeout: 30_000 },
      async () => {
        vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([sara]);
        const user = await open();
        await user.click(await screen.findByRole('button', { name: 'Installments' }));
        await waitFor(() => expect(termsButton()).toBeEnabled());
        await user.click(termsButton());
        const dialog = await screen.findByRole('dialog', { name: 'Installment sale' });
        const down = within(dialog).getByLabelText('Down payment');
        await user.clear(down);
        await user.type(down, '3000');
        const count = within(dialog).getByLabelText('Number of installments');
        await user.clear(count);
        await user.type(count, '10');
        await user.click(await within(dialog).findByRole('checkbox', { name: /Sara Adel/ }));
        await user.click(within(dialog).getByRole('button', { name: 'Back to the cart' }));

        await user.keyboard('{F8}');
        const hold = await screen.findByRole('dialog', { name: 'Hold this cart' });
        await user.type(within(hold).getByLabelText('Note (optional)'), 'later{Enter}');
        await screen.findByRole('button', { name: 'Held carts (1)' });
        const kept = JSON.parse(localStorage.getItem(HELD_KEY)!) as Record<string, unknown>[];
        expect(kept[0]!.installment).toEqual({
          down_payment: '3000.00',
          installments_count: 10,
          frequency: 'monthly',
          guarantor_ids: [SARA],
        });

        await user.keyboard('{F9}');
        const list = await screen.findByRole('dialog', { name: 'Held carts' });
        await user.click(within(list).getByRole('button', { name: 'Resume' }));
        await waitFor(() => expect(termsButton()).toBeEnabled());
        await user.click(termsButton());
        const back = await screen.findByRole('dialog', { name: 'Installment sale' });
        expect(within(back).getByLabelText('Down payment')).toHaveValue('3000.00');
        expect(within(back).getByLabelText('Number of installments')).toHaveValue('10');
        expect(await within(back).findByRole('checkbox', { name: /Sara Adel/ })).toBeChecked();
        expect(within(back).queryByText(/no longer/)).not.toBeInTheDocument();
      },
    );

    it(
      'resume restores the frequency and the first due date too',
      { timeout: 30_000 },
      async () => {
        withWeekly();
        const first = inDays(10);
        localStorage.setItem(
          HELD_KEY,
          JSON.stringify(
            held({
              down_payment: '2500.00',
              installments_count: 8,
              frequency: 'weekly',
              first_due_date: first,
              guarantor_ids: [],
            }),
          ),
        );
        const { dialog } = await resumeToTerms();
        expect(within(dialog).getByLabelText('Down payment')).toHaveValue('2500.00');
        expect(within(dialog).getByLabelText('Number of installments')).toHaveValue('8');
        expect(within(dialog).getByLabelText('Frequency')).toHaveValue('weekly');
        await waitFor(() =>
          expect(preview.mock.calls.at(-1)![0]).toMatchObject({
            frequency: 'weekly',
            installments_count: 8,
            first_due_date: first,
          }),
        );
        expect(within(dialog).queryByText(/no longer/)).not.toBeInTheDocument();
      },
    );

    it(
      'a cart held before EC-151 (no terms) resumes with the default terms',
      { timeout: 30_000 },
      async () => {
        localStorage.setItem(HELD_KEY, JSON.stringify(held()));
        const { dialog } = await resumeToTerms(true);
        expect(within(dialog).getByLabelText('Down payment')).toHaveValue('1200.00');
        expect(within(dialog).getByLabelText('Number of installments')).toHaveValue('12');
        expect(within(dialog).queryByText(/no longer/)).not.toBeInTheDocument();
      },
    );

    it(
      'terms that do not parse are dropped, the cart still resumes',
      { timeout: 30_000 },
      async () => {
        localStorage.setItem(
          HELD_KEY,
          JSON.stringify(held({ down_payment: 5, frequency: 'daily' })),
        );
        const { dialog } = await resumeToTerms(true);
        expect(within(dialog).getByLabelText('Down payment')).toHaveValue('1200.00');
      },
    );

    it(
      'values the policy or the guarantors no longer allow fall back, with a note each',
      { timeout: 30_000 },
      async () => {
        vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([sara]);
        localStorage.setItem(
          HELD_KEY,
          JSON.stringify(
            held({
              down_payment: '100.00',
              installments_count: 36,
              frequency: 'weekly',
              first_due_date: '2020-01-01',
              guarantor_ids: [SARA, GONE],
            }),
          ),
        );
        const { dialog } = await resumeToTerms();
        expect(within(dialog).getByLabelText('Down payment')).toHaveValue('1200.00');
        expect(within(dialog).getByLabelText('Number of installments')).toHaveValue('12');
        expect(within(dialog).getByLabelText('Frequency')).toHaveValue('monthly');
        for (const note of [
          'The saved down payment is no longer allowed. The minimum was used.',
          'The saved number of installments is no longer allowed. The default was used.',
          'The saved frequency is no longer allowed. The default was used.',
          'The saved first due date has passed. It was cleared.',
          'A saved guarantor is no longer linked to this customer. They were unticked.',
        ]) {
          expect(await within(dialog).findByText(note)).toBeInTheDocument();
        }
        // The guarantor who is still linked stays ticked.
        expect(await within(dialog).findByRole('checkbox', { name: /Sara Adel/ })).toBeChecked();
      },
    );
  });
});
