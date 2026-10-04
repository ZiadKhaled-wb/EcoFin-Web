import { t, type TranslationKey } from '@/i18n';

/** Audit actions the server writes today (EcoFin-API audit registry). Later slices add theirs. */
const ACTION_KEYS: Record<string, TranslationKey> = {
  'auth.login': 'audit.actions.auth_login',
  'auth.logout': 'audit.actions.auth_logout',
  'auth.password_change': 'audit.actions.auth_password_change',
  'employee.permission_set': 'audit.actions.employee_permission_set',
  'employee.branches_set': 'audit.actions.employee_branches_set',
};

const ENTITY_KEYS: Record<string, TranslationKey> = {
  employee: 'audit.entityTypes.employee',
};

export const KNOWN_ACTIONS = Object.keys(ACTION_KEYS);
export const KNOWN_ENTITY_TYPES = Object.keys(ENTITY_KEYS);

/** A translated label, or the raw action for one this screen doesn't know yet. */
export function actionLabel(action: string): string {
  const key = ACTION_KEYS[action];
  return key ? t(key) : action;
}

export function entityTypeLabel(type: string): string {
  const key = ENTITY_KEYS[type];
  return key ? t(key) : type;
}
