import {
  CalculatorIcon,
  CartIcon,
  ChartIcon,
  DashboardIcon,
  FactoryIcon,
  PackageIcon,
  SettingsIcon,
  TeamIcon,
  TruckIcon,
  UsersIcon,
  type IconComponent,
} from '@/components/ui/Icons';
import type { AuthUser, Role } from '@/types/auth';

/**
 * THE app menu. Edit this file to add modules or change who sees what.
 *
 * Visibility: an item with neither `roles` nor `permission` is visible to everyone.
 * Otherwise it is visible if the user's role is in `roles` OR `permission` is in user.permissions.
 * A group is visible when at least one child is.
 *
 * NOTE: this only hides links (UX). The server is the authority; every module route and API
 * must enforce access itself (RequirePermission guard arrives with the first real module).
 *
 * DRAFT role mapping: replace with the real matrix once confirmed.
 */
export interface NavItem {
  id: string;
  label: string;
  icon?: IconComponent;
  to?: string;
  children?: NavItem[];
  roles?: Role[];
  permission?: string;
}

const OWNER: Role = 'OWNER';
const OPS: Role = 'BRANCH_MANAGER';

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: DashboardIcon, to: '/dashboard' },
  {
    id: 'sales',
    label: 'المبيعات',
    icon: CartIcon,
    children: [
      { id: 'pos', label: 'نقطة البيع', to: '/sales/pos', roles: [OWNER, OPS, 'CASHIER'] },
      {
        id: 'orders',
        label: 'الطلبات',
        to: '/sales/orders',
        roles: [OWNER, OPS, 'CASHIER', 'ACCOUNTANT'],
      },
      {
        id: 'invoices',
        label: 'الفواتير',
        to: '/sales/invoices',
        roles: [OWNER, OPS, 'ACCOUNTANT', 'CASHIER'],
      },
    ],
  },
  {
    id: 'inventory',
    label: 'المخزون',
    icon: PackageIcon,
    roles: [OWNER, OPS, 'WAREHOUSE'],
    children: [
      {
        id: 'products',
        label: 'المنتجات',
        to: '/inventory/products',
        roles: [OWNER, OPS, 'WAREHOUSE'],
      },
      {
        id: 'categories',
        label: 'التصنيفات',
        to: '/inventory/categories',
        roles: [OWNER, OPS, 'WAREHOUSE'],
      },
      {
        id: 'stock',
        label: 'حركة المخزون',
        to: '/inventory/stock',
        roles: [OWNER, OPS, 'WAREHOUSE'],
      },
      {
        id: 'warehouses',
        label: 'المخازن',
        to: '/inventory/warehouses',
        roles: [OWNER, OPS, 'WAREHOUSE'],
      },
    ],
  },
  {
    id: 'purchasing',
    label: 'المشتريات',
    icon: TruckIcon,
    to: '/purchasing',
    roles: [OWNER, OPS, 'WAREHOUSE', 'ACCOUNTANT'],
  },
  {
    id: 'customers',
    label: 'العملاء',
    icon: UsersIcon,
    to: '/customers',
    roles: [OWNER, OPS, 'CASHIER', 'ACCOUNTANT', 'COLLECTOR'],
  },
  {
    id: 'suppliers',
    label: 'الموردون',
    icon: FactoryIcon,
    to: '/suppliers',
    roles: [OWNER, OPS, 'WAREHOUSE', 'ACCOUNTANT'],
  },
  {
    id: 'employees',
    label: 'الموظفون',
    icon: TeamIcon,
    to: '/employees',
    roles: [OWNER, OPS],
  },
  {
    id: 'accounting',
    label: 'الحسابات',
    icon: CalculatorIcon,
    to: '/accounting',
    roles: [OWNER, 'ACCOUNTANT'],
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: ChartIcon,
    to: '/reports',
    roles: [OWNER, OPS, 'ACCOUNTANT'],
  },
  { id: 'settings', label: 'الإعدادات', icon: SettingsIcon, to: '/settings', roles: [OWNER] },
];

function canSee(item: NavItem, user: AuthUser): boolean {
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
