import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  MigrationReport,
  MigrationReportBatch,
  MigrationSignOff,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navLeaves } from '@/config/navigation';
import { meApi } from '@/features/me/meApi';
import { MigratedNote } from '@/features/migration/MigratedNote';
import { mismatchOf } from '@/features/migration/migrationShared';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { migrationApi } from '@/services/migrationApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import MigrationPage from './MigrationPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.setConfig({ testTimeout: 30000 });

const ID = 'a1000000-0000-4000-8000-000000000001';
const BATCH = 'a1000000-0000-4000-8000-0000000000b1';
const BATCH2 = 'a1000000-0000-4000-8000-0000000000b2';
const CUSTOMER = 'a1000000-0000-4000-8000-0000000000c1';
const BRANCH = 'a1000000-0000-4000-8000-0000000000d1';
const ACCOUNT = 'a1000000-0000-4000-8000-0000000000e1';

const money = {
  original_total: '43000.00',
  paid_before: '13000.00',
  imported_total: '30000.00',
  open_now: '29000.00',
  overdue_now: '2000.00',
  collected_since: '1000.00',
};
const batch = (over: Partial<MigrationReportBatch> = {}): MigrationReportBatch => ({
  id: BATCH,
  kind: 'opening_contracts',
  created_at: '2026-10-22T10:00:00.000Z',
  file_name: 'open-contracts.xlsx',
  contracts: 4,
  imported_total: '30000.00',
  cash_total: '0.00',
  reversed: false,
  signoff_id: null,
  can_reverse: true,
  blocker: null,
  ...over,
});
const report = (over: Partial<MigrationReport> = {}): MigrationReport => ({
  as_of: '2026-10-22',
  filters: {},
  totals: { contracts: 4, customers: 1, ...money },
  customers: [
    {
      customer_id: CUSTOMER,
      name: 'Amal Ahmed',
      national_id: '**********0501',
      contracts: 4,
      ...money,
    },
  ],
  branches: [{ branch_id: BRANCH, name: 'Main', contracts: 4, ...money }],
  batches: [batch()],
  cash: [
    {
      account_id: ACCOUNT,
      name: 'Main safe',
      kind: 'safe',
      branch_id: BRANCH,
      branch_name: 'Main',
      opening_posted: '5000.50',
      balance_now: '5000.50',
    },
  ],
  cash_totals: { opening_posted: '5000.50', balance_now: '5000.50' },
  ...over,
});
const signoff: MigrationSignOff = {
  id: ID,
  batch_ids: [BATCH],
  expected_open_total: '30000.00',
  system_open_total: '30000.00',
  expected_cash_total: null,
  system_cash_total: '0.00',
  note: 'Signed by the owner',
  signed_file_id: null,
  signed_by: { id: ID, name: 'Owner' },
  signed_at: '2026-10-22T11:00:00.000Z',
};

const apiError = (status: number, code: ApiError['code'], details?: unknown): ApiError => {
  const err = new ApiError(status, code, 'x');
  err.details = details;
  return err;
};

const routes = (
  <Routes>
    <Route path="/" element={<MigrationPage />} />
  </Routes>
);

describe('M02 migration page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['import.data', 'report.financial']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: BRANCH, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(migrationApi, 'report').mockResolvedValue(report());
    vi.spyOn(migrationApi, 'signOffs').mockResolvedValue({ items: [] });
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('is a settings menu item for import.data or report.financial', () => {
    expect(navLeaves().find((i) => i.id === 'settings-migration')).toMatchObject({
      to: '/settings/migration',
      permissionsAny: ['import.data', 'report.financial'],
    });
  });

  it.each(['ar', 'en'] as const)(
    'shows the totals, the customers and the cash (%s)',
    async (lang) => {
      await renderApp(routes, { lang });
      await screen.findByRole('heading', { name: t('migration.title') });
      expect(await screen.findByText('Amal Ahmed')).toBeInTheDocument();
      // Every number is the server's: imported 30,000.00 and open 29,000.00 are two different tiles.
      const imported = await screen.findByTestId(`tile-${t('migration.totals.imported')}`);
      const open = screen.getByTestId(`tile-${t('migration.totals.open')}`);
      expect(imported.textContent).toContain('30,000.00');
      expect(open.textContent).toContain('29,000.00');
      expect(screen.getByText('**********0501')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Amal Ahmed' })).toHaveAttribute(
        'href',
        `/customers/${CUSTOMER}`,
      );
      expect(screen.getByText('Main safe')).toBeInTheDocument();
    },
  );

  it('filters by batch with the server and downloads the CSV with the same filters', async () => {
    const csv = vi.spyOn(migrationApi, 'reportCsv').mockResolvedValue(new Blob(['x']));
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en' });
    await screen.findByText('Amal Ahmed');
    await user.selectOptions(screen.getByLabelText(t('migration.filters.batch')), BATCH);
    await waitFor(() => expect(migrationApi.report).toHaveBeenCalledWith({ batch_id: BATCH }));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await user.click(screen.getByRole('button', { name: t('migration.downloadCsv') }));
    await waitFor(() => expect(csv).toHaveBeenCalledWith({ batch_id: BATCH }));
  });

  it('reverses a batch with a reason; a short reason is refused before any call', async () => {
    const reverse = vi
      .spyOn(migrationApi, 'reverse')
      .mockResolvedValue({ job: {} as never, reversed_contracts: 4 });
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en' });
    await screen.findByText('Amal Ahmed');
    await user.click(screen.getByRole('button', { name: t('migration.batches.reverse') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('migration.reverse.reason')), 'no');
    await user.click(within(dialog).getByRole('button', { name: t('migration.reverse.confirm') }));
    expect(
      await within(dialog).findByText(t('migration.reverse.reasonRequired')),
    ).toBeInTheDocument();
    expect(reverse).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText(t('migration.reverse.reason')),
      ' wrong customers',
    );
    await user.click(within(dialog).getByRole('button', { name: t('migration.reverse.confirm') }));
    await waitFor(() =>
      expect(reverse).toHaveBeenCalledWith(BATCH, { reason: 'no wrong customers' }),
    );
  });

  it('shows why a batch cannot be reversed and has no button for it', async () => {
    vi.spyOn(migrationApi, 'report').mockResolvedValue(
      report({
        batches: [
          batch({
            can_reverse: false,
            blocker: { contract_id: ID, number: 'CT-26-000001', reason: 'collection' },
          }),
        ],
      }),
    );
    await renderApp(routes, { lang: 'en' });
    await screen.findByText('Amal Ahmed');
    expect(screen.queryByRole('button', { name: t('migration.batches.reverse') })).toBeNull();
    expect(screen.getByText(/CT-26-000001/)).toBeInTheDocument();
  });

  it('signs off: checks the entries, then sends the paper totals and shows a refusal with its three numbers', async () => {
    const signOff = vi
      .spyOn(migrationApi, 'signOff')
      .mockRejectedValueOnce(
        apiError(409, 'MIGRATION_TOTAL_MISMATCH', {
          field: 'open_total',
          expected: '29999.00',
          system: '30000.00',
          difference: '-1.00',
        }),
      )
      .mockResolvedValueOnce(signoff);
    vi.spyOn(migrationApi, 'signOffs').mockResolvedValue({ items: [signoff] });
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en' });
    await screen.findByText('Amal Ahmed');
    await user.click(screen.getByRole('tab', { name: t('migration.tabs.signoff') }));
    const submit = await screen.findByRole('button', { name: t('migration.signOff.submit') });
    await user.click(submit);
    expect(await screen.findByText(t('migration.signOff.batchesRequired'))).toBeInTheDocument();
    expect(signOff).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText(t('migration.signOff.openTotal')), '29999');
    await user.type(screen.getByLabelText(t('migration.signOff.note')), 'Signed paper');
    await user.click(submit);
    await waitFor(() =>
      expect(signOff).toHaveBeenCalledWith({
        expected_open_total: '29999',
        batch_ids: [BATCH],
        note: 'Signed paper',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('29,999.00');
    expect(alert.textContent).toContain('30,000.00');
    expect(alert.textContent).toContain('-1.00');

    const total = screen.getByLabelText(t('migration.signOff.openTotal'));
    await user.clear(total);
    await user.type(total, '30000');
    await user.click(submit);
    await waitFor(() => expect(signOff).toHaveBeenCalledTimes(2));
    expect(signOff).toHaveBeenLastCalledWith({
      expected_open_total: '30000',
      batch_ids: [BATCH],
      note: 'Signed paper',
    });
    expect(await screen.findByText('Signed by the owner')).toBeInTheDocument();
  });

  it('a batch that is signed or reversed cannot be picked for a sign-off', async () => {
    vi.spyOn(migrationApi, 'report').mockResolvedValue(
      report({
        batches: [
          batch({ signoff_id: ID, can_reverse: false }),
          batch({ id: BATCH2, reversed: true, can_reverse: false }),
        ],
      }),
    );
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en' });
    await screen.findByText('Amal Ahmed');
    await user.click(screen.getByRole('tab', { name: t('migration.tabs.signoff') }));
    expect(await screen.findByText(t('migration.signOff.nothing'))).toBeInTheDocument();
  });
});

describe('M02 helpers', () => {
  it('reads the three numbers of a refusal and nothing from other errors', () => {
    const err = apiError(409, 'MIGRATION_TOTAL_MISMATCH', {
      field: 'cash_total',
      expected: '1.00',
      system: '2.00',
      difference: '-1.00',
    });
    expect(mismatchOf(err)).toEqual({
      field: 'cash_total',
      expected: '1.00',
      system: '2.00',
      difference: '-1.00',
    });
    expect(mismatchOf(new ApiError(409, 'MIGRATION_SIGNED_OFF', 'x'))).toBeNull();
    expect(mismatchOf(new Error('x'))).toBeNull();
  });

  it('the migrated note shows the old number and what was paid before; nothing for a normal contract', async () => {
    const { container } = await renderApp(
      <>
        <MigratedNote
          source={{
            contract_ref: 'K-1001',
            contract_date: '2025-03-15',
            original_total: '12000.00',
            paid_before: '3000.00',
          }}
        />
        <MigratedNote source={null} />
      </>,
      { lang: 'en' },
    );
    expect(container.textContent).toContain('K-1001');
    expect(container.textContent).toContain('3,000.00');
  });
});
