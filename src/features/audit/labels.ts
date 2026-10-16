import type { SelectOption } from '@/components/ui/Select';
import { t, type TranslationKey } from '@/i18n';
import { ar } from '@/i18n/resources';

/*
 * Audit log words. Every action the server writes ("purchase_order.sent") has a label at
 * audit.actions.<area>.<event> in both languages, and every record type ("purchase_order") at
 * audit.entityTypes.<type>. labels.test.ts lists the server's actions and record types (EcoFin-API
 * audit_log, 127 actions and 34 types on 15 Oct 2026) and fails when one has no label: a new slice
 * that writes a new action adds its label there.
 */

const ACTIONS = ar.audit.actions as Record<string, Record<string, string>>;
const ENTITY_TYPES = ar.audit.entityTypes as Record<string, string>;

/** Which filter group an action's area belongs to (the Action filter lists them by group). */
export const ACTION_GROUPS = {
  sales: ['sale', 'approval', 'warranty_claim', 'fiscal', 'eta'],
  customers: ['customer', 'guarantor', 'credit_exception', 'survey', 'installment_policy'],
  inventory: [
    'product',
    'category',
    'tax_class',
    'stock',
    'stock_adjustment',
    'stock_count',
    'stock_movements',
    'stock_transfer',
    'units',
  ],
  purchasing: [
    'supplier',
    'supplier_payment',
    'purchase_invoice',
    'purchase_order',
    'purchase_return',
  ],
  cash: ['cash_account', 'cash_transfer', 'shift', 'expense', 'expense_category'],
  people: ['auth', 'employee', 'invite'],
  shop: ['org', 'branch', 'device', 'subscription', 'file'],
} as const satisfies Record<string, readonly string[]>;
export type ActionGroup = keyof typeof ACTION_GROUPS;

/** Every action this screen has words for, in the order of the translation file. */
export const KNOWN_ACTIONS = Object.entries(ACTIONS).flatMap(([area, events]) =>
  Object.keys(events).map((event) => `${area}.${event}`),
);
export const KNOWN_ENTITY_TYPES = Object.keys(ENTITY_TYPES);

function knownAction(action: string): [string, string] | null {
  const [area, event, ...rest] = action.split('.');
  if (!area || !event || rest.length > 0 || ACTIONS[area]?.[event] === undefined) return null;
  return [area, event];
}

/** "purchase_order.sent" -> "purchase order · sent": readable words for a code not known yet. */
function readable(code: string): string {
  return code
    .split('.')
    .map((part) => part.replaceAll('_', ' '))
    .join(' · ');
}

/** The translated label of an action, or readable words for one this screen doesn't know yet. */
export function actionLabel(action: string): string {
  const known = knownAction(action);
  return known ? t(`audit.actions.${known[0]}.${known[1]}` as TranslationKey) : readable(action);
}

export function entityTypeLabel(type: string): string {
  return ENTITY_TYPES[type] === undefined
    ? readable(type)
    : t(`audit.entityTypes.${type}` as TranslationKey);
}

/** The group an action is listed under, or null for an area no group names. */
export function actionGroup(action: string): ActionGroup | null {
  const area = action.split('.')[0] ?? '';
  const found = Object.entries(ACTION_GROUPS).find(([, areas]) =>
    (areas as readonly string[]).includes(area),
  );
  return found ? (found[0] as ActionGroup) : null;
}

/** The Action filter's options: by group, then by label in the current language. */
export function actionOptions(): SelectOption[] {
  return (Object.keys(ACTION_GROUPS) as ActionGroup[]).flatMap((group) =>
    KNOWN_ACTIONS.filter((a) => actionGroup(a) === group)
      .map((a) => ({ value: a, label: actionLabel(a), group: t(`audit.groups.${group}`) }))
      .sort((x, y) => x.label.localeCompare(y.label)),
  );
}

/** The record type filter's options, by label in the current language. */
export function entityTypeOptions(): SelectOption[] {
  return KNOWN_ENTITY_TYPES.map((v) => ({ value: v, label: entityTypeLabel(v) })).sort((x, y) =>
    x.label.localeCompare(y.label),
  );
}
