import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { t } from '@/i18n';
import { subscriptionApi } from '@/services/subscriptionApi';
import { adminApi } from '@/services/shopApi';
import { ApiError } from '@/lib/api';
import SubscriptionPage from './SubscriptionPage';
import type {AdminSubscription} from '@ziadkhaled-wb/contracts';
const data:AdminSubscription = {
  plan_key: 'retail',
  plan_name: 'Retail',
  plan: {
    key: 'retail',
    name: 'Retail',
    max_branches: 3,
    max_users: 15,
    max_devices: 6,
    modules: ['pos'],
  },
  subscription_start: '2026-10-01',
  subscription_end: null,
  days_left: null,
  state: 'no_end' as const,
  read_only: false,
  usage: {
    branches: { used: 2, limit: 3 },
    users: { used: 1, limit: 15 },
    devices: { used: 0, limit: 6 },
    modules: ['pos'],
  },
  modules: ['pos'],
  payments: [],
};
beforeEach(() => {
  vi.spyOn(subscriptionApi, 'adminStatus').mockResolvedValue(data);
  vi.spyOn(adminApi, 'plans').mockResolvedValue([
    { key: 'starter', name: 'Starter', price_monthly: '500' },
  ]);
});
afterEach(() => vi.restoreAllMocks());
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/admin/shops/a0500000-0000-4000-8000-000000000001']}>
        <Routes>
          <Route path="/admin/shops/:id" element={<SubscriptionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('P05 subscription admin', () => {
  it('sends null for no end', async () => {
    const save = vi
      .spyOn(subscriptionApi, 'dates')
      .mockResolvedValue({ start: '2026-10-01', end: null });
    mount();
    const user = userEvent.setup();
    await screen.findByText('Retail');
    await user.type(screen.getByLabelText(t('subscriptions.datesReason')), 'support');
    await user.click(screen.getByRole('button', { name: t('subscriptions.saveDates') }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.any(String), {
        start: '2026-10-01',
        end: null,
        reason: 'support',
      }),
    );
  });
  it('lists resources blocking downgrade', async () => {
    const error = new ApiError(409, 'PLAN_DOWNGRADE_BLOCKED', 'blocked');
    error.details = [{ resource: 'branches', limit: 1, used: 2 }];
    vi.spyOn(subscriptionApi, 'plan').mockRejectedValue(error);
    mount();
    const user = userEvent.setup();
    await screen.findByText('Retail');
    await screen.findByRole('option', { name: 'Starter' });
    await user.selectOptions(screen.getByLabelText(t('subscriptions.newPlan')), 'starter');
    await user.type(screen.getByLabelText(t('subscriptions.planReason')), 'downgrade');
    await user.click(screen.getByRole('button', { name: t('subscriptions.savePlan') }));
    expect(
      await screen.findByText(
        t('subscriptions.overLimit', {
          resource: t('subscriptions.resources.branches'),
          used: 2,
          limit: 1,
        }),
      ),
    ).toBeInTheDocument();
  });
  it('sends UUID payment key and disables during payment', async () => {
    let resolve!: (value: { payment_id: string; subscription_end: null }) => void;
    const payment = vi.spyOn(subscriptionApi, 'payment').mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByText('Retail');
    await user.click(screen.getByRole('button', { name: t('subscriptions.recordPayment') }));
    await user.type(screen.getByLabelText(t('subscriptions.amount')), '500.25');
    await user.type(screen.getByLabelText(t('subscriptions.periodStart')), '2026-10-01');
    await user.type(screen.getByLabelText(t('subscriptions.periodEnd')), '2026-10-31');
    const submit = screen.getByRole('button', { name: t('subscriptions.savePayment') });
    await user.click(submit);
    await waitFor(() =>
      expect(payment).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ amount: '500.25', extend: true }),
        expect.stringMatching(/^[a-f0-9-]{36}$/),
      ),
    );
    expect(submit).toBeDisabled();
    resolve({ payment_id: 'a0500000-0000-4000-8000-000000000002', subscription_end: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
