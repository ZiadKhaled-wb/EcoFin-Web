import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { offlineActionsFor, type OfflineSaleDetail, type Shift } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseShiftDialog } from '@/pages/accounting/ShiftParts';
import { memoryDb } from '@/offline/db';
import { initialMode } from '@/offline/mode';
import { useOfflineStore } from '@/offline/store';
import { IDS, leaseRecord, snapshotRecord } from '@/offline/testFixtures';
import { offlineApi } from '@/services/offlineApi';
import { shiftsApi } from '@/services/shiftsApi';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import OfflineDevicePanel from './OfflineDevicePanel';
import { OfflineBanner, OfflinePos } from './OfflinePos';
import { OfflineSaleBody } from './OfflineSalesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const HOUR = 3_600_000;

function offlineStore(over: Partial<ReturnType<typeof useOfflineStore.getState>> = {}) {
  const lease = leaseRecord({ expiresAt: new Date(Date.now() + 5 * HOUR).toISOString() });
  useOfflineStore.setState({
    db: memoryDb(),
    lease,
    snapshot: snapshotRecord(),
    counters: null,
    mode: { ...initialMode(), mode: 'offline' },
    unsynced: 0,
    oldestUnsyncedAt: null,
    rejected: 0,
    pinShift: lease.lease.shift_id,
    pinLocked: false,
    unlocked: true,
    leaseError: null,
    fallback: null,
    ...over,
  });
}

beforeEach(() => signIn());
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
  useOfflineStore.setState({
    db: null,
    lease: null,
    snapshot: null,
    mode: initialMode(),
    unsynced: 0,
  });
});

describe('W5 the offline sale screen (D4)', () => {
  it('is cash only for a walk-in customer, with no discount, installment or return', async () => {
    offlineStore();
    await renderApp(<OfflinePos />, { lang: 'en' });
    const pos = screen.getByTestId('offline-pos');
    // Only the product search and the cash received can be typed in.
    expect(within(pos).getAllByRole('textbox')).toHaveLength(2);
    expect(within(pos).getByText(t('offline.pos.rules', undefined, 'en'))).toBeInTheDocument();
    for (const missing of [/customer/i, /discount/i, /installment/i, /return/i, /card|bank/i]) {
      expect(within(pos).queryByRole('button', { name: missing })).toBeNull();
      expect(within(pos).queryByRole('combobox', { name: missing })).toBeNull();
    }
  });

  it('greys out a product that cannot be sold offline, with the reason', async () => {
    offlineStore();
    const user = userEvent.setup();
    await renderApp(<OfflinePos />, { lang: 'en' });
    await user.type(screen.getByTestId('offline-search'), 'No code');
    const row = screen.getByTestId('offline-product');
    expect(row).toHaveClass('opacity-60');
    expect(
      within(row).getByText(t('offline.pos.notSellable.NO_ETA_CODE', undefined, 'en')),
    ).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('adds snapshot stock only, and lists only the free serials', async () => {
    offlineStore({
      counters: {
        leaseId: IDS.lease,
        seq: 1,
        head: '',
        lastIssuedAt: null,
        sold: { [IDS.chair]: 5 },
        serials: [IDS.unit1],
        salesCount: 1,
        salesTotal: '570.00',
      },
    });
    const user = userEvent.setup();
    await renderApp(<OfflinePos />, { lang: 'en' });
    await user.type(screen.getByTestId('offline-search'), 'Chair');
    expect(
      screen.getByRole('button', { name: t('offline.pos.add', undefined, 'en') }),
    ).toBeDisabled();
    await user.clear(screen.getByTestId('offline-search'));
    await user.type(screen.getByTestId('offline-search'), 'Phone');
    const serials = within(screen.getByRole('combobox')).getAllByRole('option');
    expect(serials.map((o) => o.textContent)).toEqual([
      t('offline.pos.chooseUnit', undefined, 'en'),
      'IMEI-2',
    ]);
  });
});

describe('W7 persistent storage denied (D14.4)', () => {
  it('the device panel says offline selling is off', async () => {
    offlineStore({ mode: initialMode(), lease: { ...leaseRecord(), persisted: false } });
    await renderApp(<OfflineDevicePanel />, { lang: 'en' });
    expect(screen.getByTestId('offline-storage')).toHaveTextContent(
      t('offline.device.denied', undefined, 'en'),
    );
  });

  it('the banner says offline selling is not available', async () => {
    offlineStore({ lease: { ...leaseRecord(), persisted: false } });
    await renderApp(<OfflineBanner />, { lang: 'en' });
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(
      t('offline.banner.unavailable', undefined, 'en'),
    );
  });
});

describe('W9 shift close guard and the 18-hour banner (D14.5, D14.6)', () => {
  const shift: Shift = {
    id: IDS.shift,
    number: 'MAIN-SH-26-000001',
    branch_id: IDS.branch,
    device_id: IDS.device,
    device_name: 'POS 1',
    employee_id: IDS.cashier,
    employee_name: 'Mona Cashier',
    drawer_account_id: IDS.key,
    status: 'open',
    opening_float: '0.00',
    opened_at: '2026-10-20T08:00:00.000Z',
    closed_at: null,
    closed_by_name: null,
    expected_cash: '0.00',
    counted_cash: null,
    difference: null,
    count_breakdown: null,
    difference_reason: null,
    sales_total: '0.00',
    payment_totals: { cash: '0.00', bank_transfer: '0.00', store_credit: '0.00' },
    movements: [],
  };
  const closeLabel = () => t('cash.shifts.close.submit', undefined, 'en');

  it('refuses to close the shift while offline sales wait on this computer', async () => {
    offlineStore({ mode: initialMode(), unsynced: 2 });
    vi.spyOn(shiftsApi, 'vaults').mockResolvedValue([]);
    const close = vi.spyOn(shiftsApi, 'close');
    const user = userEvent.setup();
    await renderApp(<CloseShiftDialog shift={shift} onClose={() => {}} />, { lang: 'en' });
    expect(screen.getByText(t('offline.shift.syncFirst', { count: 2 }, 'en'))).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: closeLabel() });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(close).not.toHaveBeenCalled();
  });

  it('an empty outbox lets it close', async () => {
    offlineStore({ mode: initialMode(), unsynced: 0 });
    vi.spyOn(shiftsApi, 'vaults').mockResolvedValue([]);
    await renderApp(<CloseShiftDialog shift={shift} onClose={() => {}} />, { lang: 'en' });
    expect(screen.queryByText(/Sync first/)).toBeNull();
    expect(screen.getByRole('button', { name: closeLabel() })).toBeEnabled();
  });

  it('shows the red deadline banner for a sale older than 18 hours, and the time left', async () => {
    offlineStore({
      unsynced: 1,
      oldestUnsyncedAt: new Date(Date.now() - 19 * HOUR).toISOString(),
    });
    await renderApp(<OfflineBanner />, { lang: 'en' });
    expect(screen.getByText(t('offline.banner.deadline', undefined, 'en'))).toBeInTheDocument();
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/Offline time left: [45]:\d\d/);
  });

  it('no deadline banner before 18 hours', async () => {
    offlineStore({
      unsynced: 1,
      oldestUnsyncedAt: new Date(Date.now() - 17 * HOUR).toISOString(),
    });
    await renderApp(<OfflineBanner />, { lang: 'en' });
    expect(screen.queryByText(t('offline.banner.deadline', undefined, 'en'))).toBeNull();
    expect(screen.getByTestId('offline-unsynced')).toHaveTextContent('1 sales waiting to sync');
  });
});

describe('W10 the review page (D11)', () => {
  const sale = (over: Partial<OfflineSaleDetail> = {}): OfflineSaleDetail => ({
    id: IDS.lease,
    number: 'OFF-D1-000001',
    seq: 1,
    device_id: IDS.device,
    device_name: 'POS 1',
    branch_id: IDS.branch,
    branch_name: 'Main',
    shift_id: IDS.shift,
    cashier_id: IDS.cashier,
    cashier_name: 'Mona Cashier',
    issued_at: '2026-10-20T10:00:00.000Z',
    received_at: '2026-10-20T12:00:00.000Z',
    total: '1140.00',
    source: 'sync',
    status: 'conflict',
    conflict_code: 'SERIAL_UNAVAILABLE',
    fiscal_hold: null,
    flags: [],
    sale_id: null,
    resolved_at: null,
    resolution_reason: null,
    lines: [
      {
        line_no: 1,
        product_id: IDS.phone,
        name_ar: 'هاتف',
        name_en: 'Phone',
        sku: 'PH-1',
        unit_id: IDS.unit1,
        serial: 'IMEI-1',
        quantity: 1,
        unit_price: '1140.00',
        tax_rate: '14.00',
        tax_amount: '140.00',
        line_total: '1140.00',
      },
    ],
    subtotal: '1000.00',
    tax_total: '140.00',
    payment: { amount: '1140.00', tendered: '1200.00', change: '60.00' },
    eta_uuid: null,
    previous_uuid: null,
    overrides: {},
    actions: ['use_serial'],
    ...over,
  });

  it('the actions follow the code (D11.2, D11.3)', () => {
    const of = (
      status: OfflineSaleDetail['status'],
      code: string | null,
      hold: string | null = null,
    ) => offlineActionsFor({ status, conflict_code: code, fiscal_hold: hold });
    expect(of('conflict', 'SERIAL_UNAVAILABLE')).toEqual(['use_serial']);
    expect(of('conflict', 'SHIFT_CLOSED')).toEqual(['post_to_shift']);
    expect(of('conflict', 'PRICE_MISMATCH')).toEqual(['accept']);
    expect(of('conflict', 'TOTALS_MISMATCH')).toEqual([]);
    expect(of('received', null, 'RECEIPT_MISMATCH')).toEqual([]);
    expect(of('received', null, 'LEASE_REVOKED')).toEqual(['accept', 'reject']);
    expect(of('posted', null)).toEqual([]);
  });

  it('shows only the allowed actions, with the printed lines', async () => {
    await renderApp(<OfflineSaleBody sale={sale()} onDone={() => {}} />, { lang: 'en' });
    const select = screen.getByTestId('offline-action');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([t('offline.review.actions.use_serial', undefined, 'en')]);
    expect(screen.getByText(/Phone \(IMEI-1\)/)).toBeInTheDocument();
  });

  it('a sale with no allowed action shows none', async () => {
    await renderApp(
      <OfflineSaleBody
        sale={sale({ conflict_code: 'TOTALS_MISMATCH', actions: [] })}
        onDone={() => {}}
      />,
      { lang: 'en' },
    );
    expect(screen.getByTestId('offline-no-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-resolve')).toBeNull();
  });

  it('the reason is required', async () => {
    const resolve = vi.spyOn(offlineApi, 'resolve');
    const user = userEvent.setup();
    await renderApp(<OfflineSaleBody sale={sale()} onDone={() => {}} />, { lang: 'en' });
    await user.type(screen.getByTestId('offline-unit-1'), IDS.unit2);
    await user.click(screen.getByTestId('offline-resolve'));
    expect(
      screen.getByText(t('offline.errors.REASON_REQUIRED', undefined, 'en')),
    ).toBeInTheDocument();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sends the action, the reason and the unit', async () => {
    const resolve = vi
      .spyOn(offlineApi, 'resolve')
      .mockResolvedValue({ ...sale(), status: 'received' });
    const done = vi.fn();
    const user = userEvent.setup();
    await renderApp(<OfflineSaleBody sale={sale()} onDone={done} />, { lang: 'en' });
    await user.type(screen.getByTestId('offline-unit-1'), IDS.unit2);
    await user.type(screen.getByTestId('offline-reason'), 'Serial sold online meanwhile');
    await user.click(screen.getByTestId('offline-resolve'));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(resolve).toHaveBeenCalledWith(IDS.lease, {
      action: 'use_serial',
      reason: 'Serial sold online meanwhile',
      unit_ids: { '1': IDS.unit2 },
    });
  });
});
