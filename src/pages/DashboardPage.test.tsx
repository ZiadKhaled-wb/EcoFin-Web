import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardBranchStore } from '@/features/dashboard/dashboardBranchStore';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { dashboardApi } from '@/services/dashboardApi';
import { dayClosesApi } from '@/services/dayClosesApi';
import { stockApi } from '@/services/stockApi';
import { NO_TILES, dashboardFixture, tilesFixture } from '@/test/dashboardFixtures';
import { ORG_A, USER_ID } from '@/test/authFixtures';
import {
  BRANCH_MAIN,
  BRANCH_TWO,
  meFixture,
  permissionsFixture,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';
import { setLanguage, t } from '@/i18n';
import DashboardPage from './DashboardPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const BRANCHES = [
  { id: BRANCH_MAIN, code: 'B1', name: 'Main branch', is_main: true },
  { id: BRANCH_TWO, code: 'B2', name: 'Second branch', is_main: false },
] as Awaited<ReturnType<typeof branchApi.list>>;
const KEY = `${ORG_A}:${USER_ID}`;

function setup(keys: PermissionKey[] = [], branches = BRANCHES) {
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  vi.spyOn(branchApi, 'list').mockResolvedValue(branches);
  vi.spyOn(stockApi, 'lowSummary').mockResolvedValue({ total: 0, branches: [], items: [] });
  vi.spyOn(dayClosesApi, 'alerts').mockResolvedValue({ branches: [] });
  return vi.spyOn(dashboardApi, 'get').mockResolvedValue(dashboardFixture());
}

describe('D01 dashboard page', () => {
  beforeEach(() => {
    signIn('CASHIER');
    useDashboardBranchStore.setState({ chosen: {} });
  });
  afterEach(async () => {
    signOut();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await setLanguage('ar');
  });

  it('shows the shop’s day from the server, when it was updated, and the tiles of all branches', async () => {
    const get = setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    expect(await screen.findByRole('heading', { name: 'Today, Oct 21, 2026' })).toBeInTheDocument();
    expect(await screen.findByText('25,000.00 EGP')).toBeInTheDocument();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    // More than one branch: all branches by default.
    expect(get).toHaveBeenCalledWith(null);
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue('');
  });

  it('opens a branch dashboard from the picker and remembers the choice per user', async () => {
    const get = setup();
    const user = userEvent.setup();
    const first = await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    get.mockResolvedValue(
      dashboardFixture({
        branch_id: BRANCH_TWO,
        tiles: tilesFixture({
          sales_today: {
            count: 1,
            total: '200.00',
            paid_by_method: { cash: '200.00', bank_transfer: '0.00', store_credit: '0.00' },
            on_contract: '0.00',
          },
        }),
      }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), BRANCH_TWO);
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(BRANCH_TWO));
    expect(await screen.findByText('200.00 EGP')).toBeInTheDocument();
    expect(useDashboardBranchStore.getState().chosen[KEY]).toBe(BRANCH_TWO);
    expect(document.querySelector('[data-tile="sales_today"] h3 a')).toHaveAttribute(
      'href',
      `/sales/history?from=2026-10-21&to=2026-10-21&branch_id=${BRANCH_TWO}`,
    );

    // A new visit starts on the remembered branch.
    first.unmount();
    get.mockClear();
    await renderApp(<DashboardPage />, { lang: 'en' });
    await waitFor(() => expect(get).toHaveBeenCalledWith(BRANCH_TWO));
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue(BRANCH_TWO);

    // Back to all branches is remembered too.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), '');
    expect(useDashboardBranchStore.getState().chosen[KEY]).toBe('');
  });

  it('ignores a remembered branch the user can no longer see', async () => {
    useDashboardBranchStore.setState({ chosen: { [KEY]: '99999999-9999-4999-8999-999999999999' } });
    const get = setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    expect(get).toHaveBeenCalledWith(null);
    expect(get).not.toHaveBeenCalledWith('99999999-9999-4999-8999-999999999999');
  });

  it('asks for the only branch of a single-branch user, without a picker', async () => {
    const get = setup([], [BRANCHES[0]!]);
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    expect(get).toHaveBeenCalledWith(BRANCH_MAIN);
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
  });

  it('says there is nothing to show when every tile is null', async () => {
    const get = setup();
    get.mockResolvedValue(dashboardFixture({ tiles: NO_TILES }));
    await renderApp(<DashboardPage />, { lang: 'en' });
    expect(await screen.findByText('Nothing to show for your role')).toBeInTheDocument();
    expect(document.querySelector('[data-tile]')).toBeNull();
  });

  it('draws only the tiles the server sent and the I06 and K04 cards below them', async () => {
    const get = setup(['stock.view', 'cash.view']);
    get.mockResolvedValue(dashboardFixture({ tiles: { ...NO_TILES, low_stock: { products: 0 } } }));
    vi.spyOn(dayClosesApi, 'alerts').mockResolvedValue({
      branches: [
        {
          branch_id: BRANCH_MAIN,
          branch_name: 'Main branch',
          unclosed_days: ['2026-10-20'],
          last_check: null,
        },
      ],
    });
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('Products below their minimum');
    expect(document.querySelectorAll('[data-tile]')).toHaveLength(1);
    const tile = document.querySelector('[data-tile="low_stock"]')!;
    const dayCard = (await screen.findByText(t('dayClose.card.title'))).closest('section')!;
    const lowCard = (await screen.findByText(t('stock.lowCard.title'))).closest('section')!;
    // The detail cards come after the tiles in the page.
    expect(tile.compareDocumentPosition(lowCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tile.compareDocumentPosition(dayCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('refreshes on the button and shows the loading state while it does', async () => {
    const get = setup();
    const user = userEvent.setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    get.mockClear();
    let release: (v: ReturnType<typeof dashboardFixture>) => void = () => undefined;
    get.mockReturnValue(new Promise((resolve) => (release = resolve)));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('button', { name: 'Refreshing' })).toBeDisabled();
    await act(async () => release(dashboardFixture({ generated_at: '2026-10-21T10:05:00.000Z' })));
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('refreshes every 60 seconds while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    get.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps the old numbers and says so when a refresh fails', async () => {
    const get = setup();
    const user = userEvent.setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByText('25,000.00 EGP');
    get.mockRejectedValue(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not refresh. The numbers shown may be out of date.',
    );
    expect(screen.getByText('25,000.00 EGP')).toBeInTheDocument();
  });

  it('shows an error with a retry when the first load fails', async () => {
    const get = setup();
    get.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load today’s numbers.'.replace('’', "'"));
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('25,000.00 EGP')).toBeInTheDocument();
  });

  it('keeps the setup card on top for an owner who has not finished setup', async () => {
    signIn('OWNER');
    setup();
    await renderApp(<DashboardPage />, { lang: 'en' });
    const setupLink = await screen.findByText(t('onboarding.title'));
    const today = await screen.findByText('Today, Oct 21, 2026');
    expect(setupLink.closest('a')).toHaveAttribute('href', '/onboarding');
    expect(
      setupLink.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is in Arabic with the shop’s day and Arabic labels, right to left', async () => {
    setup();
    await renderApp(<DashboardPage />, { lang: 'ar' });
    expect(await screen.findByText('25,000.00 ج.م')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^اليوم،/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'الفرع' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });
});
