import { afterEach, describe, expect, it } from 'vitest';
import type { ReceivablesRow } from '@ziadkhaled-wb/contracts';
import { setLanguage } from '@/i18n';
import {
  crumb,
  defaultFilters,
  drillTarget,
  readFilters,
  sortToState,
  stateToSort,
  tableFields,
  toQuery,
  writeFilters,
} from './receivablesShared';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const params = (s: string) => new URLSearchParams(s);
const row = (key: string, label: string | null): ReceivablesRow => ({
  key,
  label,
  sub_label: null,
  last_payment_at: null,
  outstanding: '1.00',
  principal: '1.00',
  profit: '0.00',
  not_due: '1.00',
  late_1_30: '0.00',
  late_31_60: '0.00',
  late_61_90: '0.00',
  late_90_plus: '0.00',
  overdue: '0.00',
  overdue_pct: '0.0',
  contracts: 1,
  customers: 1,
  overdue_contracts: 0,
  max_days_late: null,
  oldest_due_date: null,
  migrated_contracts: 0,
});

describe('D03 receivables helpers', () => {
  afterEach(async () => setLanguage('ar'));

  it('reads the URL and drops anything malformed', () => {
    expect(readFilters(params(''))).toEqual(defaultFilters());
    expect(
      readFilters(
        params(
          `group_by=contract&branch_id=${ID}&collector_id=none&customer_id=${ID2}&q=%20amal%20&min_days=61&sort=late_90_plus_desc&page=3&label=Amal`,
        ),
      ),
    ).toEqual({
      groupBy: 'contract',
      branch: ID,
      collector: 'none',
      customer: ID2,
      q: 'amal',
      minDays: 61,
      sort: 'late_90_plus_desc',
      page: 3,
      label: 'Amal',
    });
    expect(
      readFilters(
        params('group_by=product&branch_id=x&collector_id=all&min_days=0&sort=nope&page=-1'),
      ),
    ).toEqual(defaultFilters());
    // A search only with the customer or contract grouping.
    expect(readFilters(params('group_by=branch&q=amal')).q).toBe('');
  });

  it('writes only what differs from the default and round-trips', () => {
    expect(writeFilters(defaultFilters()).toString()).toBe('');
    const f = {
      ...defaultFilters(),
      groupBy: 'collector' as const,
      collector: ID,
      minDays: 30,
      page: 2,
    };
    expect(readFilters(writeFilters(f))).toEqual(f);
  });

  it('builds the request from the filters', () => {
    expect(toQuery(defaultFilters())).toEqual({ group_by: 'customer', page: 1, page_size: 50 });
    expect(
      toQuery(
        { ...defaultFilters(), groupBy: 'contract', customer: ID, q: 'K-1', minDays: 5 },
        2,
        1000,
      ),
    ).toEqual({
      group_by: 'contract',
      customer_id: ID,
      q: 'K-1',
      min_days: 5,
      page: 2,
      page_size: 1000,
    });
  });

  it('drills from a branch or collector to customers, from a customer to contracts, from a contract to its page', async () => {
    await setLanguage('en');
    const top = { ...defaultFilters(), groupBy: 'branch' as const, minDays: 30, page: 3, q: '' };
    expect(drillTarget(row(ID, 'Main'), top)).toEqual({
      filters: { ...top, groupBy: 'customer', branch: ID, page: 1, label: 'Main' },
    });
    const byCollector = { ...defaultFilters(), groupBy: 'collector' as const };
    expect(drillTarget(row('none', null), byCollector)).toEqual({
      filters: { ...byCollector, groupBy: 'customer', collector: 'none', label: 'No collector' },
    });
    const customers = { ...defaultFilters(), q: 'am' };
    expect(drillTarget(row(ID2, 'Amal'), customers)).toEqual({
      filters: { ...customers, groupBy: 'contract', customer: ID2, q: '', label: 'Amal' },
    });
    expect(drillTarget(row(ID, 'K-1'), { ...defaultFilters(), groupBy: 'contract' })).toEqual({
      href: `/contracts/${ID}`,
    });
  });

  it('names the drill-down level for the breadcrumb', async () => {
    await setLanguage('en');
    expect(crumb(defaultFilters())).toBeNull();
    expect(crumb({ ...defaultFilters(), groupBy: 'contract', customer: ID, label: 'Amal' })).toBe(
      'Contracts of Amal',
    );
    expect(crumb({ ...defaultFilters(), collector: 'none', label: 'No collector' })).toBe(
      'Customers of No collector',
    );
  });

  it('maps table sorting to the server sorts and back', () => {
    expect(sortToState('outstanding_desc')).toEqual([{ id: 'outstanding', desc: true }]);
    expect(sortToState('outstanding_asc')).toEqual([{ id: 'outstanding', desc: false }]);
    expect(sortToState('key_asc')).toEqual([{ id: 'label', desc: false }]);
    expect(stateToSort([{ id: 'late_90_plus', desc: true }])).toBe('late_90_plus_desc');
    expect(stateToSort([{ id: 'outstanding', desc: false }])).toBe('outstanding_asc');
    expect(stateToSort([{ id: 'principal', desc: true }])).toBe('');
  });

  it('shows the contracts column except for contract rows', () => {
    expect(tableFields('customer').map((f) => f.field)).toContain('contracts');
    expect(tableFields('contract').map((f) => f.field)).not.toContain('contracts');
  });
});
