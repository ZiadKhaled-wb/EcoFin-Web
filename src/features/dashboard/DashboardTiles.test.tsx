import { screen, within } from '@testing-library/react';
import type { OwnerDashboard } from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { NO_TILES, tilesFixture } from '@/test/dashboardFixtures';
import { BRANCH_MAIN, renderApp, signOut } from '@/test/renderApp';
import { setLanguage, t } from '@/i18n';
import DashboardTiles from './DashboardTiles';
import { visibleTileCount } from './visibleTiles';

const DATE = '2026-10-21';

async function draw(tiles: OwnerDashboard['tiles'], branchId = '', lang: 'ar' | 'en' = 'en') {
  return renderApp(
    <DashboardTiles tiles={tiles} date={DATE} branchId={branchId} timeZone="Africa/Cairo" />,
    { lang },
  );
}
const tile = (id: string) => document.querySelector<HTMLElement>(`[data-tile="${id}"]`);
const hrefs = (el: HTMLElement | null) =>
  within(el!)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));

describe('D01 dashboard tiles', () => {
  afterEach(async () => {
    signOut();
    await setLanguage('ar');
  });

  it('shows the numbers the server sent, formatted and never recomputed', async () => {
    await draw(tilesFixture());
    expect(within(tile('sales_today')!).getByText('25,000.00 EGP')).toBeInTheDocument();
    expect(within(tile('sales_today')!).getByText('Sales: 5')).toBeInTheDocument();
    expect(
      within(tile('sales_today')!).getByText(
        'Cash 4,700.00 EGP · Transfer 300.00 EGP · Store credit 0.00 EGP',
      ),
    ).toBeInTheDocument();
    expect(
      within(tile('sales_today')!).getByText('On installment contracts: 20,000.00 EGP'),
    ).toBeInTheDocument();
    expect(within(tile('collections_today')!).getByText('1,400.00 EGP')).toBeInTheDocument();
    expect(
      within(tile('collections_today')!).getByText('Collected in the field: 400.00 EGP'),
    ).toBeInTheDocument();
    // The total is the server's, not safes + drawers + wallets added here.
    expect(within(tile('cash')!).getByText('12,900.00 EGP')).toBeInTheDocument();
    expect(within(tile('cash')!).getByText('Safes: 9,500.00 EGP')).toBeInTheDocument();
    expect(within(tile('overdue')!).getByText('2,600.00 EGP')).toBeInTheDocument();
    expect(within(tile('overdue')!).getByText('Contracts: 2 · Customers: 2')).toBeInTheDocument();
    expect(within(tile('low_stock')!).getByText('5')).toBeInTheDocument();
    expect(within(tile('eta')!).getByText('3')).toBeInTheDocument();
    expect(within(tile('eta')!).getByText('Blocked: 1')).toBeInTheDocument();
    expect(within(tile('eta')!).queryByText(/Due soon/)).not.toBeInTheDocument();
    expect(within(tile('approvals')!).getByText('5')).toBeInTheDocument();
  });

  it('links every tile to its detail page with the same filters (all branches)', async () => {
    await draw(tilesFixture());
    expect(tile('sales_today')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/sales/history?from=${DATE}&to=${DATE}`,
    );
    expect(tile('collections_today')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      '/accounting/day-close',
    );
    expect(tile('open_shifts')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      '/accounting/shifts?status=open',
    );
    expect(tile('overdue')!.querySelector('h3 a')).toHaveAttribute('href', '/installments/overdue');
    expect(tile('low_stock')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      '/inventory/stock?low=1',
    );
    expect(tile('eta')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      '/tax/eta-receipts?situation=problem',
    );
    expect(tile('unclosed_days')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      '/accounting/day-close',
    );
    expect(hrefs(tile('cash'))).toEqual([
      '/accounting/vaults',
      '/accounting/vaults',
      '/accounting/shifts?status=open',
      '/installments/wallets',
      '/accounting/vaults',
    ]);
    expect(hrefs(tile('approvals'))).toEqual([
      '/sales/approvals',
      '/sales/approvals',
      '/purchasing/approvals',
      '/customers/credit-exceptions',
    ]);
  });

  it('carries the branch into the links of a branch dashboard', async () => {
    await draw(tilesFixture(), BRANCH_MAIN);
    expect(tile('sales_today')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/sales/history?from=${DATE}&to=${DATE}&branch_id=${BRANCH_MAIN}`,
    );
    expect(tile('collections_today')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/accounting/day-close/${BRANCH_MAIN}/${DATE}`,
    );
    expect(tile('open_shifts')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/accounting/shifts?status=open&branch_id=${BRANCH_MAIN}`,
    );
    expect(tile('low_stock')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/inventory/stock?low=1&branch_id=${BRANCH_MAIN}`,
    );
    expect(tile('eta')!.querySelector('h3 a')).toHaveAttribute(
      'href',
      `/tax/eta-receipts?situation=problem&branch_id=${BRANCH_MAIN}`,
    );
    expect(hrefs(tile('cash'))).toContain(`/installments/wallets?branch_id=${BRANCH_MAIN}`);
  });

  it('does not draw a tile the caller cannot open (null)', async () => {
    const tiles = tilesFixture({ cash: null, overdue: null, eta: null, approvals: null });
    await draw(tiles);
    expect(tile('cash')).toBeNull();
    expect(tile('overdue')).toBeNull();
    expect(tile('eta')).toBeNull();
    expect(tile('approvals')).toBeNull();
    expect(tile('sales_today')).not.toBeNull();
    expect(visibleTileCount(tiles)).toBe(5);
    expect(visibleTileCount(NO_TILES)).toBe(0);
  });

  it('lists only the approval kinds the caller holds the key for', async () => {
    await draw(
      tilesFixture({ approvals: { discount: null, purchase: 3, credit: null, total: 3 } }),
    );
    const card = tile('approvals')!;
    expect(within(card).getByText('Purchase invoices: 3')).toBeInTheDocument();
    expect(within(card).queryByText(/Discounts/)).not.toBeInTheDocument();
    expect(card.querySelector('h3 a')).toHaveAttribute('href', '/purchasing/approvals');
  });

  it('colours a tile only for attention, and says so in words', async () => {
    await draw(tilesFixture());
    for (const id of ['overdue', 'eta'])
      expect(tile(id)).toHaveAttribute('data-attention', 'danger');
    for (const id of ['open_shifts', 'low_stock', 'unclosed_days']) {
      expect(tile(id)).toHaveAttribute('data-attention', 'warning');
    }
    for (const id of ['sales_today', 'collections_today', 'cash', 'approvals']) {
      expect(tile(id)).not.toHaveAttribute('data-attention');
    }
    expect(within(tile('overdue')!).getByText('Needs attention')).toBeInTheDocument();
  });

  it('shows calm tiles when nothing needs attention', async () => {
    await draw(
      tilesFixture({
        open_shifts: {
          count: 1,
          oldest_opened_at: '2026-10-21T08:00:00.000Z',
          from_earlier_days: 0,
        },
        overdue: { contracts: 0, amount: '0.00', customers: 0 },
        low_stock: { products: 0 },
        eta: { needs_action: 0, blocked: 0, send_failed: 0, rejected: 0, due_soon: 0, overdue: 0 },
        unclosed_days: { days: 0, branches: 0 },
      }),
    );
    for (const id of ['open_shifts', 'overdue', 'low_stock', 'eta', 'unclosed_days']) {
      expect(tile(id)).not.toHaveAttribute('data-attention');
    }
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('is in Arabic (RTL) with Latin digits and the Arabic texts', async () => {
    await draw(tilesFixture(), '', 'ar');
    expect(within(tile('sales_today')!).getByText(t('dashboard.sales.title'))).toBeInTheDocument();
    expect(within(tile('sales_today')!).getByText('25,000.00 ج.م')).toBeInTheDocument();
    expect(within(tile('overdue')!).getByText('العقود: 2 · العملاء: 2')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });
});
