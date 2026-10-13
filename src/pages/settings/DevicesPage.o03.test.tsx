// O03: managing POS devices and making a pairing code on Settings → Devices.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { showSubscriptionError } from '@/lib/subscriptionErrors';
import { branchApi } from '@/services/branchApi';
import { devicesApi } from '@/services/devicesApi';
import { etaApi } from '@/services/etaApi';
import { BRANCH_MAIN, BRANCH_TWO, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import DevicesPage from './DevicesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const POS1 = '66666666-6666-4666-8666-666666666666';
const POS2 = '77777777-7777-4777-8777-777777777777';
const POS3 = '88888888-8888-4888-8888-888888888888';
const base: Device = {
  id: POS1,
  name: 'POS-1',
  branch_id: BRANCH_MAIN,
  branch_name: 'Main',
  eta_serial: null,
  eta_os_version: null,
  eta_model_framework: null,
  eta_status: 'unregistered',
  has_preshared_key: false,
  is_active: true,
  paired: true,
  paired_at: '2026-10-13T09:00:00+00:00',
  last_seen_at: '2026-10-13T09:30:00+00:00',
};
const unpaired: Device = { ...base, id: POS2, name: 'POS-2', paired: false, paired_at: null };
const off: Device = {
  ...unpaired,
  id: POS3,
  name: 'POS-3',
  is_active: false,
  last_seen_at: null,
};

let list: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  signIn();
  list = vi.spyOn(etaApi, 'devices').mockResolvedValue([base, unpaired, off]);
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: BRANCH_MAIN, code: 'MAIN', name: 'Main', is_main: true },
    { id: BRANCH_TWO, code: 'B2', name: 'Second', is_main: false },
  ] as Awaited<ReturnType<typeof branchApi.list>>);
});
afterEach(() => {
  vi.useRealTimers();
  signOut();
  vi.restoreAllMocks();
});

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('O03 POS devices', () => {
  it('shows for each device whether it is on, paired, and when it was last seen', async () => {
    await renderApp(<DevicesPage />, { lang: 'en' });
    const first = await rowOf('POS-1');
    expect(within(first).getByText('On')).toBeInTheDocument();
    expect(within(first).getByText('Paired')).toBeInTheDocument();
    expect(within(first).queryByText('Never')).not.toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Unpair' })).toBeInTheDocument();

    const second = await rowOf('POS-2');
    expect(within(second).getByText('Not paired')).toBeInTheDocument();
    expect(within(second).queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();

    const third = await rowOf('POS-3');
    expect(within(third).getByText('Off')).toBeInTheDocument();
    expect(within(third).getByText('Never')).toBeInTheDocument();
    // A device that is off can't be paired; it can be turned on.
    expect(within(third).queryByRole('button', { name: 'Pair' })).not.toBeInTheDocument();
    expect(within(third).getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('adds a device with a name and a branch, in Arabic', async () => {
    const create = vi.spyOn(devicesApi, 'create').mockResolvedValue({ id: POS3 });
    await renderApp(<DevicesPage />, { lang: 'ar' });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'إضافة جهاز' }));
    const dialog = await screen.findByRole('dialog');
    // No name: nothing is sent.
    await u.click(within(dialog).getByRole('button', { name: 'إضافة الجهاز' }));
    expect(await within(dialog).findByText(t('devices.errors.VALIDATION_FAILED'))).toBeVisible();
    expect(create).not.toHaveBeenCalled();
    await u.type(within(dialog).getByLabelText('اسم الجهاز'), '  POS-4 ');
    await u.selectOptions(within(dialog).getByLabelText('الفرع'), BRANCH_TWO);
    await u.click(within(dialog).getByRole('button', { name: 'إضافة الجهاز' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ name: 'POS-4', branch_id: BRANCH_TWO });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(list.mock.calls.length).toBeGreaterThan(1);
  });

  it('the plan limit is shown as a toast, and a taken name in the dialog', async () => {
    const limit = new ApiError(409, 'PLAN_LIMIT_REACHED', 'limit');
    limit.details = { resource: 'devices', limit: 2, used: 2 };
    const create = vi.spyOn(devicesApi, 'create').mockImplementation(async () => {
      // What the API client does for every refused request (lib/api interceptor).
      showSubscriptionError(limit);
      throw limit;
    });
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add device' }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Device name'), 'POS-4');
    await u.click(within(dialog).getByRole('button', { name: 'Add device' }));
    expect(
      await screen.findByText(
        t('subscriptions.limitReached', {
          limit: 2,
          resource: t('subscriptions.resources.devices'),
        }),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("The shop's plan allows no more devices.")).toBeVisible();

    create.mockRejectedValue(new ApiError(409, 'DEVICE_NAME_TAKEN', 'taken'));
    await u.click(within(dialog).getByRole('button', { name: 'Add device' }));
    expect(
      await within(dialog).findByText('Another device of this branch already has this name.'),
    ).toBeVisible();
  });

  it('renames and moves a device; an open shift is explained', async () => {
    const update = vi
      .spyOn(devicesApi, 'update')
      .mockRejectedValueOnce(new ApiError(409, 'DEVICE_HAS_OPEN_SHIFT', 'open'))
      .mockResolvedValue(base);
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(within(await rowOf('POS-1')).getByRole('button', { name: 'Rename or move' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Device name');
    expect(name).toHaveValue('POS-1');
    expect(within(dialog).getByLabelText('Branch')).toHaveValue(BRANCH_MAIN);
    await u.clear(name);
    await u.type(name, 'Front till');
    await u.selectOptions(within(dialog).getByLabelText('Branch'), BRANCH_TWO);
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('This device has an open shift. Close the shift first.'),
    ).toBeVisible();
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith(POS1, { name: 'Front till', branch_id: BRANCH_TWO });
  });

  it('turning a device off asks for a reason; turning it on is one click', async () => {
    const setActive = vi
      .spyOn(devicesApi, 'setActive')
      .mockResolvedValue({ id: POS1, is_active: false });
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(within(await rowOf('POS-1')).getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Turn off' });
    expect(confirm).toBeDisabled();
    await u.type(within(dialog).getByLabelText('Reason'), '  Stolen ');
    await u.click(confirm);
    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(1));
    expect(setActive).toHaveBeenCalledWith(POS1, { active: false, reason: 'Stolen' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await u.click(within(await rowOf('POS-3')).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(2));
    expect(setActive).toHaveBeenLastCalledWith(POS3, { active: true });
    expect(
      await screen.findByText('Device turned on. Pair it on its computer again.'),
    ).toBeInTheDocument();
  });

  it('unpairs a device after one confirmation', async () => {
    const unpair = vi.spyOn(devicesApi, 'unpair').mockResolvedValue({ id: POS1, paired: false });
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(within(await rowOf('POS-1')).getByRole('button', { name: 'Unpair' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'The computer paired with POS-1 stops being a POS device on its next request.',
      ),
    ).toBeInTheDocument();
    expect(unpair).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole('button', { name: 'Unpair' }));
    await waitFor(() => expect(unpair).toHaveBeenCalledWith(POS1));
  });

  it('Pair shows the code large with what to do and a 15-minute countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-13T09:00:00.000Z') });
    const pairingCode = vi
      .spyOn(devicesApi, 'pairingCode')
      .mockResolvedValueOnce({ code: 'ABCDEFGH', expires_at: '2026-10-13T09:15:00.000Z' })
      .mockResolvedValue({ code: 'JKMNPQRS', expires_at: '2026-10-13T09:31:00.000Z' });
    await renderApp(<DevicesPage />, { lang: 'en' });
    const u = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await u.click(within(await rowOf('POS-2')).getByRole('button', { name: 'Pair' }));
    const dialog = await screen.findByRole('dialog');
    const code = await within(dialog).findByTestId('pairing-code');
    expect(code).toHaveTextContent('ABCDEFGH');
    expect(code).toHaveAttribute('dir', 'ltr');
    expect(code.className).toContain('text-4xl');
    expect(within(dialog).getByText('Enter this code on the POS computer')).toBeInTheDocument();
    expect(within(dialog).getByRole('timer')).toHaveTextContent('Valid for 15:00');
    expect(pairingCode).toHaveBeenCalledWith(POS2);
    // One open, one request: a second one would replace the code on the screen.
    expect(pairingCode).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(within(dialog).getByRole('timer')).toHaveTextContent('Valid for 13:59');

    // After 15 minutes the code is gone from the screen.
    act(() => {
      vi.advanceTimersByTime(14 * 60_000);
    });
    expect(within(dialog).queryByTestId('pairing-code')).not.toBeInTheDocument();
    expect(within(dialog).getByText('This code has expired.')).toBeInTheDocument();

    await u.click(within(dialog).getByRole('button', { name: 'New code' }));
    expect(await within(dialog).findByTestId('pairing-code')).toHaveTextContent('JKMNPQRS');

    // Closed, the code is nowhere on the page.
    await u.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('JKMNPQRS');
  });

  it('pairing a paired device warns that its computer is unpaired; a refusal is explained', async () => {
    vi.spyOn(devicesApi, 'pairingCode').mockRejectedValue(
      new ApiError(404, 'DEVICE_NOT_FOUND', 'gone'),
    );
    await renderApp(<DevicesPage />, { lang: 'ar' });
    const u = userEvent.setup();
    await u.click(within(await rowOf('POS-1')).getByRole('button', { name: 'ربط' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('devices.code.replaces'))).toBeInTheDocument();
    expect(await within(dialog).findByText('هذا الجهاز غير موجود.')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('pairing-code')).not.toBeInTheDocument();
  });
});
