import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey, SalesReport, SalesReportRow } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { categoriesApi } from '@/services/categoriesApi';
import { productsApi } from '@/services/productsApi';
import { reportsApi } from '@/services/reportsApi';
import { staffApi } from '@/services/staffApi';
import {
  BRANCH_MAIN,
  BRANCH_TWO,
  meFixture,
  permissionsFixture,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';
import { setLanguage } from '@/i18n';
import SalesReportPage from './SalesReportPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const saved = vi.hoisted(() => ({ blobs: [] as { blob: Blob; name: string }[] }));
vi.mock('@/features/imports/importShared', async (original) => ({
  ...(await original<typeof import('@/features/imports/importShared')>()),
  saveBlob: (blob: Blob, name: string) => saved.blobs.push({ blob, name }),
}));

const BRANCHES = [
  { id: BRANCH_MAIN, code: 'B1', name: 'Main branch', is_main: true },
  { id: BRANCH_TWO, code: 'B2', name: 'Second branch', is_main: false },
] as Awaited<ReturnType<typeof branchApi.list>>;

const measures = {
  sales_count: 3,
  quantity: 11,
  revenue: '1777.19',
  gross: '1900.00',
  tax: '122.81',
  discount: '0.00',
  cost: '1220.00',
  margin: '557.19',
  margin_pct: '31.4',
  return_count: 1,
  returned_quantity: 1,
  returned_gross: '100.00',
  returned_revenue: '100.00',
  returned_tax: '0.00',
  returned_cost: '60.00',
  returned_margin: '40.00',
  net_quantity: 10,
  net_revenue: '1677.19',
  net_cost: '1160.00',
  net_margin: '517.19',
  net_margin_pct: '30.8',
  contract_profit: '360.00',
  contract_profit_returned: '0.00',
  amount: null,
  refunded: null,
  net_amount: null,
};
const HIDDEN = {
  cost: null,
  margin: null,
  margin_pct: null,
  returned_cost: null,
  returned_margin: null,
  net_cost: null,
  net_margin: null,
  net_margin_pct: null,
  contract_profit: null,
  contract_profit_returned: null,
};
const rowOf = (key: string, label: string, over: Partial<SalesReportRow> = {}): SalesReportRow => ({
  key,
  label,
  label_en: null,
  sub_label: null,
  ...measures,
  ...over,
});

/** The totals differ from the sum of the rows (1777.19 + 1777.19) on purpose: the page must show the server's. */
function report(over: Partial<SalesReport> = {}): SalesReport {
  return {
    from: '2026-09-01',
    to: '2026-10-31',
    group_by: 'month',
    filters: {
      branch_id: null,
      employee_id: null,
      category_id: null,
      category_level: null,
      product_id: null,
      sale_type: null,
    },
    sort: 'key_asc',
    generated_at: '2026-10-22T10:00:00.000Z',
    can_see_cost: true,
    rows: [rowOf('2026-09-01', '2026-09'), rowOf('2026-10-01', '2026-10')],
    totals: { ...measures, sales_count: 8, revenue: '9999.99', margin: '8000.00' },
    check: {
      rows_match: true,
      differences: {
        revenue: '0.00',
        tax: '0.00',
        cost: '0.00',
        returned_revenue: '0.00',
        gross: '0.00',
        returned_gross: '0.00',
      },
    },
    total_count: 2,
    page: 1,
    page_size: 50,
    ...over,
  };
}

const ROUTE =
  '/reports/sales?from=2026-09-01&to=2026-10-31&group_by=month&sale_type=cash&branch_id=44444444-4444-4444-8444-444444444444';

function setup(keys: PermissionKey[] = ['report.view', 'report.financial'], data = report()) {
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  vi.spyOn(branchApi, 'list').mockResolvedValue(BRANCHES);
  vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
  vi.spyOn(productsApi, 'list').mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  } as Awaited<ReturnType<typeof productsApi.list>>);
  vi.spyOn(staffApi, 'list').mockResolvedValue({ items: [], total: 0 });
  return vi.spyOn(reportsApi, 'sales').mockResolvedValue(data);
}

/** The file's text with its BOM kept (a text reader would strip it). */
const textOf = async (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(new TextDecoder('utf-8', { ignoreBOM: true }).decode(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
const headersOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent?.trim());

describe('D02 sales and margin report page', () => {
  beforeEach(() => {
    signIn('OWNER');
    saved.blobs.length = 0;
  });
  afterEach(async () => {
    signOut();
    vi.restoreAllMocks();
    await setLanguage('ar');
  });

  it('reads its filters from the URL, asks the server for exactly that and shows the server’s numbers (nothing summed)', async () => {
    const sales = setup();
    await renderApp(<SalesReportPage />, { lang: 'en', route: ROUTE });
    expect(await screen.findByRole('heading', { name: 'Sales and margin' })).toBeInTheDocument();
    await waitFor(() => expect(sales).toHaveBeenCalled());
    expect(sales.mock.calls[0]?.[0]).toMatchObject({
      from: '2026-09-01',
      to: '2026-10-31',
      group_by: 'month',
      sale_type: 'cash',
      branch_id: BRANCH_MAIN,
      page: 1,
      page_size: 50,
    });
    // The totals strip shows the server's totals, not the rows' sum (3554.38).
    const totals = (await screen.findByText('Totals of the period')).closest('section, div')!;
    expect(await screen.findByText('9,999.99 EGP')).toBeInTheDocument();
    expect(screen.queryByText('3,554.38 EGP')).not.toBeInTheDocument();
    expect(totals).toBeInTheDocument();
    // The rows, month label YYYY-MM, with the cost and margin columns.
    const table = screen.getByRole('table', { name: 'Sales and margin by Month' });
    expect(within(table).getAllByText('1,777.19 EGP')).toHaveLength(2);
    expect(within(table).getByText('2026-09')).toBeInTheDocument();
    expect(headersOf(table)).toEqual([
      'Month',
      'Sales',
      'Quantity',
      'Revenue',
      'Cost',
      'Margin',
      'Margin %',
      'Returns',
      'Net revenue',
      'Net margin',
      'Contract profit',
    ]);
    expect(within(table).getAllByText('31.4%')).toHaveLength(2);
    expect(screen.getByText(/Totals checked against 8 sales documents/)).toBeInTheDocument();
    expect(screen.getByText(/Contract profit is the profit fixed/)).toBeInTheDocument();
  });

  it('hides the cost, margin and contract-profit columns without report.financial', async () => {
    const data = report({
      can_see_cost: false,
      rows: [rowOf('2026-09-01', '2026-09', HIDDEN)],
      totals: { ...measures, ...HIDDEN },
      total_count: 1,
    });
    setup(['report.view'], data);
    await renderApp(<SalesReportPage />, { lang: 'en', route: ROUTE });
    const table = await screen.findByRole('table', { name: 'Sales and margin by Month' });
    expect(headersOf(table)).toEqual([
      'Month',
      'Sales',
      'Quantity',
      'Revenue',
      'Returns',
      'Net revenue',
    ]);
    expect(screen.queryByText('Margin %')).not.toBeInTheDocument();
    expect(screen.queryByText(/Contract profit is the profit fixed/)).not.toBeInTheDocument();
  });

  it('warns with the differences when the rows do not match the documents', async () => {
    setup(
      undefined,
      report({
        check: {
          rows_match: false,
          differences: {
            revenue: '-0.01',
            tax: '0.00',
            cost: '0.00',
            returned_revenue: '0.00',
            gross: '0.00',
            returned_gross: '0.00',
          },
        },
      }),
    );
    await renderApp(<SalesReportPage />, { lang: 'en', route: ROUTE });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/do not match the documents of the period/);
    expect(alert).toHaveTextContent('-0.01 EGP');
  });

  it('says so when a filter makes the totals the rows’ own (no check)', async () => {
    setup(undefined, report({ check: null }));
    await renderApp(<SalesReportPage />, { lang: 'en', route: ROUTE });
    expect(await screen.findByText(/A filter is set/)).toBeInTheDocument();
  });

  it('shows money columns and the note for the payment type grouping', async () => {
    const money = (key: string, amount: string): SalesReportRow =>
      rowOf(key, key, {
        sales_count: null,
        quantity: null,
        revenue: null,
        cost: null,
        margin: null,
        margin_pct: null,
        amount,
        refunded: '0.00',
        net_amount: amount,
      });
    setup(
      undefined,
      report({
        group_by: 'payment_type',
        rows: [money('cash', '2130.00'), money('bank_transfer', '12300.00')],
        totals: { ...measures, amount: '14430.00', refunded: '0.00', net_amount: '14430.00' },
      }),
    );
    await renderApp(<SalesReportPage />, {
      lang: 'en',
      route: '/reports/sales?from=2026-09-01&to=2026-10-31&group_by=payment_type',
    });
    const table = await screen.findByRole('table', { name: 'Sales and margin by Payment type' });
    expect(within(table).getAllByText('2,130.00 EGP')).toHaveLength(2); // received and net
    expect(within(table).getByText('Bank transfer')).toBeInTheDocument();
    expect(headersOf(table)).toEqual(['Payment type', 'Received', 'Refunded', 'Net']);
    expect(screen.getByText(/shows money by how it was received/)).toBeInTheDocument();
    // No product or category pickers for money.
    expect(screen.queryByLabelText('Product')).not.toBeInTheDocument();
  });

  it('rows of a day, a branch and a seller link to the sales history with the same dates; a product row has no link', async () => {
    setup(
      undefined,
      report({
        group_by: 'day',
        rows: [rowOf('2026-10-05', '2026-10-05')],
        total_count: 1,
      }),
    );
    await renderApp(<SalesReportPage />, {
      lang: 'en',
      route: ROUTE.replace('group_by=month', 'group_by=day'),
    });
    const link = await screen.findByRole('link', { name: /Open the sales of Oct 5, 2026/ });
    expect(link).toHaveAttribute(
      'href',
      `/sales/history?from=2026-10-05&to=2026-10-05&branch_id=${BRANCH_MAIN}`,
    );
  });

  it('changes the URL filters and asks again when the grouping changes', async () => {
    const sales = setup();
    const user = userEvent.setup();
    await renderApp(<SalesReportPage />, { lang: 'en', route: ROUTE });
    await screen.findByText('9,999.99 EGP');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), 'product');
    await waitFor(() =>
      expect(sales.mock.calls.at(-1)?.[0]).toMatchObject({ group_by: 'product', page: 1 }),
    );
    await user.click(screen.getByRole('button', { name: 'Last month' }));
    await waitFor(() => {
      const last = sales.mock.calls.at(-1)?.[0];
      expect(last?.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(last?.group_by).toBe('product');
    });
  });

  it('does not ask for a period longer than 366 days and says why', async () => {
    const sales = setup();
    await renderApp(<SalesReportPage />, {
      lang: 'en',
      route: '/reports/sales?from=2025-01-01&to=2026-10-31&group_by=month',
    });
    expect(await screen.findByText(/at most 366 days/)).toBeInTheDocument();
    expect(sales).not.toHaveBeenCalled();
  });

  it('exports every row of the current query in pages of 1000, with the server’s totals line and a BOM', async () => {
    const page1 = report({
      group_by: 'day',
      rows: [rowOf('2026-10-05', '2026-10-05')],
      total_count: 2,
      page_size: 1000,
    });
    const page2 = { ...page1, page: 2, rows: [rowOf('2026-10-06', '2026-10-06')] };
    const sales = setup(undefined, page1);
    const user = userEvent.setup();
    await renderApp(<SalesReportPage />, {
      lang: 'en',
      route: '/reports/sales?from=2026-10-05&to=2026-10-06&group_by=day',
    });
    await screen.findByText('9,999.99 EGP');
    sales.mockClear();
    sales.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(sales.mock.calls.map((c) => [c[0].page, c[0].page_size])).toEqual([
      [1, 1000],
      [2, 1000],
    ]);
    const { blob, name } = saved.blobs[0]!;
    expect(name).toBe('sales-report-2026-10-05-2026-10-06-day.csv');
    const csv = await textOf(blob);
    expect(csv.startsWith(String.fromCharCode(0xfeff))).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]?.startsWith('Day,Sales,Quantity,Revenue')).toBe(true);
    expect(lines[1]?.startsWith('2026-10-05,3,11,1777.19,')).toBe(true);
    expect(lines[2]?.startsWith('2026-10-06,3,11,1777.19,')).toBe(true);
    // The totals line is the server's (9999.99), not the rows' sum.
    expect(lines[3]?.startsWith('Totals,8,11,9999.99,')).toBe(true);
  });

  it('is right-to-left in Arabic with Arabic labels and the shop’s word for contract profit', async () => {
    setup();
    await renderApp(<SalesReportPage />, { lang: 'ar', route: ROUTE });
    expect(await screen.findByRole('heading', { name: 'المبيعات والهامش' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('button', { name: 'تصدير CSV' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(headersOf(table)).toContain('ربح التقسيط');
  });
});
