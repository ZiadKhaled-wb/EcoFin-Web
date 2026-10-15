import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  CreditException,
  CreditProfile,
  Customer,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { creditApi } from '@/services/creditApi';
import { customersApi } from '@/services/customersApi';
import { guarantorsApi } from '@/services/guarantorsApi';
import { t } from '@/i18n';
import CustomerPage from './CustomerPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0730000-0000-4000-8000-0000000000c1';
const timestamp = '2026-10-16T09:00:00.000Z';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: CUSTOMER_ID,
  full_name: 'Ahmed Ali Hassan',
  phones: ['01001234567'],
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: '1990-01-01',
  gender: 'male',
  governorate_code: '01',
  address: null,
  city: null,
  job: null,
  employer: null,
  monthly_income: '8000.00',
  is_business: false,
  tax_registration_no: null,
  status: 'active',
  notes: null,
  id_photos_count: 0,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});

const profile = (over: Partial<CreditProfile> = {}): CreditProfile => ({
  customer_id: CUSTOMER_ID,
  status: 'active',
  credit_limit: '20000.00',
  suggested_limit: '24000.00',
  exposure: '14000.00',
  available: '6000.00',
  over_limit_by: '0.00',
  score: 75,
  min_score: 50,
  components: [
    { key: 'guarantors', weight: 40, value: 1, points: 40 },
    { key: 'income', weight: 30, value: 1, points: 30 },
    { key: 'residence', weight: 20, value: 0, points: 0 },
    { key: 'identity', weight: 10, value: 0.5, points: 5 },
  ],
  behaviour: {
    due_lines: 3,
    on_time_pct: 33,
    max_days_late: 10,
    current_overdue_amount: '1000.00',
    overdue_lines: 1,
    open_contracts: 2,
    completed_contracts: 1,
  },
  store_credit: '0.00',
  limit_history: [
    { at: timestamp, by_name: 'Owner', from: '0.00', to: '20000.00', reason: 'Good payer' },
    { at: '2026-10-15T09:00:00.000Z', by_name: null, from: '20000.00', to: '0.00', reason: null },
  ],
  ...over,
});

const exception = (over: Partial<CreditException> = {}): CreditException => ({
  id: 'a0730000-0000-4000-8000-0000000000e1',
  status: 'pending',
  customer_id: CUSTOMER_ID,
  customer_name: 'Ahmed Ali Hassan',
  financed_amount: '8000.00',
  reasons: ['limit'],
  reason: 'New fridge',
  snapshot: {
    limit: '20000.00',
    exposure: '14000.00',
    available: '6000.00',
    score: 75,
    min_score: 50,
  },
  requested_by_name: 'Cashier',
  requested_at: timestamp,
  mine: true,
  decided_by_name: null,
  decided_at: null,
  decision_note: null,
  expires_at: null,
  used: false,
  ...over,
});

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderPage = (lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/:id" element={<CustomerPage />} />
    </Routes>,
    { lang, route: `/customers/${CUSTOMER_ID}` },
  );
const escape = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const card = () => screen.findByRole('heading', { level: 2, name: t('credit.card.title') });

describe('R03 customer credit card', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['credit.approve', 'sale.create']);
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([]);
    vi.spyOn(creditApi, 'profile').mockResolvedValue(profile());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the limit, exposure, available credit, score, behaviour and the last limit changes', async () => {
    await renderPage();
    await card();
    expect(await screen.findByText(t('credit.card.limit'))).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.exposure'))).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.available'))).toBeInTheDocument();
    expect(
      screen.getByText(t('credit.card.suggested', { amount: '24,000.00 EGP' })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    const bar = screen.getByRole('progressbar', { name: t('credit.card.scoreTitle') });
    expect(bar).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText(t('credit.card.scoreMin', { min: '50' }))).toBeInTheDocument();
    const credit = within((await card()).closest('section')!);
    expect(credit.getByText(t('credit.score.guarantors'))).toBeInTheDocument();
    expect(credit.getByText(t('credit.score.residence'))).toBeInTheDocument();
    expect(
      screen.getByText(t('credit.card.onTimeValue', { pct: '33', count: '3' })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.daysValue', { count: '10' }))).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.openContracts'))).toBeInTheDocument();
    expect(screen.getByText('Good payer', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.noReason'), { exact: false })).toBeInTheDocument();
  });

  it('a customer over the limit shows the excess in red and a score below the minimum says so', async () => {
    vi.spyOn(creditApi, 'profile').mockResolvedValue(
      profile({ available: '0.00', over_limit_by: '4000.00', score: 40 }),
    );
    await renderPage();
    await card();
    expect(
      await screen.findByRole('alert', { name: '' }).catch(() => screen.findByRole('alert')),
    ).toHaveTextContent(t('credit.card.overLimit', { amount: '4,000.00 EGP' }));
    expect(screen.getByText(t('credit.card.scoreBelow'))).toBeInTheDocument();
  });

  it('without installment history it says so', async () => {
    vi.spyOn(creditApi, 'profile').mockResolvedValue(
      profile({
        suggested_limit: null,
        behaviour: {
          due_lines: 0,
          on_time_pct: null,
          max_days_late: null,
          current_overdue_amount: '0.00',
          overdue_lines: 0,
          open_contracts: 0,
          completed_contracts: 0,
        },
        limit_history: [],
      }),
    );
    await renderPage();
    await card();
    expect(await screen.findByText(t('credit.card.noHistory'))).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.noChanges'))).toBeInTheDocument();
    expect(screen.queryByText(/Suggested limit/)).toBeNull();
  });

  it('renders in Arabic with the Arabic words', async () => {
    await renderPage('ar');
    expect(
      await screen.findByRole('heading', { level: 2, name: t('credit.card.title') }),
    ).toBeInTheDocument();
    expect(t('credit.card.title')).toBe('الائتمان');
    expect(
      await screen.findByRole('button', { name: t('credit.card.setLimit') }),
    ).toBeInTheDocument();
    expect(screen.getByText(/الحد الأدنى/)).toBeInTheDocument();
  });

  it('hides Set limit without credit.approve and the request button without a sale key', async () => {
    setPermissions(['sale.create']);
    await renderPage();
    await card();
    await screen.findByText(t('credit.card.limit'));
    expect(screen.queryByRole('button', { name: t('credit.card.setLimit') })).toBeNull();
    expect(
      screen.getByRole('button', { name: t('credit.card.requestException') }),
    ).toBeInTheDocument();
    setPermissions(['customer.create']);
    await renderPage();
    expect(
      screen.queryAllByRole('button', { name: t('credit.card.requestException') }),
    ).toHaveLength(1);
  });

  it('a blocked customer can not be given an exception', async () => {
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer({ status: 'blocked' }));
    await renderPage();
    await card();
    await screen.findByText(t('credit.card.limit'));
    expect(screen.queryByRole('button', { name: t('credit.card.requestException') })).toBeNull();
    expect(screen.getByRole('button', { name: t('credit.card.setLimit') })).toBeInTheDocument();
    expect(screen.getByText(t('credit.card.blockedHint'))).toBeInTheDocument();
  });

  it('a profile that fails to load shows an error with a retry', async () => {
    vi.spyOn(creditApi, 'profile').mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    await renderPage();
    expect(await screen.findByText(t('credit.card.loadFailed'))).toBeInTheDocument();
  });

  it('the limit dialog starts at the suggestion, needs a reason to raise, and sends a trimmed body', async () => {
    const setLimit = vi
      .spyOn(creditApi, 'setLimit')
      .mockResolvedValue(profile({ credit_limit: '30000.00' }));
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('credit.card.setLimit') }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(new RegExp(t('credit.limit.field')));
    expect(field).toHaveValue('24000.00');
    expect(
      within(dialog).getByText(t('credit.limit.suggestedHint', { amount: '24,000.00 EGP' })),
    ).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '30000');
    await user.click(within(dialog).getByRole('button', { name: t('credit.limit.save') }));
    expect(await within(dialog).findByText(t('credit.errors.reasonRequired'))).toBeInTheDocument();
    expect(setLimit).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(t('credit.limit.reason')), '  Good payer ');
    await user.click(within(dialog).getByRole('button', { name: t('credit.limit.save') }));
    await waitFor(() => expect(setLimit).toHaveBeenCalledTimes(1));
    expect(setLimit).toHaveBeenCalledWith(CUSTOMER_ID, {
      credit_limit: '30000.00',
      reason: 'Good payer',
    });
    expect(await screen.findByText(t('credit.limit.saved'))).toBeInTheDocument();
  });

  it('lowering the limit needs no reason', async () => {
    const setLimit = vi
      .spyOn(creditApi, 'setLimit')
      .mockResolvedValue(profile({ credit_limit: '10000.00' }));
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('credit.card.setLimit') }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(new RegExp(t('credit.limit.field')));
    await user.clear(field);
    await user.type(field, '10000');
    await user.click(within(dialog).getByRole('button', { name: t('credit.limit.save') }));
    await waitFor(() => expect(setLimit).toHaveBeenCalledTimes(1));
    expect(setLimit).toHaveBeenCalledWith(CUSTOMER_ID, { credit_limit: '10000.00' });
  });

  it('a refusal from the server shows in the dialog in words', async () => {
    vi.spyOn(creditApi, 'setLimit').mockRejectedValue(new ApiError(403, 'PERMISSION_DENIED', 'no'));
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('credit.card.setLimit') }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(new RegExp(t('credit.limit.field')));
    await user.clear(field);
    await user.type(field, '1000');
    await user.click(within(dialog).getByRole('button', { name: t('credit.limit.save') }));
    expect(await within(dialog).findByText(t('credit.errors.permission'))).toBeInTheDocument();
  });

  it('requesting an exception sends the amount and the trimmed reason', async () => {
    const request = vi.spyOn(creditApi, 'requestException').mockResolvedValue(exception());
    await renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: t('credit.card.requestException') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(escape(t('credit.request.amount'))), '8000');
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('credit.request.reason'))),
      '  New fridge ',
    );
    await user.click(within(dialog).getByRole('button', { name: t('credit.request.send') }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith(CUSTOMER_ID, {
      financed_amount: '8000.00',
      reason: 'New fridge',
    });
    expect(await screen.findByText(t('credit.request.sent'))).toBeInTheDocument();
  });

  it('the request needs an amount and a reason, and the server saying it is not needed is translated', async () => {
    const request = vi
      .spyOn(creditApi, 'requestException')
      .mockRejectedValue(new ApiError(400, 'APPROVAL_NOT_NEEDED', 'x'));
    await renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: t('credit.card.requestException') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('credit.request.send') }));
    expect(await within(dialog).findByText(t('credit.errors.validation'))).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(escape(t('credit.request.amount'))), '100');
    await user.click(within(dialog).getByRole('button', { name: t('credit.request.send') }));
    expect(await within(dialog).findByText(t('credit.errors.reasonRequired'))).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('credit.request.reason'))),
      'Small one',
    );
    await user.click(within(dialog).getByRole('button', { name: t('credit.request.send') }));
    expect(await within(dialog).findByText(t('credit.errors.notNeeded'))).toBeInTheDocument();
  });
});
