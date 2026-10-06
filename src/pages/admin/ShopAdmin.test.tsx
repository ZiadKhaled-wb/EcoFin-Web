import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { adminApi } from '@/services/shopApi';
import CreateShopPage from './CreateShopPage';
import AdminShopsPage from './AdminShopsPage';
afterEach(() => vi.restoreAllMocks());
const shop = {
  id: 'a0100000-0000-4000-8000-000000000001',
  name: 'Shop',
  tenant_slug: 'shop-one',
  plan_key: 'starter',
  status: 'active' as const,
  created_at: '2026-10-06T00:00:00Z',
  owner_full_name: 'Owner',
  owner_email: 'owner@example.com',
  owner_invite_status: 'accepted' as const,
  subscription_end: null,
  subscription_state: 'no_end' as const,
};
const renderAdmin = (page: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
describe('shop admin', () => {
  it('validates the create form, including slug and contact', async () => {
    vi.spyOn(adminApi, 'plans').mockResolvedValue([
      { key: 'starter', name: 'Starter', price_monthly: '100' },
    ]);
    const create = vi.spyOn(adminApi, 'create');
    renderAdmin(<CreateShopPage />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Starter' });
    await user.type(screen.getByLabelText(t('shops.fields.slug')), 'BAD-');
    expect(screen.getByLabelText(t('shops.fields.slug'))).toHaveValue('bad-');
    await user.click(screen.getByRole('button', { name: t('shops.create') }));
    expect(await screen.findAllByText(t('shops.validation'))).not.toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });
  it('hides resend for accepted invitations and requires a reason to suspend', async () => {
    vi.spyOn(adminApi, 'shops').mockResolvedValue({ items: [shop], total: 1 });
    const status = vi.spyOn(adminApi, 'status');
    renderAdmin(<AdminShopsPage />);
    const user = userEvent.setup();
    await screen.findByText('Shop');
    expect(screen.queryByRole('button', { name: t('shops.resend') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('shops.suspend') }));
    const confirm = screen.getByRole('button', { name: t('shops.confirmSuspend') });
    expect(confirm).toBeDisabled();
    expect(status).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(t('shops.fields.reason')), 'reason');
    expect(confirm).toBeEnabled();
  });
  it('shows resend for a pending invite', async () => {
    vi.spyOn(adminApi, 'shops').mockResolvedValue({
      items: [{ ...shop, owner_invite_status: 'pending' }],
      total: 1,
    });
    renderAdmin(<AdminShopsPage />);
    expect(await screen.findByRole('button', { name: t('shops.resend') })).toBeInTheDocument();
  });
});
