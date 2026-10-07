import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallmentPolicy, ShopSettings } from '@ziadkhaled-wb/contracts';
import { settingsApi } from '@/services/settingsApi';
import { ApiError } from '@/lib/api';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import SettingsPage from './SettingsPage';
import { tabChanges, toForm, weightsTotal } from './settingsForm';
import { policyBody, toPolicyForm } from './policyForm';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a0300000-0000-4000-8000-000000000001';
const policy: InstallmentPolicy = {
  id: ID,
  version: 1,
  min_down_payment_pct: '0.00',
  max_down_payment_pct: null,
  down_payment_rules: {},
  max_months: 12,
  amount_tiers: [],
  markup_tiers: [{ up_to_months: 12, pct: 0 }],
  allowed_frequencies: ['monthly'],
  min_sale_amount: '0.00',
  min_installment: '0.00',
  min_installment_by_frequency: {},
  rounding_step: '1.00',
  late_fee_type: 'none',
  late_fee_value: '0.00',
  late_fee_recurring: false,
  late_fee_cap: null,
  grace_days: 0,
  early_settlement_rule: 'no_discount',
  early_settlement_pct: null,
  guarantor_required_above: null,
  survey_required_above: null,
  effective_from: '2026-10-07T09:00:00Z',
  created_at: '2026-10-07T09:00:00Z',
  created_by: null,
};
const settings: ShopSettings = {
  name: 'Shop A',
  address: null,
  phone: null,
  timezone: 'Africa/Cairo',
  default_language: 'ar',
  logo_file_id: null,
  tax_registration_no: null,
  receipt_header: null,
  receipt_footer: null,
  receipt_width_mm: 80,
  receipt_fields: {
    logo: true,
    address: true,
    phone: true,
    tax_registration_no: true,
    branch: true,
    cashier: true,
    customer: true,
  },
  prices_include_vat: true,
  default_tax_class_id: null,
  discount_caps: { CASHIER: 5 },
  return_policy_days: 14,
  purchase_approval_threshold: null,
  credit_limit_income_multiple: null,
  collector_commission_pct: '0.00',
  allow_negative_bank: false,
  theme_color: '#2563EB',
  currency: 'EGP',
  credit_min_score: 50,
  credit_score_weights: { guarantors: 40, income: 30, residence: 20, identity: 10 },
  legal_referral_days: { daily: 35, weekly: 63, monthly: 63 },
  customer_ban_days: 180,
  overdue_warning_interval_days: 10,
  global_min_stock: 3,
  updated_at: '2026-10-07T09:00:00Z',
  updated_by: null,
  my_discount: { cap_pct: 100, above_cap_allowed: true },
  installment_policy: policy,
  tax_class_options: [],
};

describe('P03 settings form helpers', () => {
  it('an untouched tab has nothing to send', () => {
    for (const tab of [
      'general',
      'receipt',
      'tax',
      'sales',
      'credit',
      'legal',
      'inventory',
    ] as const)
      expect(tabChanges(tab, toForm(settings), settings)).toEqual({ ok: true, body: null });
  });

  it('sends only the changed fields of the tab, with decimal strings for money', () => {
    const form = toForm(settings);
    form.discount_caps.CASHIER = '10';
    form.purchase_approval_threshold = '25000.5';
    form.return_policy_days = '14';
    form.name = 'Changed on another tab';
    expect(tabChanges('sales', form, settings)).toEqual({
      ok: true,
      body: { discount_caps: { CASHIER: 10 }, purchase_approval_threshold: '25000.50' },
    });
  });

  it('refuses credit weights that do not add up to 100', () => {
    const form = toForm(settings);
    form.credit_score_weights.identity = '5';
    expect(weightsTotal(form)).toBe(95);
    expect(tabChanges('credit', form, settings)).toEqual({ ok: false, reason: 'weightsSum' });
  });

  it('builds a policy body with rules only for allowed frequencies', () => {
    const form = toPolicyForm(policy);
    form.allowed_frequencies = ['monthly', 'daily'];
    form.down_payment_rules.daily = 'installment_per_day_of_month';
    form.down_payment_rules.weekly = 'one_installment';
    form.min_installment_by_frequency.daily = '50';
    form.amount_tiers = [{ up_to_amount: '100000', max_months: '10' }];
    const body = policyBody(form);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      allowed_frequencies: ['monthly', 'daily'],
      down_payment_rules: { monthly: 'percent', daily: 'installment_per_day_of_month' },
      min_installment_by_frequency: { daily: '50.00' },
      amount_tiers: [{ up_to_amount: '100000.00', max_months: 10 }],
    });
  });
});

describe('P03 settings page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(settingsApi, 'get').mockResolvedValue(settings);
    vi.spyOn(settingsApi, 'policies').mockResolvedValue([policy]);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'shows every tab in %s and saves only what changed',
    async (lang) => {
      const update = vi
        .spyOn(settingsApi, 'update')
        .mockResolvedValue({ ...settings, address: 'Cairo', updated_at: '2026-10-07T10:00:00Z' });
      await renderApp(<SettingsPage />, { lang });
      const u = userEvent.setup();
      for (const tab of ['general', 'receipt', 'tax', 'sales', 'installments', 'credit', 'legal'])
        expect(
          screen.getByRole('tab', { name: t(`settings.tabs.${tab}` as never) }),
        ).toBeInTheDocument();
      const address = await screen.findByLabelText(t('settings.general.address'));
      await u.type(address, 'Cairo');
      await u.click(screen.getByRole('button', { name: t('settings.save') }));
      expect(update).toHaveBeenCalledWith({ address: 'Cairo' });
      expect(await screen.findByText(t('settings.saved'))).toBeInTheDocument();
    },
  );

  it('shows a translated message when the server refuses a value', async () => {
    vi.spyOn(settingsApi, 'update').mockRejectedValue(
      new ApiError(400, 'SETTINGS_INVALID', 'Settings invalid.'),
    );
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.inventory') }));
    const field = await screen.findByLabelText(t('settings.inventory.globalMinStock'));
    await u.clear(field);
    await u.type(field, '5');
    await u.click(screen.getByRole('button', { name: t('settings.save') }));
    expect(await screen.findByText(t('settings.errors.SETTINGS_INVALID'))).toBeInTheDocument();
  });

  it('publishes a new policy version from the installments tab', async () => {
    const publish = vi
      .spyOn(settingsApi, 'publishPolicy')
      .mockResolvedValue({ ...policy, id: 'a0300000-0000-4000-8000-000000000002', version: 2 });
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.installments') }));
    await u.click(
      await screen.findByRole('checkbox', { name: t('settings.policy.frequency.daily') }),
    );
    await u.selectOptions(
      screen.getByLabelText(
        t('settings.policy.downPaymentRule', { frequency: t('settings.policy.frequency.daily') }),
      ),
      'installment_per_day_of_month',
    );
    await u.click(screen.getByRole('button', { name: t('settings.policy.publish') }));
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_frequencies: ['monthly', 'daily'],
        down_payment_rules: { monthly: 'percent', daily: 'installment_per_day_of_month' },
      }),
    );
    expect(
      await screen.findByText(t('settings.policy.published', { version: 2 })),
    ).toBeInTheDocument();
  });
});
