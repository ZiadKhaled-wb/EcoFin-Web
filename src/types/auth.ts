import type { EmployeeRole } from '@ecotech/contracts';
import { t } from '@/i18n';

/** API shapes come from `@ecotech/contracts`. Only UI-side types live here. */
export type Role = EmployeeRole;

/** Translated at read time so a language switch is picked up. */
export const ROLE_LABELS: Record<Role, string> = {
  get OWNER() {
    return t('auth.role.OWNER');
  },
  get BRANCH_MANAGER() {
    return t('auth.role.BRANCH_MANAGER');
  },
  get CASHIER() {
    return t('auth.role.CASHIER');
  },
  get WAREHOUSE() {
    return t('auth.role.WAREHOUSE');
  },
  get COLLECTOR() {
    return t('auth.role.COLLECTOR');
  },
  get ACCOUNTANT() {
    return t('auth.role.ACCOUNTANT');
  },
  get LAWYER() {
    return t('auth.role.LAWYER');
  },
};

/** The signed-in user as the shell sees it (built from the login response). */
export interface AuthUser {
  id: string;
  email: string | null;
  /** Set when the user signed in with a username. */
  username: string | null;
  /** Role in the active shop. */
  role: Role;
  /** Permission keys. Filled by F09 (`GET /api/me/permissions`); empty until then. */
  permissions: string[];
  must_change_password: boolean;
}
