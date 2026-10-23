import {
  AlertIcon,
  BellIcon,
  CalculatorIcon,
  CartIcon,
  CheckCircleIcon,
  CheckIcon,
  ChartIcon,
  DashboardIcon,
  EyeIcon,
  FactoryIcon,
  PackageIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
  type IconComponent,
} from '@/components/ui/Icons';
import DiscountApprovalsBadge from '@/features/approvals/DiscountApprovalsBadge';
import type { TranslationKey } from '@/i18n';
import type { AuthUser, Role } from '@/types/auth';
import type { ComponentType } from 'react';

/**
 * THE app menu. Edit this file to add modules or change who sees what.
 *
 * Visibility: an item with neither `roles` nor `permission` is visible to everyone.
 * Otherwise it is visible if the user's role is in `roles` OR `permission` is in user.permissions.
 * A group is visible when at least one child is.
 *
 * NOTE: this only hides links (UX). The server is the authority; every module route and API
 * must enforce access itself (`RequirePermission` guard, F09).
 *
 * DRAFT role mapping: replace with the real matrix once confirmed.
 */
export interface NavItem {
  id: string;
  /** Translation key (nav namespace), translated where the menu is drawn. */
  labelKey: TranslationKey;
  icon?: IconComponent;
  to?: string;
  children?: NavItem[];
  roles?: Role[];
  permission?: string;
  permissionsAny?: string[];
  /** Hidden from anyone holding one of these (N06: the field home is for collectors, not managers). */
  permissionsNone?: string[];
  /** Drawn at the end of the menu line (a count of what waits). */
  badge?: ComponentType;
}

const OWNER: Role = 'OWNER';
// DRAFT: the branch-manager role (was OPS_MANAGER in the partner's list). F09 replaces this matrix.
const BRANCH_MANAGER: Role = 'BRANCH_MANAGER';

export const NAV: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: DashboardIcon, to: '/dashboard' },
  {
    id: 'sales',
    labelKey: 'nav.sales',
    icon: CartIcon,
    children: [
      {
        id: 'sales-history',
        labelKey: 'sales.history.title',
        to: '/sales/history',
        permissionsAny: ['sale.create', 'report.view'],
      },
      {
        id: 'sales-returns',
        labelKey: 'returns.title',
        to: '/sales/returns',
        // S05 (D88): returns, voids and exchanges; the server checks the branch.
        permissionsAny: ['refund.create', 'sale.create', 'report.view', 'cash.view'],
      },
      {
        id: 'sales-warranty',
        labelKey: 'sales.warranty.title',
        to: '/sales/warranty',
        permission: 'warranty.manage',
      },
      {
        id: 'sales-quotations',
        labelKey: 'quotations.title',
        to: '/sales/quotations',
        permission: 'quotation.manage',
      },
      {
        id: 'pos',
        labelKey: 'nav.pos',
        to: '/sales/pos',
        // S01 (D62): whoever may sell (sale.create: owner, managers, cashiers).
        permission: 'sale.create',
      },
      {
        id: 'discount-approvals',
        labelKey: 'nav.discountApprovals',
        to: '/sales/approvals',
        // S03 (D65): over-cap discount requests waiting for a manager; the count is the badge.
        permission: 'discount.above_cap',
        badge: DiscountApprovalsBadge,
      },
      {
        id: 'orders',
        labelKey: 'nav.orders',
        to: '/sales/orders',
        roles: [OWNER, BRANCH_MANAGER, 'CASHIER', 'ACCOUNTANT'],
      },
      {
        id: 'invoices',
        labelKey: 'nav.invoices',
        to: '/sales/invoices',
        roles: [OWNER, BRANCH_MANAGER, 'ACCOUNTANT', 'CASHIER'],
      },
    ],
  },
  {
    id: 'inventory',
    labelKey: 'nav.inventory',
    icon: PackageIcon,
    roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE'],
    children: [
      {
        id: 'products',
        labelKey: 'nav.products',
        to: '/inventory/products',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE'],
      },
      {
        id: 'categories',
        labelKey: 'nav.categories',
        to: '/inventory/categories',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE'],
      },
      {
        id: 'labels',
        labelKey: 'nav.labels',
        to: '/inventory/labels',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE'],
      },
      {
        id: 'stock',
        labelKey: 'nav.stock',
        to: '/inventory/stock',
        // I01: everyone with stock.view (cashiers check stock too); the server limits branches.
        permission: 'stock.view',
      },
      {
        id: 'movements',
        labelKey: 'nav.movements',
        to: '/inventory/movements',
        // I05: the movement history needs stock.view; the export also needs export.data.
        permission: 'stock.view',
      },
      {
        id: 'adjustments',
        labelKey: 'nav.adjustments',
        to: '/inventory/adjustments',
        // I02: the list needs stock.view; posting needs stock.adjust (the button is hidden without it).
        permission: 'stock.view',
      },
      {
        id: 'counts',
        labelKey: 'nav.counts',
        to: '/inventory/counts',
        permission: 'stock.count',
      },
      {
        id: 'transfers',
        labelKey: 'nav.transfers',
        to: '/inventory/transfers',
        // I03: reading needs stock.view; sending and receiving are checked per branch by the server.
        permission: 'stock.view',
      },
      {
        id: 'units',
        labelKey: 'nav.units',
        to: '/inventory/units',
        // I04: serial search and history need stock.view; registering needs stock.adjust.
        permission: 'stock.view',
      },
      {
        id: 'warehouses',
        labelKey: 'nav.warehouses',
        to: '/inventory/warehouses',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE'],
      },
    ],
  },
  {
    id: 'purchasing',
    labelKey: 'nav.purchasing',
    icon: TruckIcon,
    roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
    children: [
      {
        id: 'purchase-invoices',
        labelKey: 'purchases.nav.invoices',
        to: '/purchasing/invoices',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
      },
      {
        id: 'purchase-orders',
        labelKey: 'purchases.nav.orders',
        to: '/purchasing/orders',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
      },
      {
        id: 'purchase-returns',
        labelKey: 'purchases.nav.returns',
        to: '/purchasing/returns',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
      },
      {
        id: 'supplier-payments',
        labelKey: 'purchases.nav.payments',
        to: '/purchasing/payments',
        roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
      },
      {
        id: 'purchase-approvals',
        labelKey: 'purchases.nav.approvals',
        to: '/purchasing/approvals',
        permission: 'purchase.invoice_approve',
      },
    ],
  },
  {
    id: 'customers',
    labelKey: 'nav.customers',
    icon: UsersIcon,
    to: '/customers',
    roles: [OWNER, BRANCH_MANAGER, 'CASHIER', 'ACCOUNTANT', 'COLLECTOR'],
  },
  // N03 (D78): collections: find a contract of any branch and take installment payments.
  {
    id: 'collections',
    labelKey: 'collections.nav.title',
    icon: CheckCircleIcon,
    to: '/collections',
    permissionsAny: ['collection.create', 'collection.reverse'],
  },
  // N04 (D79): overdue contracts, the warnings work list and the legal referrals (every branch).
  {
    id: 'overdue',
    labelKey: 'overdue.nav.title',
    icon: AlertIcon,
    to: '/installments/overdue',
    permission: 'overdue.view',
  },
  // N06 (D81): the collector's home (their wallet and today's route). Managers hold collector.settle
  // and work from the wallets page instead.
  {
    id: 'field',
    labelKey: 'wallets.nav.field',
    icon: CheckCircleIcon,
    to: '/field',
    permissionsAny: ['collection.create'],
    permissionsNone: ['collector.settle'],
  },
  // N06 (D81): every collector's wallet, its ledger and the settlement (collector.settle or cash.view).
  {
    id: 'wallets',
    labelKey: 'wallets.nav.wallets',
    icon: CalculatorIcon,
    to: '/installments/wallets',
    permissionsAny: ['collector.settle', 'cash.view'],
  },
  // N05 (D80): the shop's early settlements, reschedules and write-offs (with the waived profit).
  {
    id: 'contract-changes',
    labelKey: 'contractChanges.nav.title',
    icon: AlertIcon,
    to: '/installments/changes',
    permissionsAny: [
      'report.financial',
      'contract.settle_early',
      'schedule.change',
      'contract.write_off',
    ],
  },
  // R03 (D72): credit exceptions waiting for a manager. The page itself is open to every customer
  // reader (a cashier follows their own requests from the customer's credit card).
  {
    id: 'credit-exceptions',
    labelKey: 'nav.creditExceptions',
    icon: CheckIcon,
    to: '/customers/credit-exceptions',
    permission: 'credit.approve',
  },
  // R05 (D75): field surveys, for whoever assigns, fills or decides them. A collector sees only the
  // surveys assigned to them (the server filters).
  {
    id: 'surveys',
    labelKey: 'surveys.nav.title',
    icon: EyeIcon,
    to: '/customers/surveys',
    permissionsAny: ['survey.assign', 'survey.submit', 'survey.decide'],
  },
  {
    id: 'suppliers',
    labelKey: 'nav.suppliers',
    icon: FactoryIcon,
    to: '/suppliers',
    roles: [OWNER, BRANCH_MANAGER, 'WAREHOUSE', 'ACCOUNTANT'],
  },
  // T03 (EC-91): every ETA receipt, with what to do about the ones that need a person.
  {
    id: 'tax',
    labelKey: 'nav.tax',
    icon: BellIcon,
    children: [
      {
        id: 'eta-receipts',
        labelKey: 'nav.etaReceipts',
        to: '/tax/eta-receipts',
        permission: 'fiscal.view',
      },
    ],
  },
  {
    id: 'accounting',
    labelKey: 'nav.accounting',
    icon: CalculatorIcon,
    roles: [OWNER, 'ACCOUNTANT'],
    children: [
      // K01 (D56): safes and banks; anyone with cash.view.
      {
        id: 'vaults',
        labelKey: 'cash.nav.vaults',
        to: '/accounting/vaults',
        permission: 'cash.view',
      },
      // K02 (D60): cashiers run their shift here (shift.operate); accountants read the history.
      {
        id: 'shifts',
        labelKey: 'cash.nav.shifts',
        to: '/accounting/shifts',
        roles: ['ACCOUNTANT'],
        permission: 'shift.operate',
      },
      // K03 (D61): whoever records expenses (expense.create: owner, managers, accountants).
      {
        id: 'expenses',
        labelKey: 'cash.nav.expenses',
        to: '/accounting/expenses',
        permission: 'expense.create',
      },
      // K04 (D84): the day close; whoever closes days (day.close) or reads cash (cash.view).
      {
        id: 'day-close',
        labelKey: 'dayClose.nav',
        to: '/accounting/day-close',
        permissionsAny: ['day.close', 'cash.view'],
      },
    ],
  },
  {
    id: 'reports',
    labelKey: 'nav.reports',
    icon: ChartIcon,
    to: '/reports',
    roles: [OWNER, BRANCH_MANAGER, 'ACCOUNTANT'],
  },
  // F07: the owner's audit screen; shown to anyone holding audit.view (an F06 override included).
  { id: 'audit', labelKey: 'nav.audit', icon: EyeIcon, to: '/audit', permission: 'audit.view' },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: SettingsIcon,
    children: [
      {
        id: 'employees',
        labelKey: 'employees.title',
        to: '/settings/employees',
        permission: 'employee.manage',
      },
      {
        id: 'settings-general',
        labelKey: 'settings.title',
        to: '/settings',
        permission: 'org.settings_manage',
      },
      {
        id: 'settings-profile',
        labelKey: 'settings.profile.title',
        to: '/settings/profile',
        permission: 'org.profile_manage',
      },
      {
        id: 'branches',
        labelKey: 'branches.title',
        to: '/settings/branches',
        permission: 'branch.manage',
      },
      // T02 (D67): the shop's ETA connection, and each POS's registration with the ETA.
      {
        id: 'settings-eta',
        labelKey: 'eta.title',
        to: '/settings/eta',
        permission: 'org.settings_manage',
      },
      {
        id: 'devices',
        labelKey: 'eta.devices.title',
        to: '/settings/devices',
        permission: 'device.manage',
      },
      // M01 (D83): load products, customers, suppliers and opening stock from Excel or CSV.
      {
        id: 'settings-import',
        labelKey: 'imports.title',
        to: '/settings/import',
        permission: 'import.data',
      },
      // M02 (D85): the opening balances' reconciliation report, sign-off and undo.
      {
        id: 'settings-migration',
        labelKey: 'migration.title',
        to: '/settings/migration',
        permissionsAny: ['import.data', 'report.financial'],
      },
      // M03 (D86): the full export; export.data works in an expired shop.
      {
        id: 'settings-export',
        labelKey: 'exports.title',
        to: '/settings/export',
        permission: 'export.data',
      },
    ],
  },
];

/** The one visibility rule: the menu (filterNav) and the route guard (RequireNavItem) both use it. */
export function canSee(item: NavItem, user: AuthUser): boolean {
  if (item.permissionsNone?.some((key) => user.permissions.includes(key))) return false;
  if (!item.roles && !item.permission && !item.permissionsAny) return true;
  return !!(
    item.roles?.includes(user.role) ||
    (item.permission && user.permissions.includes(item.permission)) ||
    item.permissionsAny?.some((key) => user.permissions.includes(key))
  );
}

export function filterNav(items: NavItem[], user: AuthUser | null): NavItem[] {
  if (!user) return [];
  return items.flatMap((item) => {
    if (item.children) {
      const children = filterNav(item.children, user);
      return children.length ? [{ ...item, children }] : [];
    }
    return canSee(item, user) ? [item] : [];
  });
}

/** Every routable item (leaves), unfiltered. Used to mount placeholder routes. */
export function navLeaves(items: NavItem[] = NAV): NavItem[] {
  return items.flatMap((i) => (i.children ? navLeaves(i.children) : [i]));
}
