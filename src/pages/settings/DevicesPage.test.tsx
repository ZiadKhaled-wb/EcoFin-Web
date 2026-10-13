import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '@ziadkhaled-wb/contracts';
import { etaApi } from '@/services/etaApi';
import { ApiError } from '@/lib/api';
import { renderApp, signIn, signOut, BRANCH_MAIN } from '@/test/renderApp';
import { t } from '@/i18n';
import DevicesPage from './DevicesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const DEVICE = '66666666-6666-4666-8666-666666666666';
const registered: Device = {
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
};
const fresh: Device = {
  ...registered,
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Till 2',
  eta_serial: null,
  eta_os_version: null,
  eta_model_framework: null,
  eta_status: 'unregistered',
  has_preshared_key: false,
};

beforeEach(() => {
  signIn();
  vi.spyOn(etaApi, 'devices').mockResolvedValue([registered, fresh]);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

const openDialog = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
  const row = (await screen.findByText(name)).closest('tr')!;
  await u.click(within(row).getByRole('button', { name: t('eta.devices.edit') }));
  return screen.findByRole('dialog');
};

describe('T02 POS devices', () => {
  it('lists each device with its branch, ETA serial and status', async () => {
    await renderApp(<DevicesPage />, { lang: 'en' });
    const first = (await screen.findByText('Till 1')).closest('tr')!;
    expect(within(first).getByText('Main')).toBeInTheDocument();
    expect(within(first).getByText('POS-001')).toBeInTheDocument();
    expect(within(first).getByText(t('eta.devices.statuses.active'))).toBeInTheDocument();
    const second = screen.getByText('Till 2').closest('tr')!;
    expect(within(second).getByText(t('eta.devices.statuses.unregistered'))).toBeInTheDocument();
  });

  it('the pre-shared key is write-only: never shown, sent only when typed', async () => {
    const save = vi.spyOn(etaApi, 'saveDevice').mockResolvedValue(registered);
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup();

    let dialog = await openDialog(u, 'Till 1');
    expect(within(dialog).getByLabelText(t('eta.devices.serial'))).toHaveValue('POS-001');
    const key = within(dialog).getByLabelText(t('eta.devices.presharedKey'));
    expect(key).toHaveValue('');
    expect(key).toHaveAttribute('type', 'password');
    expect(within(dialog).getByText(t('eta.secretSaved'))).toBeInTheDocument();

    // Saved without touching the key: the request has no key, so the stored one is kept.
    await u.click(within(dialog).getByRole('button', { name: t('eta.devices.save') }));
    expect(save).toHaveBeenLastCalledWith(DEVICE, {
      eta_serial: 'POS-001',
      eta_os_version: 'os',
      eta_model_framework: '1',
      eta_status: 'active',
    });

    dialog = await openDialog(u, 'Till 1');
    await u.type(within(dialog).getByLabelText(t('eta.devices.presharedKey')), 'new-key');
    await u.click(within(dialog).getByRole('button', { name: t('eta.devices.save') }));
    expect(save).toHaveBeenLastCalledWith(
      DEVICE,
      expect.objectContaining({ preshared_key: 'new-key' }),
    );

    // Opened again, the typed key is not there.
    dialog = await openDialog(u, 'Till 1');
    expect(within(dialog).getByLabelText(t('eta.devices.presharedKey'))).toHaveValue('');
  });

  it('registers a new device and shows a taken serial', async () => {
    const save = vi
      .spyOn(etaApi, 'saveDevice')
      .mockRejectedValue(new ApiError(409, 'DEVICE_SERIAL_TAKEN', 'taken'));
    await renderApp(<DevicesPage />, { lang: 'ar' });
    const u = userEvent.setup();
    const dialog = await openDialog(u, 'Till 2');
    expect(within(dialog).getByText(t('eta.secretMissing'))).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText(t('eta.devices.serial')), 'POS-001');
    await u.type(within(dialog).getByLabelText(t('eta.devices.osVersion')), 'android');
    await u.type(within(dialog).getByLabelText(t('eta.devices.modelFramework')), '1');
    await u.type(within(dialog).getByLabelText(t('eta.devices.presharedKey')), 'key-2');
    await u.selectOptions(within(dialog).getByLabelText(t('eta.devices.status')), 'active');
    await u.click(within(dialog).getByRole('button', { name: t('eta.devices.save') }));
    expect(save).toHaveBeenCalledWith(fresh.id, {
      eta_serial: 'POS-001',
      eta_os_version: 'android',
      eta_model_framework: '1',
      eta_status: 'active',
      preshared_key: 'key-2',
    });
    expect(await screen.findByText(t('eta.errors.DEVICE_SERIAL_TAKEN'))).toBeInTheDocument();
  });
});
