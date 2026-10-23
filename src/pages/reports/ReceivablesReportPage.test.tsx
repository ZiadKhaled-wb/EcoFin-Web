import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey, ReceivablesReport, ReceivablesRow } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
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
import ReceivablesReportPage from './ReceivablesReportPage';

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

const CUSTOMER = '55555555-5555-4555-8555-555555555551';
const CUSTOMER_2 = '55555555-5555-4555-8555-555555555552';
const COLLECTOR = '66666666-6666-4666-8666-666666666661';
const CONTRACT = '77777777-7777-4777-8777-777777777771';

const measures = {
  outstanding: '24000.00',
  principal: '20000.00',
  profit: '4000.00',
  not_due: '22000.00',
  late_1_30: '0.00',
  late_31_60: '0.00',
  late_61_90: '1500.00',
  late_90_plus: '500.00',
  overdue: '2000.00',
  overdue_pct: '8.3',
  contracts: 2,
  customers: 1,
  overdue_contracts: 1,
  max_days_late: 95,
  oldest_due_date: '2026-07-20',
  migrated_contracts: 0,
};
const split = (amount: string, principal: string, profit: string) => ({
  amount,
  principal,
  profit,
});
const customerRow = (
  key: string,
  name: string,
  over: Partial<ReceivablesRow> = {},
): ReceivablesRow => ({
  key,
  label: name,
  sub_label: '01022220001',
  last_payment_at: null,
  customer: { id: key, name, phone: '01022220001' },
  collector: { id: COLLECTOR, name: 'Collector One' },
  ...measures,
  ...over,
});

/** The totals differ from the sum of the rows (2 x 24 000) on purpose: the page must show the server's. */
function report(over: Partial<ReceivablesReport> = {}): ReceivablesReport {
  return {
    as_of: '2026-10-23',
    generated_at: '2026-10-23T10:00:00.000Z',
    group_by: 'customer',
    filters: { branch_id: null, collector_id: null, customer_id: null, q: null, min_days: null },
    sort: 'outstanding_desc',
    rows: [customerRow(CUSTOMER, 'Amal Aging'), customerRow(CUSTOMER_2, 'Bahaa Behind')],
    totals: {
      ...measures,
      outstanding: '65700.00',
      contracts: 6,
      customers: 5,
      buckets: {
        not_due: split('57000.00', '47500.00', '9500.00'),
        late_1_30: split('2000.00', '1666.66', '333.34'),
        late_31_60: split('2700.00', '2300.00', '400.00'),
        late_61_90: split('2000.00', '1666.66', '333.34'),
        late_90_plus: split('2000.00', '1666.66', '333.34'),
      },
    },
    check: {
      rows_match: true,
      contracts_checked: 6,
      contracts_without_schedule: 0,
      differences: {
        outstanding: '0.00',
        principal: '0.00',
        not_due: '0.00',
        late_1_30: '0.00',
        late_31_60: '0.00',
        late_61_90: '0.00',
        late_90_plus: '0.00',
      },
    },
    total_count: 2,
    page: 1,
    page_size: 50,
    ...over,
  };
}

function setup(keys: PermissionKey[] = ['report.financial', 'employee.manage'], data = report()) {
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  vi.spyOn(branchApi, 'list').mockResolvedValue(BRANCHES);
  vi.spyOn(staffApi, 'list').mockResolvedValue({
    items: [{ id: COLLECTOR, full_name: 'Collector One' }],
    total: 1,
  } as unknown as Awaited<ReturnType<typeof staffApi.list>>);
  return vi.spyOn(reportsApi, 'receivables').mockResolvedValue(data);
}

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

describe('D03 receivables aging page', () => {
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
    const receivables = setup();
    await renderApp(<ReceivablesReportPage />, {
      lang: 'en',
      route: `/reports/receivables?branch_id=${BRANCH_MAIN}&min_days=30`,
    });
    expect(await screen.findByRole('heading', { name: 'Receivables aging' })).toBeInTheDocument();
    await waitFor(() => expect(receivables).toHaveBeenCalled());
    expect(receivables.mock.calls[0]?.[0]).toEqual({
      group_by: 'customer',
      branch_id: BRANCH_MAIN,
      min_days: 30,
      page: 1,
      page_size: 50,
    });
    // The totals are the server's (65 700), not the rows' sum (48 000).
    expect(await screen.findByText('65,700.00 EGP')).toBeInTheDocument();
    expect(screen.queryByText('48,000.00 EGP')).not.toBeInTheDocument();
    expect(screen.getByText('As of Oct 23, 2026')).toBeInTheDocument();
    // The bucket bar: every bucket with its principal / profit split.
    expect(screen.getByText('57,000.00 EGP')).toBeInTheDocument();
    expect(screen.getByText('Principal 2,300.00 EGP · Profit 400.00 EGP')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Receivables by Customer' });
    expect(headersOf(table)).toEqual([
      'Customer',
      'Outstanding',
      'Not due',
      '1–30 days',
      '31–60 days',
      '61–90 days',
      'Over 90 days',
      'Overdue',
      'Principal',
      'Profit',
      'Contracts',
      'Most days late',
      'Last payment',
    ]);
    expect(within(table).getAllByText('24,000.00 EGP')).toHaveLength(2);
    // The oldest buckets in the danger colour.
    expect(within(table).getAllByText('1,500.00 EGP')[0]).toHaveClass('text-danger-600');
    expect(
      screen.getByText(/Total checked against the open balance of 6 contracts/),
    ).toBeInTheDocument();
    expect(screen.getByText(/There are no late fees/)).toBeInTheDocument();
  });

  it('warns with the differences when the rows do not add up to the total', async () => {
    const data = report();
    setup(undefined, {
      ...data,
      check: {
        ...data.check,
        rows_match: false,
        differences: { ...data.check.differences, outstanding: '-17700.00' },
      },
    });
    await renderApp(<ReceivablesReportPage />, { lang: 'en', route: '/reports/receivables' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('outstanding -17,700.00 EGP');
    expect(alert).toHaveTextContent('contracts without a schedule: 0');
  });

  it('drills down: a customer opens its contracts (keeping the filters), a contract opens its page', async () => {
    const receivables = setup();
    const user = userEvent.setup();
    await renderApp(<ReceivablesReportPage />, {
      lang: 'en',
      route: `/reports/receivables?branch_id=${BRANCH_MAIN}`,
    });
    await user.click(await screen.findByRole('link', { name: 'Show the contracts of Amal Aging' }));
    await waitFor(() =>
      expect(receivables.mock.calls.at(-1)?.[0]).toEqual({
        group_by: 'contract',
        branch_id: BRANCH_MAIN,
        customer_id: CUSTOMER,
        page: 1,
        page_size: 50,
      }),
    );
    // The breadcrumb names the level and goes back to the top.
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(crumbs).getByText('Contracts of Amal Aging')).toBeInTheDocument();
    expect(within(crumbs).getByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/reports/receivables',
    );
  });

  it('links a contract row to the contract page and a branch row to its customers', async () => {
    const contractRow: ReceivablesRow = {
      ...measures,
      key: CONTRACT,
      label: 'K-000123',
      sub_label: 'Amal Aging',
      last_payment_at: '2026-10-20T09:00:00.000Z',
      customer: { id: CUSTOMER, name: 'Amal Aging', phone: null },
      branch: { id: BRANCH_MAIN, name: 'Main branch', code: 'B1' },
      contract: {
        id: CONTRACT,
        number: 'K-000123',
        frequency: 'monthly',
        status: 'active',
        is_migrated: true,
        next_due_date: '2026-07-20',
      },
    };
    setup(undefined, report({ group_by: 'contract', rows: [contractRow], total_count: 1 }));
    await renderApp(<ReceivablesReportPage />, {
      lang: 'en',
      route: '/reports/receivables?group_by=contract',
    });
    expect(await screen.findByRole('link', { name: 'Open contract K-000123' })).toHaveAttribute(
      'href',
      `/contracts/${CONTRACT}`,
    );
    expect(screen.getByText('Opening balance')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(headersOf(table)).not.toContain('Contracts');
  });

  it('a collector row without a collector reads "No collector" and opens those customers', async () => {
    const none: ReceivablesRow = {
      ...measures,
      key: 'none',
      label: null,
      sub_label: null,
      last_payment_at: null,
      collector: null,
    };
    const receivables = setup(
      undefined,
      report({ group_by: 'collector', rows: [none], total_count: 1 }),
    );
    const user = userEvent.setup();
    await renderApp(<ReceivablesReportPage />, {
      lang: 'en',
      route: '/reports/receivables?group_by=collector',
    });
    await user.click(
      await screen.findByRole('link', { name: 'Show the customers of No collector' }),
    );
    await waitFor(() =>
      expect(receivables.mock.calls.at(-1)?.[0]).toMatchObject({
        group_by: 'customer',
        collector_id: 'none',
      }),
    );
  });

  it('sends the search after a pause and a sort from a header click', async () => {
    const receivables = setup();
    const user = userEvent.setup();
    await renderApp(<ReceivablesReportPage />, { lang: 'en', route: '/reports/receivables' });
    await screen.findByText('65,700.00 EGP');
    await user.type(
      screen.getByRole('searchbox', { name: 'Search a customer or contract' }),
      'amal',
    );
    await waitFor(() => expect(receivables.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'amal' }), {
      timeout: 3000,
    });
    await user.click(screen.getByRole('button', { name: 'Sort by Over 90 days' }));
    await waitFor(() =>
      expect(receivables.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'late_90_plus_desc' }),
    );
  });

  it('exports every row of the current query in pages of 1000, with the server’s totals line and a BOM', async () => {
    const page1 = report({
      rows: [customerRow(CUSTOMER, 'Amal Aging')],
      total_count: 2,
      page_size: 1000,
    });
    const page2 = { ...page1, page: 2, rows: [customerRow(CUSTOMER_2, 'Bahaa, Behind')] };
    const receivables = setup(undefined, page1);
    const user = userEvent.setup();
    await renderApp(<ReceivablesReportPage />, { lang: 'en', route: '/reports/receivables' });
    await screen.findByText('65,700.00 EGP');
    receivables.mockClear();
    receivables.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(receivables.mock.calls.map((c) => [c[0].page, c[0].page_size])).toEqual([
      [1, 1000],
      [2, 1000],
    ]);
    const { blob, name } = saved.blobs[0]!;
    expect(name).toBe('receivables-2026-10-23-customer.csv');
    const csv = await textOf(blob);
    expect(csv.startsWith(String.fromCharCode(0xfeff))).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Customer,Phone,Collector,Outstanding,Principal,Profit,Not due,1–30 days,31–60 days,61–90 days,Over 90 days,Overdue,Overdue %,Contracts,Customers,Most days late,Oldest unpaid,Last payment',
    );
    expect(lines[1]).toBe(
      'Amal Aging,01022220001,Collector One,24000.00,20000.00,4000.00,22000.00,0.00,0.00,1500.00,500.00,2000.00,8.3,2,1,95,2026-07-20,',
    );
    expect(lines[2]?.startsWith('"Bahaa, Behind",')).toBe(true);
    // The totals line is the server's (65700.00), not the rows' sum.
    expect(lines[3]?.startsWith('Total,,,65700.00,')).toBe(true);
  });

  it('is right-to-left in Arabic with Arabic labels', async () => {
    setup();
    await renderApp(<ReceivablesReportPage />, { lang: 'ar', route: '/reports/receivables' });
    expect(await screen.findByRole('heading', { name: 'أعمار الديون' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    const table = await screen.findByRole('table');
    expect(headersOf(table)).toContain('أكثر من ٩٠ يوم');
    expect(headersOf(table)).toContain('الأصل');
  });
});
