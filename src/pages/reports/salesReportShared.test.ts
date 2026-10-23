import type { SalesReportRow } from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/i18n';
import {
  activePreset,
  addDays,
  buildCsv,
  defaultFilters,
  defaultSort,
  drillLink,
  fieldsFor,
  formatCell,
  periodValid,
  presetRange,
  readFilters,
  rowLabel,
  sortToState,
  stateToSort,
  toQuery,
  writeFilters,
} from './salesReportShared';

const TODAY = '2026-10-22'; // a Thursday
const ID = '11111111-1111-4111-8111-111111111111';
const read = (qs: string) => readFilters(new URLSearchParams(qs), TODAY);

const row = (over: Partial<SalesReportRow> = {}): SalesReportRow => ({
  key: '2026-10-05',
  label: null,
  label_en: null,
  sub_label: null,
  sales_count: 2,
  quantity: 5,
  revenue: '1000.10',
  gross: '1140.00',
  tax: '139.90',
  discount: '0.00',
  cost: '600.0000',
  margin: '400.10',
  margin_pct: '40.0',
  return_count: 0,
  returned_quantity: 0,
  returned_gross: '0.00',
  returned_revenue: '0.00',
  returned_tax: '0.00',
  returned_cost: '0.00',
  returned_margin: '0.00',
  net_quantity: 5,
  net_revenue: '1000.10',
  net_cost: '600.00',
  net_margin: '400.10',
  net_margin_pct: '40.0',
  contract_profit: '0.00',
  contract_profit_returned: '0.00',
  amount: null,
  refunded: null,
  net_amount: null,
  ...over,
});

afterEach(async () => {
  await setLanguage('ar');
});

describe('D02 report filters and the URL', () => {
  it('starts on this month up to today, grouped by day', () => {
    expect(read('')).toEqual(defaultFilters(TODAY));
    expect(defaultFilters(TODAY)).toMatchObject({
      from: '2026-10-01',
      to: TODAY,
      groupBy: 'day',
      page: 1,
    });
  });

  it('round-trips every filter and leaves the defaults out of the URL', () => {
    const f = {
      ...defaultFilters(TODAY),
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: 'category' as const,
      branch: ID,
      employee: ID,
      category: ID,
      topLevel: true,
      product: ID,
      saleType: 'installment' as const,
      sort: 'margin_desc' as const,
      page: 3,
    };
    expect(read(writeFilters(f, TODAY).toString())).toEqual(f);
    expect(writeFilters(defaultFilters(TODAY), TODAY).toString()).toBe('');
    // The top-level switch only means something for the category grouping.
    expect(writeFilters({ ...f, groupBy: 'day' }, TODAY).get('category_level')).toBeNull();
  });

  it('drops anything that is not a well-formed value', () => {
    const f = read(
      'from=yesterday&to=2026-02-30&group_by=colour&branch_id=x&employee_id=<b>&sale_type=layaway&sort=best&page=-4&category_level=mid',
    );
    expect(f).toEqual(defaultFilters(TODAY));
  });

  it('builds the request from the filters, with no product or category filter for the payment type grouping', () => {
    const f = { ...defaultFilters(TODAY), category: ID, product: ID, employee: ID };
    expect(toQuery(f)).toMatchObject({
      from: '2026-10-01',
      to: TODAY,
      group_by: 'day',
      category_id: ID,
      product_id: ID,
      employee_id: ID,
      page: 1,
      page_size: 50,
    });
    const money = toQuery({ ...f, groupBy: 'payment_type' });
    expect(money.category_id).toBeUndefined();
    expect(money.product_id).toBeUndefined();
    expect(money.employee_id).toBe(ID);
    expect(toQuery(f, 2, 1000)).toMatchObject({ page: 2, page_size: 1000 });
  });

  it('knows when the period is not valid: reversed, or more than 366 days', () => {
    expect(periodValid({ from: '2026-10-22', to: '2026-10-22' })).toBe(true);
    expect(periodValid({ from: '2025-10-31', to: '2026-10-31' })).toBe(true);
    expect(periodValid({ from: '2025-10-30', to: '2026-10-31' })).toBe(false);
    expect(periodValid({ from: '2026-10-23', to: '2026-10-22' })).toBe(false);
  });
});

describe('D02 quick periods are the shop’s dates', () => {
  it('works out today, this week (from Saturday), this month, last month and this year', () => {
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange('thisWeek', TODAY)).toEqual({ from: '2026-10-17', to: TODAY });
    expect(presetRange('thisWeek', '2026-10-17')).toEqual({ from: '2026-10-17', to: '2026-10-17' });
    expect(presetRange('thisMonth', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(presetRange('lastMonth', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(presetRange('thisYear', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('marks the preset the dates match', () => {
    expect(activePreset({ from: '2026-09-01', to: '2026-09-30' }, TODAY)).toBe('lastMonth');
    expect(activePreset({ from: '2026-09-02', to: '2026-09-30' }, TODAY)).toBeNull();
  });
});

describe('D02 sorting', () => {
  it('maps a clicked column to the server sorts of decision 9 and back', () => {
    expect(stateToSort([{ id: 'revenue', desc: true }])).toBe('revenue_desc');
    expect(stateToSort([{ id: 'revenue', desc: false }])).toBe('revenue_asc');
    expect(stateToSort([{ id: 'margin', desc: false }])).toBe('margin_asc');
    expect(stateToSort([{ id: 'quantity', desc: false }])).toBe('quantity_desc');
    expect(stateToSort([{ id: 'net_revenue', desc: true }])).toBe('net_revenue_desc');
    expect(stateToSort([{ id: 'label', desc: true }])).toBe('key_asc');
    expect(stateToSort([{ id: 'cost', desc: true }])).toBe('');
    expect(stateToSort([])).toBe('');
    expect(sortToState('revenue_desc')).toEqual([{ id: 'revenue', desc: true }]);
    expect(sortToState('revenue_asc')).toEqual([{ id: 'revenue', desc: false }]);
    expect(sortToState('key_asc')).toEqual([{ id: 'label', desc: false }]);
    expect(defaultSort('day')).toBe('key_asc');
    expect(defaultSort('product')).toBe('revenue_desc');
  });
});

describe('D02 columns and cells', () => {
  it('hides the cost columns without report.financial and shows only money for the payment type', () => {
    const ids = (cost: boolean) => fieldsFor('product', cost, 'table').map((f) => f.field);
    expect(ids(true)).toEqual(
      expect.arrayContaining(['cost', 'margin', 'margin_pct', 'net_margin', 'contract_profit']),
    );
    expect(ids(false)).toEqual([
      'sales_count',
      'quantity',
      'revenue',
      'returned_revenue',
      'net_revenue',
    ]);
    expect(fieldsFor('payment_type', true, 'table').map((f) => f.field)).toEqual([
      'amount',
      'refunded',
      'net_amount',
    ]);
    expect(fieldsFor('day', false, 'csv').some((f) => f.cost)).toBe(false);
  });

  it('shows the server’s strings formatted, "—" for a value that is not there, one decimal for a percentage', () => {
    expect(formatCell('1000.10', 'money', 'en')).toBe('1,000.10 EGP');
    expect(formatCell('40.0', 'pct', 'en')).toBe('40.0%');
    expect(formatCell(1200, 'int', 'en')).toBe('1,200');
    expect(formatCell(null, 'money', 'en')).toBe('—');
  });

  it('labels the rows by grouping', async () => {
    await setLanguage('en');
    expect(rowLabel(row({ key: '2026-10-05' }), 'day', 'en')).toBe('Oct 5, 2026');
    expect(rowLabel(row({ key: '2026-10-01', label: '2026-10' }), 'month', 'en')).toBe('2026-10');
    expect(rowLabel(row({ key: 'none', label: null }), 'category', 'en')).toBe('No category');
    expect(rowLabel(row({ key: 'installment' }), 'sale_type', 'en')).toBe('Installments');
    expect(rowLabel(row({ key: 'on_contract' }), 'payment_type', 'en')).toBe('On the contract');
    const product = row({ key: ID, label: 'كرسي', label_en: 'Chair' });
    expect(rowLabel(product, 'product', 'en')).toBe('Chair');
    expect(rowLabel(product, 'product', 'ar')).toBe('كرسي');
  });
});

describe('D02 drill-down links to the sales history', () => {
  const f = { ...defaultFilters(TODAY), from: '2026-10-01', to: '2026-10-31', branch: ID };
  it('opens a day, a branch or a seller with the same dates and branch', () => {
    expect(drillLink(row({ key: '2026-10-05' }), 'day', f)).toBe(
      `/sales/history?from=2026-10-05&to=2026-10-05&branch_id=${ID}`,
    );
    expect(drillLink(row({ key: ID }), 'branch', { ...f, branch: '' })).toBe(
      `/sales/history?from=2026-10-01&to=2026-10-31&branch_id=${ID}`,
    );
    expect(drillLink(row({ key: ID }), 'employee', { ...f, branch: '' })).toBe(
      `/sales/history?from=2026-10-01&to=2026-10-31&cashier_id=${ID}`,
    );
  });
  it('has no link where the sales history cannot filter, or where the row has no sale', () => {
    expect(drillLink(row({ key: ID }), 'product', f)).toBeNull();
    expect(drillLink(row({ key: ID }), 'category', f)).toBeNull();
    expect(drillLink(row({ key: 'cash' }), 'payment_type', f)).toBeNull();
    expect(drillLink(row({ key: ID, sales_count: 0 }), 'employee', f)).toBeNull();
  });
});

describe('D02 CSV', () => {
  it('has a BOM, the column names in the page’s language, the rows as the server sent them and a totals line', async () => {
    await setLanguage('en');
    const rows = [
      row({ key: '2026-10-05', cost: '600.0000' }),
      row({ key: '2026-10-06', revenue: '10.10' }),
    ];
    // The totals differ from the sum of the rows on purpose: the CSV forwards, it never adds.
    const totals = row({ revenue: '99999.99', cost: '1.00' });
    const csv = buildCsv('day', rows, totals, true, 'en');
    expect(csv.startsWith(String.fromCharCode(0xfeff))).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe(
      [
        'Day,Sales,Quantity,Revenue,With VAT,VAT,Discounts,Cost,Margin,Margin %,Return documents,Returned quantity,',
        'Returned with VAT,Returns,Returned VAT,Returned cost,Returned margin,Net quantity,Net revenue,Net cost,',
        'Net margin,Net margin %,Contract profit,Contract profit returned',
      ].join(''),
    );
    expect(lines[1]).toBe(
      '2026-10-05,2,5,1000.10,1140.00,139.90,0.00,600.0000,400.10,40.0,0,0,0.00,0.00,0.00,0.00,0.00,5,1000.10,600.00,400.10,40.0,0.00,0.00',
    );
    expect(lines[2]?.split(',')[3]).toBe('10.10');
    expect(lines[3]?.startsWith('Totals,2,5,99999.99,')).toBe(true);
    expect(lines).toHaveLength(5);
  });

  it('leaves the cost columns out without report.financial, writes Arabic headers and quotes commas', async () => {
    await setLanguage('ar');
    const plain = row({ cost: null, margin: null, margin_pct: null });
    const csv = buildCsv(
      'product',
      [row({ key: ID, label: 'كرسي, خشب', cost: null })],
      plain,
      false,
      'ar',
    );
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header).toContain('المنتج');
    expect(header).not.toContain('التكلفة');
    expect(line?.startsWith('"كرسي, خشب",')).toBe(true);
  });

  it('writes the money-only columns for the payment type grouping', async () => {
    await setLanguage('en');
    const money = row({
      key: 'cash',
      sales_count: null,
      quantity: null,
      amount: '2130.00',
      refunded: '100.00',
      net_amount: '2030.00',
    });
    const csv = buildCsv('payment_type', [money], money, true, 'en');
    expect(csv.slice(1).split('\r\n').slice(0, 2)).toEqual([
      'Payment type,Received,Refunded,Net',
      'Cash,2130.00,100.00,2030.00',
    ]);
  });
});
