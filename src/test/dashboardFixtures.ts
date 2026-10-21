import type { OwnerDashboard } from '@ziadkhaled-wb/contracts';

/** A full dashboard as the server answers it for an owner (test data). */
export const tilesFixture = (
  over: Partial<OwnerDashboard['tiles']> = {},
): OwnerDashboard['tiles'] => ({
  sales_today: {
    count: 5,
    total: '25000.00',
    paid_by_method: { cash: '4700.00', bank_transfer: '300.00', store_credit: '0.00' },
    on_contract: '20000.00',
  },
  collections_today: { count: 2, total: '1400.00', in_field: '400.00' },
  cash: {
    safes: '9500.00',
    banks: '1200.00',
    drawers: '3000.00',
    wallets: '400.00',
    total_in_branches: '12900.00',
  },
  open_shifts: { count: 2, oldest_opened_at: '2026-10-20T08:00:00.000Z', from_earlier_days: 1 },
  overdue: { contracts: 2, amount: '2600.00', customers: 2 },
  low_stock: { products: 5 },
  eta: { needs_action: 3, blocked: 1, send_failed: 1, rejected: 1, due_soon: 0, overdue: 0 },
  unclosed_days: { days: 1, branches: 1 },
  approvals: { discount: 2, purchase: 2, credit: 1, total: 5 },
  ...over,
});

export const NO_TILES: OwnerDashboard['tiles'] = {
  sales_today: null,
  collections_today: null,
  cash: null,
  open_shifts: null,
  overdue: null,
  low_stock: null,
  eta: null,
  unclosed_days: null,
  approvals: null,
};

export const dashboardFixture = (over: Partial<OwnerDashboard> = {}): OwnerDashboard => ({
  business_date: '2026-10-21',
  branch_id: null,
  generated_at: '2026-10-21T10:00:00.000Z',
  tiles: tilesFixture(),
  ...over,
});
