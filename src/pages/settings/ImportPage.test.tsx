import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  ImportInspection,
  ImportJob,
  ImportJobSummary,
  ImportReport,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequirePermission from '@/components/guards/RequirePermission';
import { navLeaves } from '@/config/navigation';
import { meApi } from '@/features/me/meApi';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { importsApi } from '@/services/importsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ImportPage from './ImportPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// The wizard tests click through several steps.
vi.setConfig({ testTimeout: 30000 });

const ID = 'a0f00000-0000-4000-8000-000000000001';
const JOB = 'a0f00000-0000-4000-8000-0000000000b1';
const FILE = 'a0f00000-0000-4000-8000-0000000000f1';
const ERRORS_FILE = 'a0f00000-0000-4000-8000-0000000000f2';
const MAIN = 'a0f00000-0000-4000-8000-0000000000c1';

const inspection = (over: Partial<ImportInspection> = {}): ImportInspection => ({
  kind: 'products',
  file_type: 'xlsx',
  sheets: ['Products'],
  sheet: 'Products',
  headers: ['Item Code', 'Product Name', 'Price', 'Brand'],
  total_rows: 3,
  sample: [{ 'Item Code': 'A1', 'Product Name': 'هاتف', Price: '9000', Brand: 'Samsung' }],
  suggestion: {
    mapping: { sku: 'Item Code', name_ar: 'Product Name', cash_price: 'Price' },
    unmapped_headers: ['Brand'],
    missing_required: [],
  },
  ...over,
});

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  columns: { mapping: { sku: 'Item Code' }, unmapped_headers: ['Brand'] },
  sheet: 'Products',
  branch_id: null,
  warnings: [{ code: 'IMPORT_UNKNOWN_COLUMN', column: 'Brand', message: 'ignored' }],
  errors: [],
  errors_total: 0,
  errors_truncated: false,
  actions: { create: 2, update: 1, unchanged: 0 },
  preview: [
    { row: 2, action: 'create', values: { sku: 'A1', name_ar: 'هاتف', cash_price: '9000' } },
    { row: 3, action: 'update', values: { sku: 'A2', name_ar: 'كابل', cash_price: '50' } },
  ],
  will_create_categories: ['Phones', 'Phones > Samsung'],
  applied: null,
  failure: null,
  ...over,
});

const job = (over: Partial<ImportJob> = {}, rep: Partial<ImportReport> = {}): ImportJob => ({
  id: JOB,
  kind: 'products',
  status: 'validated',
  file_id: FILE,
  file_name: 'products.xlsx',
  result_file_id: null,
  branch_id: null,
  rows_total: 3,
  rows_ok: 3,
  rows_failed: 0,
  created_at: '2026-10-20T10:00:00.000000+00:00',
  finished_at: null,
  created_by: { id: ID, name: 'Owner' },
  report: report(rep),
  ...over,
});

const failedJob = () =>
  job(
    { status: 'failed', rows_ok: 1, rows_failed: 2, result_file_id: ERRORS_FILE },
    {
      errors: [
        { row: 3, column: 'name_ar', code: 'IMPORT_REQUIRED', message: 'a name is required' },
        { row: 4, column: 'cash_price', code: 'IMPORT_INVALID_VALUE', message: 'x' },
        {
          row: 5,
          column: 'sku',
          code: 'IMPORT_DUPLICATE_ROW',
          message: 'sku: same product as row 2',
        },
      ],
      errors_total: 3,
      actions: { create: 1, update: 0, unchanged: 0 },
    },
  );

const summary = (over: Partial<ImportJobSummary> = {}): ImportJobSummary => ({
  id: JOB,
  kind: 'products',
  status: 'validated',
  file_id: FILE,
  file_name: 'products.xlsx',
  result_file_id: null,
  branch_id: null,
  rows_total: 3,
  rows_ok: 3,
  rows_failed: 0,
  created_at: '2026-10-20T10:00:00.000000+00:00',
  finished_at: null,
  created_by: { id: ID, name: 'Owner' },
  actions: { create: 2, update: 1, unchanged: 0 },
  errors_total: 0,
  ...over,
});

const routes = (
  <Routes>
    <Route element={<RequirePermission permission="import.data" />}>
      <Route path="/" element={<ImportPage />} />
    </Route>
  </Routes>
);

/** Chooses a file, reads it and reaches the column step. */
async function reachColumns(user: ReturnType<typeof userEvent.setup>, kindTitle: string) {
  const card = (await screen.findByRole('heading', { name: kindTitle })).closest('section')!;
  await user.click(within(card).getByRole('button', { name: t('imports.start') }));
  const input = await screen.findByLabelText(t('imports.wizard.file.choose'), {
    selector: 'input',
  });
  await user.upload(input, new File(['x'], 'products.xlsx'));
  await user.click(screen.getByRole('button', { name: t('imports.wizard.file.next') }));
  await screen.findByRole('heading', { name: t('imports.wizard.columns.title') });
}

describe('M01 import page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['import.data']));
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(importsApi, 'list').mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(importsApi, 'upload').mockResolvedValue({
      id: FILE,
      purpose: 'import',
      mime: 'text/csv',
      sizeBytes: 10,
      originalName: 'products.xlsx',
      entityType: null,
      entityId: null,
      createdAt: '2026-10-20T10:00:00.000Z',
    });
    vi.spyOn(importsApi, 'inspect').mockResolvedValue(inspection());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('is in the settings menu for import.data and the page is guarded by that permission', async () => {
    expect(navLeaves().find((i) => i.id === 'settings-import')).toMatchObject({
      to: '/settings/import',
      permission: 'import.data',
    });
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['sale.create']));
    await renderApp(routes, { lang: 'en' });
    expect(await screen.findByText(t('shell.forbidden.title'))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t('imports.title') })).not.toBeInTheDocument();
  });

  it.each(['ar', 'en'] as const)(
    'shows the six kinds in order with templates (%s)',
    async (lang) => {
      await renderApp(routes, { lang });
      await screen.findByRole('heading', { name: t('imports.title') });
      const titles = screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        .filter((x) => x && /./.test(x));
      expect(titles.slice(0, 6)).toEqual([
        t('imports.kinds.suppliers.title'),
        t('imports.kinds.products.title'),
        t('imports.kinds.customers.title'),
        t('imports.kinds.opening_stock.title'),
        t('imports.kinds.opening_contracts.title'),
        t('imports.kinds.opening_cash.title'),
      ]);
      expect(
        screen.getAllByRole('button', { name: new RegExp(t('imports.template.label')) }),
      ).toHaveLength(12);
    },
  );

  it('downloads a template through the API', async () => {
    const template = vi.spyOn(importsApi, 'template').mockResolvedValue(new Blob(['x']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `${t('imports.template.label')} ${t('imports.template.csv')} ${t('imports.kinds.products.title')}`,
      }),
    );
    await waitFor(() => expect(template).toHaveBeenCalledWith('products', 'csv'));
  });

  it('matches the columns, lets the owner change one, and refuses a missing required field', async () => {
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await reachColumns(user, t('imports.kinds.products.title'));
    const price = screen.getByRole('combobox', { name: 'Cash price' });
    expect(price).toHaveValue('Price');
    expect(screen.getByText('9000')).toBeInTheDocument(); // the example from the file
    expect(
      screen.getByText(t('imports.wizard.columns.unused', { columns: 'Brand' })),
    ).toBeInTheDocument();

    await user.selectOptions(price, '');
    expect(screen.getByText(/Choose a column for: Cash price/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('imports.wizard.columns.check') })).toBeDisabled();

    // Choosing a column used by another field moves it.
    await user.selectOptions(price, 'Item Code');
    expect(screen.getByRole('combobox', { name: 'SKU' })).toHaveValue('');
    // The SKU lost its column, so a SKU or a barcode is missing now.
    expect(screen.getByText(/Choose a column for: SKU \/ Barcode/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('imports.wizard.columns.check') })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'SKU' }), 'Brand');
    expect(screen.getByRole('button', { name: t('imports.wizard.columns.check') })).toBeEnabled();
  });

  it('Done when: a file with errors lists every error by row and column and the import button stays off', async () => {
    const create = vi.spyOn(importsApi, 'create').mockResolvedValue(failedJob());
    const run = vi.spyOn(importsApi, 'run');
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await reachColumns(user, t('imports.kinds.products.title'));
    await user.click(screen.getByRole('button', { name: t('imports.wizard.columns.check') }));

    const table = await screen.findByRole('table', {
      name: t('imports.wizard.review.errorsTitle'),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'products',
        file_id: FILE,
        sheet: 'Products',
        mapping: { sku: 'Item Code', name_ar: 'Product Name', cash_price: 'Price' },
      }),
    );
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Name (Arabic)')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(t('imports.rowErrors.IMPORT_REQUIRED'))).toBeInTheDocument();
    expect(
      within(rows[2]!).getByText(t('imports.rowErrors.IMPORT_DUPLICATE_ROW', { row: '2' })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('imports.wizard.review.import') })).toBeDisabled();
    expect(screen.getByText(t('imports.wizard.review.bad'))).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();

    // The errors CSV opens through a signed link.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(importsApi, 'fileUrl').mockResolvedValue({
      url: 'https://files.example/errors.csv',
      expiresAt: '2026-10-20T11:00:00.000Z',
    });
    await user.click(
      screen.getByRole('button', { name: t('imports.wizard.review.downloadErrors') }),
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://files.example/errors.csv', '_blank', 'noopener'),
    );
  });

  it('a clean file: the counts, the new categories and the first rows; confirm; then the status refreshes until completed', async () => {
    vi.spyOn(importsApi, 'create').mockResolvedValue(job());
    const run = vi.spyOn(importsApi, 'run').mockResolvedValue(job({ status: 'importing' }));
    const get = vi
      .spyOn(importsApi, 'get')
      .mockResolvedValueOnce(job({ status: 'importing' }))
      .mockResolvedValue(
        job(
          { status: 'completed', finished_at: '2026-10-20T10:01:00.000000+00:00' },
          { applied: { create: 2, update: 1, unchanged: 0 } },
        ),
      );
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await reachColumns(user, t('imports.kinds.products.title'));
    await user.click(screen.getByRole('button', { name: t('imports.wizard.columns.check') }));

    expect(await screen.findByText(t('imports.wizard.review.ok'))).toBeInTheDocument();
    expect(screen.getByText('Phones, Phones > Samsung', { exact: false })).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: t('imports.wizard.review.preview') });
    expect(within(preview).getByText('A2')).toBeInTheDocument();
    expect(within(preview).getByText(t('imports.actions.update'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('imports.wizard.review.import') }));
    const confirm = await screen.findByRole('dialog');
    expect(
      within(confirm).getByText(/2 will be added, 1 updated and 0 left as they are/),
    ).toBeInTheDocument();
    await user.click(
      within(confirm).getByRole('button', { name: t('imports.wizard.confirm.yes') }),
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0]).toBe(JOB);
    expect(run.mock.calls[0]![1].idempotency_key.length).toBeGreaterThanOrEqual(8);

    expect(await screen.findByText(t('imports.wizard.running.title'))).toBeInTheDocument();
    // The job is read again every 2 seconds until it has finished.
    expect(
      await screen.findByText(t('imports.wizard.done.title'), {}, { timeout: 6000 }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(JOB);
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(t('imports.wizard.done.text', { create: '2', update: '1', unchanged: '0' })),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('imports.wizard.done.open') })).toHaveAttribute(
      'href',
      '/inventory/products',
    );
  });

  it('a missing-columns answer from the server names the fields', async () => {
    vi.spyOn(importsApi, 'create').mockRejectedValue(
      Object.assign(new ApiError(422, 'IMPORT_MISSING_COLUMNS', 'x'), {
        details: { columns: ['sku|barcode'], headers: ['A'] },
      }),
    );
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await reachColumns(user, t('imports.kinds.products.title'));
    await user.click(screen.getByRole('button', { name: t('imports.wizard.columns.check') }));
    expect(
      await screen.findByText(/The file lacks required columns: SKU \/ Barcode/),
    ).toBeInTheDocument();
  });

  it('opening stock asks for a branch and sends it', async () => {
    const create = vi
      .spyOn(importsApi, 'create')
      .mockResolvedValue(job({ kind: 'opening_stock', branch_id: MAIN }, { branch_id: MAIN }));
    vi.spyOn(importsApi, 'inspect').mockResolvedValue(
      inspection({
        kind: 'opening_stock',
        headers: ['SKU', 'Qty', 'Cost'],
        suggestion: {
          mapping: { sku: 'SKU', quantity: 'Qty', unit_cost: 'Cost' },
          unmapped_headers: [],
          missing_required: [],
        },
      }),
    );
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await reachColumns(user, t('imports.kinds.opening_stock.title'));
    await user.click(screen.getByRole('button', { name: t('imports.wizard.columns.check') }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toMatchObject({ kind: 'opening_stock', branch_id: MAIN });
  });

  it('an unreadable file shows the reason in the active language', async () => {
    vi.spyOn(importsApi, 'inspect').mockRejectedValue(
      new ApiError(422, 'IMPORT_FILE_UNREADABLE', 'x'),
    );
    await renderApp(routes, { lang: 'ar' });
    const user = userEvent.setup();
    const card = (
      await screen.findByRole('heading', { name: t('imports.kinds.products.title') })
    ).closest('section')!;
    await user.click(within(card).getByRole('button', { name: t('imports.start') }));
    await user.upload(
      await screen.findByLabelText(t('imports.wizard.file.choose'), { selector: 'input' }),
      new File(['x'], 'a.csv'),
    );
    await user.click(screen.getByRole('button', { name: t('imports.wizard.file.next') }));
    expect(await screen.findByText(t('imports.errors.IMPORT_FILE_UNREADABLE'))).toBeInTheDocument();
  });

  it('the history lists past imports, opens a report and cancels a checked one', async () => {
    vi.spyOn(importsApi, 'list').mockResolvedValue({
      items: [
        summary(),
        summary({ id: ID, status: 'completed', file_name: 'old.csv', kind: 'customers' }),
      ],
      next_cursor: null,
    });
    vi.spyOn(importsApi, 'get').mockResolvedValue(failedJob());
    const cancel = vi.spyOn(importsApi, 'cancel').mockResolvedValue(job({ status: 'cancelled' }));
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: t('imports.tabs.history') }));
    const table = await screen.findByRole('table', { name: t('imports.tabs.history') });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(t('imports.status.validated'))).toBeInTheDocument();
    expect(within(rows[1]!).getByText(t('imports.status.completed'))).toBeInTheDocument();
    expect(
      within(rows[0]!).getByRole('button', { name: t('imports.history.cancel') }),
    ).toBeInTheDocument();
    expect(
      within(rows[1]!).queryByRole('button', { name: t('imports.history.cancel') }),
    ).not.toBeInTheDocument();

    await user.click(within(rows[0]!).getByRole('button', { name: t('imports.history.view') }));
    expect(
      await screen.findByRole('table', { name: t('imports.wizard.review.errorsTitle') }),
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog'))
        .getAllByRole('button', { name: t('imports.wizard.close') })
        .at(-1)!,
    );

    await user.click(within(rows[0]!).getByRole('button', { name: t('imports.history.cancel') }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('imports.history.cancelYes'),
      }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(JOB));
  });

  it('an empty history says so', async () => {
    await renderApp(routes, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: t('imports.tabs.history') }));
    expect(await screen.findByText(t('imports.history.empty'))).toBeInTheDocument();
  });
});
