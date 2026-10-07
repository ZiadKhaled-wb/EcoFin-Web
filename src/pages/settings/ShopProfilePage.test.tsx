import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shopProfileApi } from '@/services/shopProfileApi';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import ShopProfilePage from './ShopProfilePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/services/shopProfileApi', () => ({
  shopProfileApi: { get: vi.fn(), update: vi.fn() },
}));

const profile = {
  legal_name: 'Seller Ltd',
  commercial_register: 'CR-7',
  tax_registration_no: 'TAX-9',
  consumer_finance_legal_status: 'Owner supplied',
  creditor_model: 'in_house' as const,
  installments_enabled: true,
  updated_at: '2026-10-07T09:00:00Z',
};

describe('ShopProfilePage', () => {
  beforeEach(() => {
    vi.mocked(shopProfileApi.get).mockResolvedValue(profile);
    vi.mocked(shopProfileApi.update).mockResolvedValue({ ...profile, installments_enabled: false });
    signOut();
    signIn();
  });

  it.each(['ar', 'en'] as const)(
    'shows the profile and the read-only V1 model in %s',
    async (lang) => {
      await renderApp(<ShopProfilePage />, { lang });
      expect(
        await screen.findByDisplayValue(
          lang === 'ar' ? 'تمويل داخلي (الإصدار الأول)' : 'In-house financing (V1)',
        ),
      ).toHaveAttribute('readonly');
      expect(screen.getByRole('switch')).toBeChecked();
    },
  );

  it('saves legal details and installment availability', async () => {
    const user = userEvent.setup();
    await renderApp(<ShopProfilePage />, { lang: 'en' });
    const legalStatus = await screen.findByDisplayValue('Owner supplied');
    await user.clear(legalStatus);
    await user.type(legalStatus, 'Owner confirmed');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(shopProfileApi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          consumer_finance_legal_status: 'Owner confirmed',
          installments_enabled: false,
        }),
      ),
    );
  });
});
