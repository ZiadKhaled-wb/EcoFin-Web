import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShopProfileUpdateBody } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Switch from '@/components/ui/Switch';
import Button from '@/components/ui/Button';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { shopProfileApi } from '@/services/shopProfileApi';

const queryKey = (org: string | null) => ['shop-profile', org] as const;
const empty = {
  legal_name: '',
  commercial_register: '',
  tax_registration_no: '',
  consumer_finance_legal_status: '',
  installments_enabled: true,
};
type ProfileForm = typeof empty;

export default function ShopProfilePage() {
  const org = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const profile = useQuery({ queryKey: queryKey(org), queryFn: shopProfileApi.get });
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const values =
    form ??
    (profile.data
      ? {
          legal_name: profile.data.legal_name ?? '',
          commercial_register: profile.data.commercial_register ?? '',
          tax_registration_no: profile.data.tax_registration_no ?? '',
          consumer_finance_legal_status: profile.data.consumer_finance_legal_status ?? '',
          installments_enabled: profile.data.installments_enabled,
        }
      : empty);
  const set = (key: keyof ProfileForm, value: string | boolean) =>
    setForm((current) => ({ ...(current ?? values), [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body: ShopProfileUpdateBody = {
        legal_name: values.legal_name || null,
        commercial_register: values.commercial_register || null,
        tax_registration_no: values.tax_registration_no || null,
        consumer_finance_legal_status: values.consumer_finance_legal_status || null,
        installments_enabled: values.installments_enabled,
      };
      await shopProfileApi.update(body);
      await cache.invalidateQueries({ queryKey: queryKey(org) });
      notify.success(t('settings.profile.saved'));
    } catch (e) {
      setError(
        e instanceof ApiError ? t(`settings.errors.${e.code}` as never) : t('errors.unknown'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('settings.profile.title')}
        description={t('settings.profile.description')}
      />
      {profile.isLoading ? (
        <p role="status">…</p>
      ) : profile.isError ? (
        <p role="alert">{t('errors.unknown')}</p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="max-w-3xl space-y-5">
          <label className="block space-y-1">
            <span className="type-body">{t('settings.profile.legalName')}</span>
            <input
              className="input"
              maxLength={200}
              value={values.legal_name}
              onChange={(e) => set('legal_name', e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="type-body">{t('settings.profile.commercialRegister')}</span>
            <input
              className="input"
              maxLength={50}
              value={values.commercial_register}
              onChange={(e) => set('commercial_register', e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="type-body">{t('settings.profile.taxRegistration')}</span>
            <input
              className="input"
              maxLength={50}
              value={values.tax_registration_no}
              onChange={(e) => set('tax_registration_no', e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="type-body">{t('settings.profile.consumerStatus')}</span>
            <textarea
              className="input min-h-24"
              maxLength={500}
              value={values.consumer_finance_legal_status}
              onChange={(e) => set('consumer_finance_legal_status', e.target.value)}
            />
            <span className="type-caption block">{t('settings.profile.consumerStatusHelp')}</span>
          </label>
          <label className="block space-y-1">
            <span className="type-body">{t('settings.profile.financingModel')}</span>
            <input className="input" readOnly value={t('settings.profile.inHouse')} />
          </label>
          <Switch
            label={t('settings.profile.installments')}
            description={t('settings.profile.installmentsHelp')}
            checked={values.installments_enabled}
            onChange={(e) => set('installments_enabled', e.target.checked)}
          />
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={saving}>
            {t('settings.profile.save')}
          </Button>
        </form>
      )}
    </PageContainer>
  );
}
