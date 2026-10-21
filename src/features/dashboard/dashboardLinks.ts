/**
 * Where each tile of the owner dashboard (D01, D87) goes: the page that lists what is behind the
 * number, opened with the same filters (today, the chosen branch), so that page adds up to the same
 * number. `branchId` is '' for all branches. Detail pages read these from their URL.
 */
const query = (params: Record<string, string>) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const dashboardLinks = {
  sales: (date: string, branchId: string) =>
    `/sales/history${query({ from: date, to: date, branch_id: branchId })}`,
  collections: (date: string, branchId: string) =>
    branchId ? `/accounting/day-close/${branchId}/${date}` : '/accounting/day-close',
  vaults: (branchId: string) => `/accounting/vaults${query({ branch_id: branchId })}`,
  openShifts: (branchId: string) =>
    `/accounting/shifts${query({ status: 'open', branch_id: branchId })}`,
  wallets: (branchId: string) => `/installments/wallets${query({ branch_id: branchId })}`,
  overdue: (branchId: string) => `/installments/overdue${query({ branch_id: branchId })}`,
  lowStock: (branchId: string) => `/inventory/stock${query({ low: '1', branch_id: branchId })}`,
  eta: (branchId: string) =>
    `/tax/eta-receipts${query({ situation: 'problem', branch_id: branchId })}`,
  unclosedDays: (branchId: string) => `/accounting/day-close${query({ branch_id: branchId })}`,
  discountApprovals: () => '/sales/approvals',
  purchaseApprovals: () => '/purchasing/approvals',
  creditExceptions: () => '/customers/credit-exceptions',
};
