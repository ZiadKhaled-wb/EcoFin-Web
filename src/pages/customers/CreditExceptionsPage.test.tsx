import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { CreditException, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { creditApi } from '@/services/creditApi';
import { t } from '@/i18n';
import CreditExceptionsPage from './CreditExceptionsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a0730000-0000-4000-8000-0000000000c1';
const E1 = 'a0730000-0000-4000-8000-0000000000e1';
const E2 = 'a0730000-0000-4000-8000-0000000000e2';
const E3 = 'a0730000-0000-4000-8000-0000000000e3';
const at = '2026-10-16T09:00:00.000Z';

const exception = (over: Partial<CreditException> = {}): CreditException => ({
  id: E1,
  status: 'pending',
  customer_id: CUSTOMER,
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
  requested_by_name: 'Sara Cashier',
  requested_at: at,
  mine: false,
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
      <Route path="/customers/credit-exceptions" element={<CreditExceptionsPage />} />
    </Routes>,
    { lang, route: '/customers/credit-exceptions' },
  );
const row = async (name: string) => {
  const list = await screen.findByRole('list', { name: t('credit.exceptions.title') });
  return within(list).getByText(name).closest('li')!;
};

describe('R03 credit exceptions page', () => {
  beforeEach(() => {
    signIn('OWNER');
    setPermissions(['credit.approve', 'sale.create']);
    vi.spyOn(creditApi, 'list').mockResolvedValue({
      items: [
        exception(),
        exception({
          id: E2,
          customer_name: 'Mona Said',
          mine: true,
          reasons: ['score', 'watch'],
          financed_amount: '3000.00',
          reason: null,
        }),
        exception({
          id: E3,
          customer_name: 'Done Customer',
          status: 'approved',
          decided_by_name: 'Manager',
          decided_at: at,
          decision_note: 'Known customer',
          expires_at: '2026-10-17T09:00:00.000Z',
        }),
      ],
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the requests with the numbers the server stored, the reasons and a link to the customer', async () => {
    await renderPage();
    const first = within(await row('Ahmed Ali Hassan'));
    expect(first.getByText(t('credit.reason.limit'))).toBeInTheDocument();
    expect(first.getByText(t('credit.status.pending'))).toBeInTheDocument();
    expect(first.getByText('New fridge')).toBeInTheDocument();
    expect(
      first.getByText(t('credit.exceptions.requestedBy', { name: 'Sara Cashier' }), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      first.getByText(t('credit.exceptions.score', { score: '75', min: '50' })),
    ).toBeInTheDocument();
    expect(
      first.getByRole('link', {
        name: t('credit.exceptions.openCustomer', { name: 'Ahmed Ali Hassan' }),
      }),
    ).toHaveAttribute('href', `/customers/${CUSTOMER}`);
    const second = within(await row('Mona Said'));
    expect(second.getByText(t('credit.reason.score'))).toBeInTheDocument();
    expect(second.getByText(t('credit.reason.watch'))).toBeInTheDocument();
    const done = within(await row('Done Customer'));
    expect(done.getByText(t('credit.status.approved'))).toBeInTheDocument();
    expect(done.getByText(/Known customer/)).toBeInTheDocument();
    expect(done.queryByRole('button', { name: t('credit.exceptions.approve') })).toBeNull();
  });

  it('asks for the waiting ones first and re-reads with the filter the user picks', async () => {
    const list = vi.spyOn(creditApi, 'list');
    await renderPage();
    await row('Ahmed Ali Hassan');
    expect(list).toHaveBeenCalledWith('pending');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(t('credit.exceptions.filter')), 'all');
    await waitFor(() => expect(list).toHaveBeenCalledWith('all'));
  });

  it('approving confirms and sends approve true, then says so', async () => {
    const decide = vi
      .spyOn(creditApi, 'decide')
      .mockResolvedValue(exception({ status: 'approved', decided_at: at, expires_at: at }));
    await renderPage();
    const user = userEvent.setup();
    await user.click(
      within(await row('Ahmed Ali Hassan')).getByRole('button', {
        name: t('credit.exceptions.approve'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('credit.exceptions.confirmApprove') }),
    );
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide).toHaveBeenCalledWith(E1, { approve: true });
    expect(await screen.findByText(t('credit.exceptions.approved'))).toBeInTheDocument();
  });

  it('rejecting needs a note and sends it trimmed', async () => {
    const decide = vi
      .spyOn(creditApi, 'decide')
      .mockResolvedValue(exception({ status: 'rejected' }));
    await renderPage();
    const user = userEvent.setup();
    await user.click(
      within(await row('Ahmed Ali Hassan')).getByRole('button', {
        name: t('credit.exceptions.reject'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('credit.exceptions.confirmReject') }),
    );
    expect(
      await within(dialog).findByText(t('credit.exceptions.noteRequired')),
    ).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('credit.exceptions.noteLabel'))),
      '  Too much  ',
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('credit.exceptions.confirmReject') }),
    );
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide).toHaveBeenCalledWith(E1, { approve: false, note: 'Too much' });
    expect(await screen.findByText(t('credit.exceptions.rejected'))).toBeInTheDocument();
  });

  it('a refusal from the server is translated inside the dialog', async () => {
    vi.spyOn(creditApi, 'decide').mockRejectedValue(new ApiError(409, 'APPROVAL_NOT_PENDING', 'x'));
    await renderPage();
    const user = userEvent.setup();
    await user.click(
      within(await row('Ahmed Ali Hassan')).getByRole('button', {
        name: t('credit.exceptions.approve'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('credit.exceptions.confirmApprove') }),
    );
    expect(await within(dialog).findByText(t('credit.errors.notPending'))).toBeInTheDocument();
  });

  it('only the requester gets Cancel, and cancelling confirms first', async () => {
    const cancel = vi
      .spyOn(creditApi, 'cancel')
      .mockResolvedValue(exception({ status: 'cancelled' }));
    await renderPage();
    const others = within(await row('Ahmed Ali Hassan'));
    expect(others.queryByRole('button', { name: t('credit.exceptions.cancel') })).toBeNull();
    const mine = within(await row('Mona Said'));
    expect(
      mine.getByText(t('credit.exceptions.requestedByYou'), { exact: false }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(mine.getByRole('button', { name: t('credit.exceptions.cancel') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('credit.exceptions.cancel') }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(E2));
    expect(await screen.findByText(t('credit.exceptions.cancelled'))).toBeInTheDocument();
  });

  it('a manager can not decide their own request but the owner can', async () => {
    signOut();
    signIn('CASHIER');
    await renderPage();
    const mine = within(await row('Mona Said'));
    expect(mine.queryByRole('button', { name: t('credit.exceptions.approve') })).toBeNull();
    expect(mine.queryByRole('button', { name: t('credit.exceptions.reject') })).toBeNull();
    expect(mine.getByRole('button', { name: t('credit.exceptions.cancel') })).toBeInTheDocument();
    const others = within(await row('Ahmed Ali Hassan'));
    expect(
      others.getByRole('button', { name: t('credit.exceptions.approve') }),
    ).toBeInTheDocument();
  });

  it('the owner sees Approve and Reject on their own request', async () => {
    await renderPage();
    const mine = within(await row('Mona Said'));
    expect(mine.getByRole('button', { name: t('credit.exceptions.approve') })).toBeInTheDocument();
    expect(mine.getByRole('button', { name: t('credit.exceptions.reject') })).toBeInTheDocument();
  });

  it('without credit.approve there are no decision buttons, only Cancel on the own request', async () => {
    setPermissions(['sale.create']);
    await renderPage();
    const others = within(await row('Ahmed Ali Hassan'));
    expect(others.queryByRole('button', { name: t('credit.exceptions.approve') })).toBeNull();
    expect(others.queryByRole('button', { name: t('credit.exceptions.reject') })).toBeNull();
    const mine = within(await row('Mona Said'));
    expect(mine.getByRole('button', { name: t('credit.exceptions.cancel') })).toBeInTheDocument();
  });

  it('an empty list says so and a failed load offers a retry', async () => {
    vi.spyOn(creditApi, 'list').mockResolvedValue({ items: [] });
    await renderPage();
    expect(await screen.findByText(t('credit.exceptions.empty'))).toBeInTheDocument();
    signOut();
    signIn('OWNER');
    vi.spyOn(creditApi, 'list').mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    await renderPage();
    expect(await screen.findByText(t('credit.exceptions.loadFailed'))).toBeInTheDocument();
  });

  it('renders in Arabic', async () => {
    await renderPage('ar');
    expect(
      await screen.findByRole('heading', { level: 1, name: t('credit.exceptions.title') }),
    ).toBeInTheDocument();
    expect(t('credit.exceptions.title')).toBe('الاستثناءات الائتمانية');
    const first = within(await row('Ahmed Ali Hassan'));
    expect(first.getByText(t('credit.reason.limit'))).toBeInTheDocument();
    expect(first.getByRole('button', { name: t('credit.exceptions.approve') })).toBeInTheDocument();
  });
});
