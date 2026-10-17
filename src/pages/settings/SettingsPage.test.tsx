import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallmentPolicy, ShopSettings } from '@ziadkhaled-wb/contracts';
import { settingsApi } from '@/services/settingsApi';
import { taxClassesApi } from '@/services/taxClassesApi';
import { ApiError } from '@/lib/api';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { meApi } from '@/features/me/meApi';
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
  guarantors_required_count: 1,
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
  installment_markup_vat: 'not_taxed',
  delivery_fee_tax_class_id: null,
  deposit_vat_timing: 'on_delivery',
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

  it('sends how many guarantors a contract needs, only once an amount is set', async () => {
    const publish = vi
      .spyOn(settingsApi, 'publishPolicy')
      .mockResolvedValue({ ...policy, id: 'a0300000-0000-4000-8000-000000000003', version: 3 });
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.installments') }));
    const count = await screen.findByLabelText(t('settings.policy.guarantorsCount'));
    expect(count).toBeDisabled();
    expect(count).toHaveValue('1');
    await u.type(screen.getByLabelText(t('settings.policy.guarantorAbove')), '10000');
    expect(count).toBeEnabled();
    await u.clear(count);
    await u.type(count, '2');
    await u.click(screen.getByRole('button', { name: t('settings.policy.publish') }));
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        guarantor_required_above: '10000.00',
        guarantors_required_count: 2,
      }),
    );
  });

  it('has no late-fee fields and never sends one (N04, Islamic finance rule 4)', async () => {
    const publish = vi
      .spyOn(settingsApi, 'publishPolicy')
      .mockResolvedValue({ ...policy, id: 'a0300000-0000-4000-8000-000000000004', version: 4 });
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.installments') }));
    expect(await screen.findByText(t('settings.policy.noLateFees'))).toBeInTheDocument();
    expect(screen.queryByLabelText(/late fee/i)).not.toBeInTheDocument();
    const grace = screen.getByLabelText(t('settings.policy.graceDays'));
    await u.clear(grace);
    await u.type(grace, '3');
    await u.click(screen.getByRole('button', { name: t('settings.policy.publish') }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ grace_days: 3 }));
    const body = publish.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(body).filter((k) => k.startsWith('late_fee'))).toEqual([]);
  });

  it('refuses a guarantor count outside 1-3 without calling the API', async () => {
    const publish = vi.spyOn(settingsApi, 'publishPolicy');
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.installments') }));
    await u.type(await screen.findByLabelText(t('settings.policy.guarantorAbove')), '10000');
    const count = screen.getByLabelText(t('settings.policy.guarantorsCount'));
    await u.clear(count);
    await u.type(count, '4');
    await u.click(screen.getByRole('button', { name: t('settings.policy.publish') }));
    expect(await screen.findByText(t('settings.errors.validation'))).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
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

describe('T01 tax tab', () => {
  const standard = {
    id: 'a0400000-0000-4000-8000-000000000001',
    name: 'VAT 14%',
    kind: 'standard' as const,
    rate: '14.00',
    eta_tax_type: 'T1',
    eta_subtype: 'V009',
    archived_at: null,
    updated_at: '2026-10-07T09:00:00Z',
  };
  beforeEach(() => {
    signIn();
    vi.spyOn(settingsApi, 'get').mockResolvedValue({
      ...settings,
      default_tax_class_id: standard.id,
      delivery_fee_tax_class_id: standard.id,
      tax_class_options: [
        { id: standard.id, name: standard.name, kind: 'standard', rate: '14.00' },
      ],
    });
    vi.spyOn(taxClassesApi, 'list').mockResolvedValue([standard]);
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['catalog.manage', 'org.settings_manage']),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('saves only the accountant setting that changed', async () => {
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue({
      ...settings,
      installment_markup_vat: 'taxed',
      updated_at: '2026-10-07T10:00:00Z',
    });
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.tax') }));
    await u.click(await screen.findByLabelText(t('settings.tax.markupVatOptions.taxed')));
    await u.click(screen.getByRole('button', { name: t('settings.save') }));
    expect(update).toHaveBeenCalledWith({ installment_markup_vat: 'taxed' });
  });

  it('lists the classes and adds one; zero-rated classes get 0%', async () => {
    const create = vi.spyOn(taxClassesApi, 'create').mockResolvedValue({
      ...standard,
      id: 'a0400000-0000-4000-8000-000000000002',
      name: 'Exports',
      kind: 'zero',
      rate: '0.00',
    });
    await renderApp(<SettingsPage />, { lang: 'ar' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.tax') }));
    expect(await screen.findByText('VAT 14%')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: t('settings.taxClasses.add') }));
    await u.type(screen.getByLabelText(t('settings.taxClasses.name')), 'Exports');
    await u.selectOptions(screen.getByLabelText(t('settings.taxClasses.kind')), 'zero');
    await u.clear(screen.getByLabelText(t('settings.taxClasses.etaSubtype')));
    await u.type(screen.getByLabelText(t('settings.taxClasses.etaSubtype')), 'V001');
    await u.click(screen.getByRole('button', { name: t('settings.taxClasses.save') }));
    expect(create).toHaveBeenCalledWith({
      name: 'Exports',
      kind: 'zero',
      rate: '0',
      eta_tax_type: 'T1',
      eta_subtype: 'V001',
    });
  });

  it('explains why a class in use cannot be archived', async () => {
    vi.spyOn(taxClassesApi, 'archive').mockRejectedValue(
      new ApiError(409, 'TAX_CLASS_IN_USE', 'Tax class in use.'),
    );
    await renderApp(<SettingsPage />, { lang: 'en' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: t('settings.tabs.tax') }));
    await u.click(await screen.findByRole('button', { name: t('settings.taxClasses.archive') }));
    expect(await screen.findByText(t('settings.taxClasses.inUse'))).toBeInTheDocument();
  });
});
