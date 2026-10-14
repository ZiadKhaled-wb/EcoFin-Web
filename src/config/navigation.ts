import {
  BellIcon,
  CalculatorIcon,
  CartIcon,
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
        id: 'sales-warranty',
        labelKey: 'sales.warranty.title',
        to: '/sales/warranty',
        permission: 'warranty.manage',
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
    ],
  },
];

/** The one visibility rule: the menu (filterNav) and the route guard (RequireNavItem) both use it. */
export function canSee(item: NavItem, user: AuthUser): boolean {
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
