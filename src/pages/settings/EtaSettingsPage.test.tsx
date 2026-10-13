import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sale, type Device, type EtaSettings } from '@ziadkhaled-wb/contracts';
import { etaApi } from '@/services/etaApi';
import { ApiError } from '@/lib/api';
import { renderApp, signIn, signOut, BRANCH_MAIN } from '@/test/renderApp';
import { t } from '@/i18n';
import { filterNav, NAV } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import EtaSettingsPage from './EtaSettingsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const DEVICE = '66666666-6666-4666-8666-666666666666';
const stored: EtaSettings = {
  environment: 'preprod',
  client_id: 'client-1',
  has_client_secret: true,
  activity_code: '4620',
  is_enabled: true,
  updated_at: '2026-10-12T09:00:00Z',
};
const device: Device = {
  id: DEVICE,
  name: 'Till 1',
  branch_id: BRANCH_MAIN,
  branch_name: 'Main',
  eta_serial: 'POS-001',
  eta_os_version: 'os',
  eta_model_framework: '1',
  eta_status: 'active',
  has_preshared_key: true,
  is_active: true,
  paired: false,
  paired_at: null,
  last_seen_at: null,
};

beforeEach(() => {
  signIn();
  vi.spyOn(etaApi, 'settings').mockResolvedValue(stored);
  vi.spyOn(etaApi, 'devices').mockResolvedValue([device]);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe('T02 ETA settings', () => {
  it('the client secret is write-only: never shown, sent only when typed', async () => {
    const save = vi.spyOn(etaApi, 'saveSettings').mockResolvedValue(stored);
    await renderApp(<EtaSettingsPage />, { lang: 'en' });
    const u = userEvent.setup();

    expect(await screen.findByLabelText(t('eta.clientId'))).toHaveValue('client-1');
    const secret = screen.getByLabelText(t('eta.clientSecret'));
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute('type', 'password');
    expect(screen.getByText(t('eta.secretSaved'))).toBeInTheDocument();

    // Saved without touching the secret: the request has no secret, so the stored one is kept.
    await u.click(screen.getByRole('button', { name: t('eta.save') }));
    expect(save).toHaveBeenLastCalledWith({
      environment: 'preprod',
      client_id: 'client-1',
      activity_code: '4620',
      is_enabled: true,
    });

    await u.type(screen.getByLabelText(t('eta.clientSecret')), 'new-secret');
    await u.click(screen.getByRole('button', { name: t('eta.save') }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ client_secret: 'new-secret' }));
    // After the save the typed secret is gone from the page.
    expect(await screen.findByLabelText(t('eta.clientSecret'))).toHaveValue('');
  });

  it('warns before switching to production', async () => {
    await renderApp(<EtaSettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    const environment = await screen.findByLabelText(t('eta.environment'));
    expect(screen.queryByText(t('eta.prodWarning'))).not.toBeInTheDocument();
    await u.selectOptions(environment, 'prod');
    expect(screen.getByRole('alert')).toHaveTextContent(t('eta.prodWarning'));
    await u.selectOptions(environment, 'preprod');
    expect(screen.queryByText(t('eta.prodWarning'))).not.toBeInTheDocument();
  });

  it('shows the Arabic warning too (RTL)', async () => {
    await renderApp(<EtaSettingsPage />, { lang: 'ar' });
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText(t('eta.environment')), 'prod');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('alert')).toHaveTextContent(t('eta.prodWarning'));
  });

  it('explains why the environment cannot change while receipts are on their way', async () => {
    vi.spyOn(etaApi, 'saveSettings').mockRejectedValue(new ApiError(409, 'ETA_ENV_BUSY', 'busy'));
    await renderApp(<EtaSettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText(t('eta.environment')), 'prod');
    await u.click(screen.getByRole('button', { name: t('eta.save') }));
    expect(await screen.findByText(t('eta.errors.ETA_ENV_BUSY'))).toBeInTheDocument();
  });

  it('refuses to turn ETA on without a client ID before calling the server', async () => {
    vi.spyOn(etaApi, 'settings').mockResolvedValue({
      ...stored,
      client_id: null,
      activity_code: 'bad code',
      is_enabled: false,
    });
    const save = vi.spyOn(etaApi, 'saveSettings').mockResolvedValue(stored);
    await renderApp(<EtaSettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: t('eta.save') }));
    expect(await screen.findByText(t('eta.validation'))).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('tests the connection with the chosen device and shows the ETA reason', async () => {
    const test = vi
      .spyOn(etaApi, 'test')
      .mockResolvedValueOnce({ ok: false, message: 'invalid_presharedkey' })
      .mockResolvedValueOnce({ ok: true, message: null });
    await renderApp(<EtaSettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    const run = await screen.findByRole('button', { name: t('eta.test.run') });
    expect(run).toBeDisabled();
    await u.selectOptions(await screen.findByLabelText(t('eta.test.device')), DEVICE);
    await u.click(run);
    expect(test).toHaveBeenCalledWith(DEVICE);
    expect(
      await screen.findByText(t('eta.test.failed', { reason: 'invalid_presharedkey' })),
    ).toBeInTheDocument();
    await u.click(run);
    expect(await screen.findByText(t('eta.test.ok'))).toBeInTheDocument();
  });

  it('the menu items need org.settings_manage and device.manage', () => {
    const user = useAuthStore.getState().user!;
    const menu = (permissions: string[]) =>
      JSON.stringify(filterNav(NAV, { ...user, role: 'CASHIER', permissions }));
    expect(menu([])).not.toContain('/settings/eta');
    expect(menu([])).not.toContain('/settings/devices');
    expect(menu(['org.settings_manage'])).toContain('/settings/eta');
    expect(menu(['org.settings_manage'])).not.toContain('/settings/devices');
    expect(menu(['device.manage'])).toContain('/settings/devices');
  });

  it('a sale carries its ETA receipt for the printout (Sale.eta)', () => {
    const eta = {
      status: 'pending' as const,
      uuid: 'a'.repeat(64),
      qr_payload:
        'https://preprod.invoicing.eta.gov.eg/receipts/search/x/share/y#Total:1.00,IssuerRIN:1',
      last_error_code: null,
    };
    // `eta` is part of the Sale contract (optional: a sale without a receipt has none).
    expect(Sale.shape.eta.parse(eta)).toEqual(eta);
    expect(Sale.shape.eta.parse(null)).toBeNull();
    expect(Sale.shape.eta.parse(undefined)).toBeUndefined();
  });
});
