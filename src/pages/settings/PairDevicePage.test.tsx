// O03: /device/pair turns this browser into a POS device.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { getDeviceToken } from '@/features/devices/deviceToken';
import { devicesApi } from '@/services/devicesApi';
import { ORG_A } from '@/test/authFixtures';
import {
  BRANCH_MAIN,
  TEST_DEVICE_ID,
  TEST_DEVICE_TOKEN,
  pairDevice,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';
import PairDevicePage from './PairDevicePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const device = { id: TEST_DEVICE_ID, name: 'POS-2', branch_id: BRANCH_MAIN, branch_name: 'Maadi' };
const NEW_TOKEN = 'New-Dev1ce-T0ken_'.padEnd(43, 'z');

beforeEach(() => {
  signIn('CASHIER');
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe('O03 pair this computer', () => {
  it('a typed code pairs the computer: the token is stored for the shop and the device is named', async () => {
    const pair = vi
      .spyOn(devicesApi, 'pair')
      .mockResolvedValue({ device_token: NEW_TOKEN, device });
    const current = vi.spyOn(devicesApi, 'current').mockResolvedValue(device);
    await renderApp(<PairDevicePage />, { lang: 'en' });
    const u = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Pair this computer' });
    expect(submit).toBeDisabled();
    await u.type(screen.getByLabelText('Pairing code'), 'abcd-efgh');
    await u.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This computer is now POS-2 (Maadi)',
    );
    expect(pair).toHaveBeenCalledWith('ABCDEFGH');
    expect(window.localStorage.getItem(`ecotech.deviceToken.${ORG_A}`)).toBe(NEW_TOKEN);
    expect(getDeviceToken(ORG_A)).toBe(NEW_TOKEN);
    // The token is never on the page, the typed code is cleared, and the server isn't asked
    // again which device this is: the pairing answer said so.
    expect(document.body.textContent).not.toContain(NEW_TOKEN);
    expect(screen.getByLabelText('Pairing code')).toHaveValue('');
    expect(current).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Go to the shift' })).toHaveAttribute(
      'href',
      '/accounting/shifts',
    );
  });

  it('in Arabic the success names the device and its branch', async () => {
    vi.spyOn(devicesApi, 'pair').mockResolvedValue({ device_token: NEW_TOKEN, device });
    await renderApp(<PairDevicePage />, { lang: 'ar' });
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('كود الربط'), 'ABCDEFGH');
    await u.click(screen.getByRole('button', { name: 'اربط هذا الكمبيوتر' }));
    expect(await screen.findByRole('status')).toHaveTextContent('هذا الكمبيوتر الآن POS-2 (Maadi)');
    expect(screen.getByLabelText('كود الربط')).toHaveAttribute('dir', 'ltr');
  });

  it('a code of the wrong shape is refused here; a wrong code and too many tries are explained', async () => {
    const pair = vi
      .spyOn(devicesApi, 'pair')
      .mockRejectedValueOnce(new ApiError(400, 'PAIRING_CODE_INVALID', 'no'))
      .mockRejectedValueOnce(new ApiError(429, 'TOO_MANY_REQUESTS', 'slow'));
    await renderApp(<PairDevicePage />, { lang: 'en' });
    const u = userEvent.setup();
    const input = screen.getByLabelText('Pairing code');
    await u.type(input, 'ABC');
    await u.click(screen.getByRole('button', { name: 'Pair this computer' }));
    expect(
      await screen.findByText('This code is not valid. Check it, or ask for a new one.'),
    ).toBeInTheDocument();
    expect(pair).not.toHaveBeenCalled();

    await u.clear(input);
    await u.type(input, 'ABCDEFGH');
    await u.click(screen.getByRole('button', { name: 'Pair this computer' }));
    await waitFor(() => expect(pair).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('This code is not valid. Check it, or ask for a new one.'),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Pair this computer' }));
    expect(
      await screen.findByText('Too many attempts. Wait a minute and try again.'),
    ).toBeInTheDocument();
    expect(getDeviceToken(ORG_A)).toBeNull();
  });

  it('a computer that is already a device says which, and can be paired again', async () => {
    pairDevice({ name: 'POS-1', branch_name: 'Main branch' });
    vi.spyOn(devicesApi, 'pair').mockResolvedValue({ device_token: NEW_TOKEN, device });
    await renderApp(<PairDevicePage />, { lang: 'en' });
    expect(await screen.findByText(/This computer is POS-1 \(Main branch\)\./)).toBeInTheDocument();
    expect(getDeviceToken(ORG_A)).toBe(TEST_DEVICE_TOKEN);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Pairing code'), 'ABCDEFGH');
    await u.click(screen.getByRole('button', { name: 'Pair this computer' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This computer is now POS-2 (Maadi)',
    );
    expect(getDeviceToken(ORG_A)).toBe(NEW_TOKEN);
  });
});
