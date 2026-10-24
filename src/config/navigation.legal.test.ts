import { describe, expect, it } from 'vitest';
import { ROLE_DEFAULT_PERMISSIONS } from '@ziadkhaled-wb/contracts';
import type { AuthUser } from '@/types/auth';
import { canSee, filterNav, homePath, isLegalOnly, NAV, navLeaves } from './navigation';

/**
 * L01 + N09 (D92): the lawyer's menu and landing. A user whose keys are only the legal and overdue
 * ones has no dashboard, sees only Legal and Overdue, and starts on /legal. One rule (isLegalOnly)
 * drives the menu, the dashboard guard and the landing.
 */
const user = (role: AuthUser['role'], permissions: string[]): AuthUser => ({
  id: 'u',
  email: 'u@example.com',
  username: null,
  role,
  permissions,
  mustChangePassword: false,
});
const keysOf = (role: AuthUser['role']) => [...ROLE_DEFAULT_PERMISSIONS[role]] as string[];
const leafIds = (u: AuthUser, modules?: string[]) =>
  navLeaves(filterNav(NAV, u, modules)).map((i) => i.id);

describe('the lawyer (L01)', () => {
  const lawyer = user('LAWYER', keysOf('LAWYER'));

  it('has the four legal and overdue keys and nothing about sales or cash', () => {
    expect(keysOf('LAWYER').sort()).toEqual([
      'customer.view_pii',
      'legal.manage',
      'legal.view',
      'overdue.view',
    ]);
  });

  it('sees only Legal and Overdue in the menu: no dashboard, no customers, no sales', () => {
    expect(leafIds(lawyer).sort()).toEqual(['legal', 'overdue']);
  });

  it('lands on /legal; everyone else on the dashboard', () => {
    expect(isLegalOnly(lawyer)).toBe(true);
    expect(homePath(lawyer)).toBe('/legal');
    for (const role of ['OWNER', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT', 'COLLECTOR'] as const) {
      expect(isLegalOnly(user(role, keysOf(role))), role).toBe(false);
      expect(homePath(user(role, keysOf(role))), role).toBe('/dashboard');
    }
  });

  it('a lawyer who is also given another key is no longer a lawyer-only user', () => {
    const more = user('LAWYER', [...keysOf('LAWYER'), 'report.view']);
    expect(isLegalOnly(more)).toBe(false);
    expect(navLeaves(filterNav(NAV, more)).some((i) => i.id === 'dashboard')).toBe(true);
  });

  it('with no permissions loaded nobody is taken for a lawyer', () => {
    expect(isLegalOnly(user('OWNER', []))).toBe(false);
  });
});

describe('the Legal menu item (L01)', () => {
  const legal = navLeaves().find((i) => i.id === 'legal')!;

  it('needs legal.view', () => {
    expect(canSee(legal, user('CASHIER', keysOf('CASHIER')))).toBe(false);
    expect(canSee(legal, user('CASHIER', [...keysOf('CASHIER'), 'legal.view']))).toBe(true);
    expect(canSee(legal, user('OWNER', keysOf('OWNER')))).toBe(true);
  });

  it('is hidden when the shop plan has no legal module, and shown while the plan is unknown', () => {
    const owner = user('OWNER', keysOf('OWNER'));
    expect(canSee(legal, owner, ['pos', 'installments'])).toBe(false);
    expect(canSee(legal, owner, ['pos', 'legal'])).toBe(true);
    expect(canSee(legal, owner)).toBe(true);
  });
});
