// P03 shop settings. Refactored from FinTech-Pro's SettingsPage: same idea of one tabbed page,
// but every string is translated, the page is behind org.settings_manage instead of role names,
// each tab saves only what it changed, and the installment policy is versioned. FinTech-Pro's
// "advanced" tab (clear cache, system log) is gone: the audit screen covers the log.
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  CREDIT_SCORE_FACTORS,
  DISCOUNT_CAP_ROLES,
  INSTALLMENT_FREQUENCIES,
  RECEIPT_FIELDS,
  type ShopSettings,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import OnboardingReturnLink from '@/components/layout/OnboardingReturnLink';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import NumberInput from '@/components/ui/NumberInput';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Checkbox from '@/components/ui/Checkbox';
import Switch from '@/components/ui/Switch';
import RadioGroup from '@/components/ui/RadioGroup';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import { notify } from '@/components/ui/notify';
import { settingsApi } from '@/services/settingsApi';
import { settingsKeys } from '@/features/settings/useSettings';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import InstallmentPolicyTab from './InstallmentPolicyTab';
import ContractTermsSettings from '@/features/contractDocuments/ContractTermsSettings';
import TaxClassesSection from './TaxClassesSection';
import {
  SETTINGS_TABS,
  settingsError,
  tabChanges,
  toForm,
  weightsTotal,
  type FieldTab,
  type SettingsForm,
  type SettingsTab,
} from './settingsForm';

const TIMEZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC'];
export default function SettingsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({ queryKey: settingsKeys.settings(orgId), queryFn: settingsApi.get });
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const requested = searchParams.get('tab') as SettingsTab | null;
    return requested && SETTINGS_TABS.includes(requested) ? requested : 'general';
  });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKey(event: KeyboardEvent, index: number) {
    const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    const step = event.key === forward ? 1 : -1;
    const next = SETTINGS_TABS[(index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <PageContainer>
      <OnboardingReturnLink />
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <div
        role="tablist"
        aria-label={t('settings.title')}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {SETTINGS_TABS.map((id, index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            id={`settings-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`settings-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, index)}
            className={cn(
              'type-body min-h-11 shrink-0 border-b-2 px-4 whitespace-nowrap transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-mute hover:text-ink',
            )}
          >
            {t(`settings.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : tab === 'installments' ? (
          <div className="space-y-6">
            <InstallmentPolicyTab
              key={query.data.installment_policy?.id ?? 'none'}
              current={query.data.installment_policy}
            />
            {/* N07 (D82): promissory notes mode and the terms printed on the contract. */}
            <ContractTermsSettings key={query.data.updated_at} saved={query.data} />
          </div>
        ) : (
          // Remounts with fresh inputs after a save (updated_at changes).
          <div className="space-y-6">
            <FieldsTab key={`${tab}-${query.data.updated_at}`} tab={tab} saved={query.data} />
            {tab === 'tax' && <TaxClassesSection />}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

/** One tab of plain settings: edits a copy, saves only the changed fields. */
function FieldsTab({ tab, saved }: { tab: FieldTab; saved: ShopSettings }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(() => toForm(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const changes = tabChanges(tab, form, saved);
    if (!changes.ok) {
      setError(t(`settings.errors.${changes.reason}`));
      return;
    }
    if (!changes.body) {
      notify.info(t('settings.nothingChanged'));
      return;
    }
    setBusy(true);
    try {
      const next = await settingsApi.update(changes.body);
      cache.setQueryData(settingsKeys.settings(orgId), next);
      notify.success(t('settings.saved'));
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} noValidate>
      <Card title={t(`settings.tabs.${tab}`)}>
        <div className="space-y-4">
          {tab === 'general' && <GeneralFields form={form} set={set} />}
          {tab === 'receipt' && <ReceiptFieldsTab form={form} set={set} />}
          {tab === 'tax' && <TaxFields form={form} set={set} saved={saved} />}
          {tab === 'sales' && <SalesFields form={form} set={set} />}
          {tab === 'credit' && <CreditFields form={form} set={set} />}
          {tab === 'legal' && <LegalFields form={form} set={set} />}
          {tab === 'inventory' && (
            <NumberInput
              label={t('settings.inventory.globalMinStock')}
              help={t('settings.inventory.globalMinStockHelp')}
              decimals={0}
              value={form.global_min_stock}
              onValueChange={(v) => set('global_min_stock', v)}
            />
          )}
          <FormError message={error} />
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit" disabled={busy}>
              {t('settings.save')}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

type FieldProps = {
  form: SettingsForm;
  set: <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => void;
};

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
);

function GeneralFields({ form, set }: FieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const logo = useQuery({
    queryKey: ['settings-logo', form.logo_file_id],
    queryFn: () => settingsApi.logoUrl(form.logo_file_id!),
    enabled: !!form.logo_file_id,
    staleTime: 30_000,
  });
  const zones = TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES];

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const saved = await settingsApi.uploadLogo(file);
      set('logo_file_id', saved.id);
      notify.info(t('settings.general.logoUploaded'));
    } catch (e) {
      setUploadError(settingsError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <Grid>
        <FormField
          label={t('settings.general.name')}
          value={form.name}
          maxLength={100}
          required
          onChange={(e) => set('name', e.target.value)}
        />
        <FormField
          label={t('settings.general.phone')}
          value={form.phone}
          maxLength={30}
          ltr
          onChange={(e) => set('phone', e.target.value)}
        />
        <FormField
          label={t('settings.general.address')}
          value={form.address}
          maxLength={300}
          onChange={(e) => set('address', e.target.value)}
        />
        <Select
          label={t('settings.general.timezone')}
          value={form.timezone}
          options={zones.map((z) => ({ value: z, label: z }))}
          onChange={(e) => set('timezone', e.target.value)}
        />
        <Select
          label={t('settings.general.language')}
          value={form.default_language}
          options={(['ar', 'en'] as const).map((l) => ({
            value: l,
            label: t(`settings.general.languages.${l}`),
          }))}
          onChange={(e) => set('default_language', e.target.value as 'ar' | 'en')}
        />
        <FormField
          label={t('settings.general.themeColor')}
          help={t('settings.general.themeColorHelp')}
          value={form.theme_color}
          maxLength={7}
          ltr
          onChange={(e) => set('theme_color', e.target.value)}
        />
        <FormField
          label={t('settings.general.currency')}
          help={t('settings.general.currencyHelp')}
          value={t('common.currency')}
          readOnly
        />
      </Grid>
      <div className="space-y-2">
        <p className="type-label">{t('settings.general.logo')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {form.logo_file_id && logo.data ? (
            <img
              src={logo.data.url}
              alt={t('settings.general.logo')}
              className="h-16 w-16 rounded-control border border-line object-contain"
            />
          ) : (
            <span className="type-caption">
              {t(form.logo_file_id ? 'settings.general.logoSet' : 'settings.general.logoNone')}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t('settings.general.uploadLogo')}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {t('settings.general.uploadLogo')}
          </Button>
          {form.logo_file_id && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set('logo_file_id', null)}
            >
              {t('settings.general.removeLogo')}
            </Button>
          )}
        </div>
        <FormError message={uploadError} />
      </div>
    </>
  );
}

function ReceiptFieldsTab({ form, set }: FieldProps) {
  return (
    <>
      <Grid>
        <Textarea
          label={t('settings.receipt.header')}
          value={form.receipt_header}
          maxLength={500}
          rows={3}
          onChange={(e) => set('receipt_header', e.target.value)}
        />
        <Textarea
          label={t('settings.receipt.footer')}
          value={form.receipt_footer}
          maxLength={500}
          rows={3}
          onChange={(e) => set('receipt_footer', e.target.value)}
        />
      </Grid>
      <RadioGroup
        label={t('settings.receipt.width')}
        name="receipt-width"
        orientation="horizontal"
        value={form.receipt_width_mm}
        options={[
          { value: '58', label: t('settings.receipt.width58') },
          { value: '80', label: t('settings.receipt.width80') },
        ]}
        onChange={(v) => set('receipt_width_mm', v === '58' ? '58' : '80')}
      />
      <fieldset>
        <legend className="type-label mb-1">{t('settings.receipt.fields')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {RECEIPT_FIELDS.map((field) => (
            <Checkbox
              key={field}
              label={t(`settings.receipt.fieldNames.${field}`)}
              checked={form.receipt_fields[field]}
              onChange={(e) =>
                set('receipt_fields', { ...form.receipt_fields, [field]: e.target.checked })
              }
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}

function TaxFields({ form, set, saved }: FieldProps & { saved: ShopSettings }) {
  return (
    <>
      <Switch
        label={t('settings.tax.pricesIncludeVat')}
        description={t('settings.tax.pricesIncludeVatHelp')}
        checked={form.prices_include_vat}
        onChange={(e) => set('prices_include_vat', e.target.checked)}
      />
      <Select
        label={t('settings.tax.defaultTaxClass')}
        value={form.default_tax_class_id}
        placeholder={t('settings.tax.none')}
        help={saved.tax_class_options.length === 0 ? t('settings.tax.noTaxClasses') : undefined}
        options={saved.tax_class_options.map((c) => ({
          value: c.id,
          label: `${c.name} (⁦${Number(c.rate)}%⁩)`,
        }))}
        onChange={(e) => set('default_tax_class_id', e.target.value)}
      />
      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="type-label">{t('settings.tax.accountant')}</legend>
        <p className="type-caption">{t('settings.tax.accountantHelp')}</p>
        <RadioGroup
          label={t('settings.tax.markupVat')}
          name="markup-vat"
          orientation="horizontal"
          value={form.installment_markup_vat}
          options={(['not_taxed', 'taxed'] as const).map((v) => ({
            value: v,
            label: t(`settings.tax.markupVatOptions.${v}`),
          }))}
          onChange={(v) => set('installment_markup_vat', v === 'taxed' ? 'taxed' : 'not_taxed')}
        />
        <Select
          label={t('settings.tax.deliveryFeeClass')}
          value={form.delivery_fee_tax_class_id}
          placeholder={t('settings.tax.none')}
          options={saved.tax_class_options.map((c) => ({
            value: c.id,
            label: `${c.name} (⁦${Number(c.rate)}%⁩)`,
          }))}
          onChange={(e) => set('delivery_fee_tax_class_id', e.target.value)}
        />
        <RadioGroup
          label={t('settings.tax.depositTiming')}
          name="deposit-timing"
          orientation="horizontal"
          value={form.deposit_vat_timing}
          options={(['on_delivery', 'on_deposit'] as const).map((v) => ({
            value: v,
            label: t(`settings.tax.depositTimingOptions.${v}`),
          }))}
          onChange={(v) =>
            set('deposit_vat_timing', v === 'on_deposit' ? 'on_deposit' : 'on_delivery')
          }
        />
      </fieldset>
    </>
  );
}

function SalesFields({ form, set }: FieldProps) {
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="type-label">{t('settings.sales.discountCaps')}</legend>
        <p className="type-caption">{t('settings.sales.discountCapsHelp')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DISCOUNT_CAP_ROLES.map((role) => (
            <NumberInput
              key={role}
              label={t(`settings.sales.roles.${role}`)}
              decimals={2}
              suffix="%"
              value={form.discount_caps[role]}
              onValueChange={(v) => set('discount_caps', { ...form.discount_caps, [role]: v })}
            />
          ))}
        </div>
      </fieldset>
      <Grid>
        <NumberInput
          label={t('settings.sales.returnDays')}
          decimals={0}
          value={form.return_policy_days}
          onValueChange={(v) => set('return_policy_days', v)}
        />
        <MoneyInput
          label={t('settings.sales.purchaseThreshold')}
          help={t('settings.sales.purchaseThresholdHelp')}
          value={form.purchase_approval_threshold}
          onValueChange={(v) => set('purchase_approval_threshold', v)}
        />
      </Grid>
      <Switch
        label={t('settings.sales.allowNegativeBank')}
        description={t('settings.sales.allowNegativeBankHelp')}
        checked={form.allow_negative_bank}
        onChange={(e) => set('allow_negative_bank', e.target.checked)}
      />
    </>
  );
}

function CreditFields({ form, set }: FieldProps) {
  const total = weightsTotal(form);
  return (
    <>
      <Grid>
        <NumberInput
          label={t('settings.credit.minScore')}
          help={t('settings.credit.minScoreHelp')}
          decimals={0}
          value={form.credit_min_score}
          onValueChange={(v) => set('credit_min_score', v)}
        />
        <NumberInput
          label={t('settings.credit.limitMultiple')}
          help={t('settings.credit.limitMultipleHelp')}
          decimals={2}
          value={form.credit_limit_income_multiple}
          onValueChange={(v) => set('credit_limit_income_multiple', v)}
        />
      </Grid>
      <fieldset className="space-y-2">
        <legend className="type-label">{t('settings.credit.weights')}</legend>
        <p className="type-caption">{t('settings.credit.weightsHelp')}</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CREDIT_SCORE_FACTORS.map((factor) => (
            <NumberInput
              key={factor}
              label={t(`settings.credit.factor.${factor}`)}
              decimals={0}
              value={form.credit_score_weights[factor]}
              onValueChange={(v) =>
                set('credit_score_weights', { ...form.credit_score_weights, [factor]: v })
              }
            />
          ))}
        </div>
        <p className={cn('type-caption', total !== 100 && 'text-danger-600')} aria-live="polite">
          {t('settings.credit.weightsTotal', { total })}
        </p>
      </fieldset>
    </>
  );
}

function LegalFields({ form, set }: FieldProps) {
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="type-label">{t('settings.legal.referralDays')}</legend>
        <p className="type-caption">{t('settings.legal.referralHelp')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {INSTALLMENT_FREQUENCIES.map((f) => (
            <NumberInput
              key={f}
              label={t(`settings.policy.frequency.${f}`)}
              decimals={0}
              value={form.legal_referral_days[f]}
              onValueChange={(v) =>
                set('legal_referral_days', { ...form.legal_referral_days, [f]: v })
              }
            />
          ))}
        </div>
      </fieldset>
      <Grid>
        <NumberInput
          label={t('settings.legal.banDays')}
          decimals={0}
          value={form.customer_ban_days}
          onValueChange={(v) => set('customer_ban_days', v)}
        />
        <NumberInput
          label={t('settings.legal.warningInterval')}
          decimals={0}
          value={form.overdue_warning_interval_days}
          onValueChange={(v) => set('overdue_warning_interval_days', v)}
        />
      </Grid>
    </>
  );
}
