import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ROLES, ROLE_DEFAULT_PERMISSIONS } from '@ziadkhaled-wb/contracts';
import type { AuthUser } from '@/types/auth';
import { canSee, filterNav, NAV, navLeaves } from './navigation';

/**
 * TEST-2 (EC-130): each of the 7 roles, with its default permissions, sees only the menu items it
 * may use. The menu is UX only (the server checks every route), but it must agree with the role
 * defaults in the contracts: a permission-gated item shows exactly for the roles that hold that
 * permission by default, and an extra per-employee permission makes it appear.
 */
const user = (role: AuthUser['role'], permissions: string[]): AuthUser => ({
  id: 'u',
  email: 'u@example.com',
  username: null,
  role,
  permissions,
  mustChangePassword: false,
});
const defaults = (role: AuthUser['role']) => [...ROLE_DEFAULT_PERMISSIONS[role]] as string[];

describe('menu by role (TEST-2)', () => {
  it('covers all 7 roles', () => {
    expect(EMPLOYEE_ROLES).toHaveLength(7);
  });

  it.each(EMPLOYEE_ROLES)('%s: permission-gated items follow the role defaults', (role) => {
    const u = user(role, defaults(role));
    for (const item of navLeaves().filter((i) => i.permission && !i.roles)) {
      expect(canSee(item, u), `${role} → ${item.id} (${item.permission})`).toBe(
        defaults(role).includes(item.permission!),
      );
    }
  });

  it('an extra per-employee permission shows its item', () => {
    const audit = navLeaves().find((i) => i.id === 'audit')!;
    expect(canSee(audit, user('CASHIER', defaults('CASHIER')))).toBe(false);
    expect(canSee(audit, user('CASHIER', [...defaults('CASHIER'), 'audit.view']))).toBe(true);
  });

  it('no session sees nothing but the public items', () => {
    expect(filterNav(NAV, null).every((i) => !i.roles && !i.permission)).toBe(true);
  });

  // N06 (D81): the field home is for collectors; whoever settles wallets works from the wallets page.
  it('the field home shows for a collection holder who does not settle wallets', () => {
    const field = navLeaves().find((i) => i.id === 'field')!;
    expect(canSee(field, user('COLLECTOR', defaults('COLLECTOR')))).toBe(true);
    expect(canSee(field, user('CASHIER', defaults('CASHIER')))).toBe(true);
    expect(canSee(field, user('BRANCH_MANAGER', defaults('BRANCH_MANAGER')))).toBe(false);
    expect(canSee(field, user('ACCOUNTANT', defaults('ACCOUNTANT')))).toBe(false);
    expect(canSee(field, user('WAREHOUSE', defaults('WAREHOUSE')))).toBe(false);
    // An extra collector.settle takes it away; an extra collection.create gives it.
    expect(canSee(field, user('COLLECTOR', [...defaults('COLLECTOR'), 'collector.settle']))).toBe(
      false,
    );
    expect(canSee(field, user('WAREHOUSE', [...defaults('WAREHOUSE'), 'collection.create']))).toBe(
      true,
    );
  });

  it('the wallets page shows for whoever settles wallets or reads cash', () => {
    const wallets = navLeaves().find((i) => i.id === 'wallets')!;
    expect(canSee(wallets, user('ACCOUNTANT', defaults('ACCOUNTANT')))).toBe(true);
    expect(canSee(wallets, user('BRANCH_MANAGER', defaults('BRANCH_MANAGER')))).toBe(true);
    expect(canSee(wallets, user('COLLECTOR', defaults('COLLECTOR')))).toBe(false);
    expect(canSee(wallets, user('CASHIER', defaults('CASHIER')))).toBe(false);
  });

  // The visible pages per role, written down so a change to who sees what is deliberate.
  it.each(EMPLOYEE_ROLES)('%s sees these pages', (role) => {
    const visible = navLeaves(filterNav(NAV, user(role, defaults(role)))).map((i) => i.to);
    expect(visible).toMatchSnapshot();
  });
});
