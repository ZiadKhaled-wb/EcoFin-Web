import { describe, expect, it } from 'vitest';
import { ar, en } from '@/i18n/resources';
import { setLanguage } from '@/i18n';
import {
  ACTION_GROUPS,
  KNOWN_ACTIONS,
  KNOWN_ENTITY_TYPES,
  actionGroup,
  actionLabel,
  actionOptions,
  entityTypeLabel,
} from './labels';

/**
 * Every action and record type the server writes to the audit log (EcoFin-API: the app.write_audit
 * calls in the migrations, the audit registry and the audit_log of a full CI run; 15 Oct 2026).
 * A slice that writes a new action adds it here and its label in audit.json (ar and en).
 */
const SERVER_ACTIONS = [
  'approval.cancelled',
  'approval.decided',
  'approval.requested',
  'auth.login',
  'auth.logout',
  'auth.password_change',
  'branch.created',
  'branch.deactivated',
  'branch.reactivated',
  'branch.updated',
  'cash_account.created',
  'cash_account.deactivated',
  'cash_account.opening_balance',
  'cash_account.reactivated',
  'cash_account.renamed',
  'cash_transfer.created',
  'category.archived',
  'category.created',
  'category.restored',
  'category.updated',
  'credit_exception.approved',
  'credit_exception.cancelled',
  'credit_exception.rejected',
  'credit_exception.requested',
  'customer.created',
  'customer.credit_limit_set',
  'customer.guarantor_linked',
  'customer.guarantor_relation_set',
  'customer.guarantor_unlinked',
  'customer.status_set',
  'customer.updated',
  'device.created',
  'device.deactivated',
  'device.eta_updated',
  'device.paired',
  'device.pairing_code_created',
  'device.reactivated',
  'device.unpaired',
  'device.updated',
  'employee.active_set',
  'employee.branches_set',
  'employee.created',
  'employee.password_reset_completed',
  'employee.password_reset_requested',
  'employee.permission_set',
  'employee.updated',
  'eta.settings_updated',
  'expense.posted',
  'expense.reversed',
  'expense_category.archived',
  'expense_category.created',
  'expense_category.renamed',
  'expense_category.restored',
  'file.upload',
  'fiscal.check_requested',
  'fiscal.correction_requested',
  'fiscal.device_assigned',
  'fiscal.retry_many',
  'fiscal.retry_requested',
  'guarantor.archived',
  'guarantor.created',
  'guarantor.restored',
  'guarantor.updated',
  'installment_policy.published',
  'invite.accepted',
  'invite.resent',
  'org.profile_updated',
  'org.provisioned',
  'org.reactivated',
  'org.settings_updated',
  'org.suspended',
  'product.archived',
  'product.created',
  'product.price_changed',
  'product.restored',
  'product.updated',
  'purchase_invoice.approval_requested',
  'purchase_invoice.approved',
  'purchase_invoice.created',
  'purchase_invoice.rejected',
  'purchase_invoice.updated',
  'purchase_order.cancelled',
  'purchase_order.created',
  'purchase_order.sent',
  'purchase_order.updated',
  'purchase_return.posted',
  'sale.created',
  'sale.receipt_printed',
  'sale.voided',
  'shift.cash_moved',
  'shift.closed',
  'shift.force_closed',
  'shift.opened',
  'stock.min_level_set',
  'stock_adjustment.posted',
  'stock_count.cancelled',
  'stock_count.created',
  'stock_count.posted',
  'stock_movements.exported',
  'stock_transfer.cancelled',
  'stock_transfer.created',
  'stock_transfer.received',
  'stock_transfer.sent',
  'stock_transfer.updated',
  'subscription.dates_changed',
  'subscription.payment_recorded',
  'subscription.plan_changed',
  'supplier.archived',
  'supplier.created',
  'supplier.restored',
  'supplier.updated',
  'supplier_payment.posted',
  'supplier_payment.reversed',
  'survey.approved',
  'survey.assigned',
  'survey.cancelled',
  'survey.reassigned',
  'survey.rejected',
  'survey.saved',
  'survey.submitted',
  'tax_class.archived',
  'tax_class.created',
  'tax_class.restored',
  'tax_class.updated',
  'units.registered',
  'warranty_claim.moved',
  'warranty_claim.opened',
];
const SERVER_ENTITY_TYPES = [
  'approval',
  'branch',
  'cash_account',
  'cash_transfer',
  'category',
  'customer',
  'device',
  'employee',
  'eta_settings',
  'expense',
  'expense_category',
  'field_survey',
  'file',
  'fiscal_submission',
  'guarantor',
  'import_job',
  'installment_policy',
  'invite',
  'organization',
  'product',
  'purchase_invoice',
  'purchase_order',
  'purchase_return',
  'sale',
  'shift',
  'stock_adjustment',
  'stock_count',
  'stock_movement',
  'stock_transfer',
  'subscription_payment',
  'supplier',
  'supplier_payment',
  'tax_class',
  'warranty_claim',
];

type Words = Record<string, Record<string, string>>;
const label = (words: Words, action: string) => {
  const [area = '', event = ''] = action.split('.');
  return words[area]?.[event];
};

describe('audit labels', () => {
  it('every server action has an Arabic and an English label, and nothing else is listed', () => {
    const missing = SERVER_ACTIONS.filter(
      (a) => !label(ar.audit.actions as Words, a) || !label(en.audit.actions as Words, a),
    );
    expect(missing).toEqual([]);
    expect([...KNOWN_ACTIONS].sort()).toEqual([...SERVER_ACTIONS].sort());
  });

  it('every server record type has an Arabic and an English label', () => {
    const entAr = ar.audit.entityTypes as Record<string, string>;
    const entEn = en.audit.entityTypes as Record<string, string>;
    expect(SERVER_ENTITY_TYPES.filter((e) => !entAr[e] || !entEn[e])).toEqual([]);
    expect([...KNOWN_ENTITY_TYPES].sort()).toEqual([...SERVER_ENTITY_TYPES].sort());
  });

  it('every action belongs to exactly one filter group', () => {
    expect(SERVER_ACTIONS.filter((a) => actionGroup(a) === null)).toEqual([]);
    const areas = Object.values(ACTION_GROUPS).flat();
    expect(new Set(areas).size).toBe(areas.length);
  });

  it('shows words, never the code, in Arabic and English', async () => {
    await setLanguage('ar');
    expect(actionLabel('purchase_order.sent')).toBe('إرسال أمر شراء');
    expect(actionLabel('device.pairing_code_created')).toBe('إنشاء رمز ربط جهاز');
    expect(entityTypeLabel('purchase_order')).toBe('أمر شراء');
    expect(SERVER_ACTIONS.filter((a) => actionLabel(a).includes('.'))).toEqual([]);
    await setLanguage('en');
    expect(actionLabel('purchase_order.sent')).toBe('Sent a purchase order');
    expect(actionLabel('sale.created')).toBe('Made a sale');
    expect(entityTypeLabel('warranty_claim')).toBe('Warranty claim');
  });

  it('an action not known yet reads as words, not as a code', () => {
    expect(actionLabel('contract.issued')).toBe('contract · issued');
    expect(actionLabel('collector_wallet.settled')).toBe('collector wallet · settled');
    expect(entityTypeLabel('schedule_line')).toBe('schedule line');
  });

  it('the filter lists every action once, grouped, each group under its heading', async () => {
    await setLanguage('en');
    const options = actionOptions();
    expect(options.map((o) => o.value).sort()).toEqual([...SERVER_ACTIONS].sort());
    const groups = options.map((o) => o.group);
    // A group's options are together (one <optgroup> each).
    const runs = groups.filter((g, i) => i === 0 || g !== groups[i - 1]);
    expect(runs).toHaveLength(Object.keys(ACTION_GROUPS).length);
    expect(runs[0]).toBe('Sales and e-receipts');
  });
});
