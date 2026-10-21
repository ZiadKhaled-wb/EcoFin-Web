import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { t } from '@/i18n';
import { SubscriptionBannerView } from './SubscriptionBanner';
describe('P05 shell banner', () => {
  it.each(['no_end', 'active', 'expiring', 'expired'] as const)('state %s', (state) => {
    render(
      <MemoryRouter>
        <SubscriptionBannerView state={state} daysLeft={10} end="2026-10-31" />
      </MemoryRouter>,
    );
    if (state === 'expiring')
      expect(screen.getByRole('status')).toHaveTextContent(
        t('subscriptions.expiring', { days: 10, date: '2026-10-31' }),
      );
    else if (state === 'expired')
      expect(screen.getByRole('alert')).toHaveTextContent(t('subscriptions.expired'));
    else expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('M03: an expired shop is pointed to the data export, its way out of the system', () => {
    render(
      <MemoryRouter>
        <SubscriptionBannerView state="expired" daysLeft={null} end={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: t('subscriptions.downloadData') })).toHaveAttribute(
      'href',
      '/settings/export',
    );
  });
});
