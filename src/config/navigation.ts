import {
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
import type { TranslationKey } from '@/i18n';
import type { AuthUser, Role } from '@/types/auth';

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
        id: 'pos',
        labelKey: 'nav.pos',
        to: '/sales/pos',
        roles: [OWNER, BRANCH_MANAGER, 'CASHIER'],
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
  {
    id: 'accounting',
    labelKey: 'nav.accounting',
    icon: CalculatorIcon,
    to: '/accounting',
    roles: [OWNER, 'ACCOUNTANT'],
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
    ],
  },
];

/** The one visibility rule: the menu (filterNav) and the route guard (RequireNavItem) both use it. */
export function canSee(item: NavItem, user: AuthUser): boolean {
  if (!item.roles && !item.permission) return true;
  return !!(
    item.roles?.includes(user.role) ||
    (item.permission && user.permissions.includes(item.permission))
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
