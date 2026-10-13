import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EtaEnvironment,
  EtaSettingsBody,
  type EtaSettings,
  type EtaTestResult,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import { notify } from '@/components/ui/notify';
import { etaErrorText } from '@/features/eta/etaErrors';
import { etaApi, etaKeys } from '@/services/etaApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

type EtaForm = {
  environment: EtaEnvironment;
  client_id: string;
  /** Write-only: never filled from the server. */
  client_secret: string;
  activity_code: string;
  is_enabled: boolean;
};

const formOf = (settings: EtaSettings | undefined): EtaForm => ({
  environment: settings?.environment ?? 'preprod',
  client_id: settings?.client_id ?? '',
  client_secret: '',
  activity_code: settings?.activity_code ?? '',
  is_enabled: settings?.is_enabled ?? false,
});

/**
 * T02 (D67): Settings → ETA. The shop's connection to the tax authority: which ETA system, the
 * client ID and secret, the activity code, on or off, and a connection test with one POS. The
 * secret is write-only: the page shows only whether one is saved.
 */
export default function EtaSettingsPage() {
  const org = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const settings = useQuery({ queryKey: etaKeys.settings(org), queryFn: etaApi.settings });
  const devices = useQuery({ queryKey: etaKeys.devices(org), queryFn: etaApi.devices });
  const [form, setForm] = useState<EtaForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EtaTestResult | null>(null);
  const [testError, setTestError] = useState('');

  const values = form ?? formOf(settings.data);
  const set = <K extends keyof EtaForm>(key: K, value: EtaForm[K]) =>
    setForm((current) => ({ ...(current ?? values), [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = EtaSettingsBody.safeParse({
      environment: values.environment,
      client_id: values.client_id || null,
      activity_code: values.activity_code || null,
      is_enabled: values.is_enabled,
      ...(values.client_secret ? { client_secret: values.client_secret } : {}),
    });
    if (!parsed.success) {
      setError(t('eta.validation'));
      return;
    }
    setSaving(true);
    try {
      const saved = await etaApi.saveSettings(parsed.data);
      cache.setQueryData(etaKeys.settings(org), saved);
      setForm(null); // the typed secret leaves the page with the save
      notify.success(t('eta.saved'));
    } catch (e) {
      setError(etaErrorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!deviceId) return;
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      setTestResult(await etaApi.test(deviceId));
    } catch (e) {
      setTestError(etaErrorText(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t('eta.title')} description={t('eta.description')} />
      {settings.isLoading ? (
        <p role="status">…</p>
      ) : settings.isError ? (
        <p role="alert">{t('errors.unknown')}</p>
      ) : (
        <div className="max-w-3xl space-y-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <Select
              label={t('eta.environment')}
              value={values.environment}
              options={EtaEnvironment.options.map((value) => ({
                value,
                label: t(`eta.environments.${value}`),
              }))}
              onChange={(e) => set('environment', EtaEnvironment.parse(e.target.value))}
            />
            {values.environment === 'prod' && (
              <div role="alert" className="rounded-control border border-ochre-500 p-3">
                {t('eta.prodWarning')}
              </div>
            )}
            <FormField
              label={t('eta.clientId')}
              value={values.client_id}
              maxLength={100}
              ltr
              autoComplete="off"
              onChange={(e) => set('client_id', e.target.value)}
            />
            <div className="space-y-1">
              <FormField
                label={t('eta.clientSecret')}
                type="password"
                value={values.client_secret}
                maxLength={100}
                autoComplete="new-password"
                help={t('eta.clientSecretHelp')}
                onChange={(e) => set('client_secret', e.target.value)}
              />
              <Badge tone={settings.data?.has_client_secret ? 'success' : 'neutral'}>
                {t(settings.data?.has_client_secret ? 'eta.secretSaved' : 'eta.secretMissing')}
              </Badge>
            </div>
            <FormField
              label={t('eta.activityCode')}
              value={values.activity_code}
              maxLength={10}
              ltr
              help={t('eta.activityCodeHelp')}
              onChange={(e) => set('activity_code', e.target.value)}
            />
            <Switch
              label={t('eta.enabled')}
              description={t('eta.enabledHelp')}
              checked={values.is_enabled}
              onChange={(e) => set('is_enabled', e.target.checked)}
            />
            <FormError message={error} />
            <Button type="submit" loading={saving}>
              {t('eta.save')}
            </Button>
          </form>

          <Card title={t('eta.test.title')} description={t('eta.test.description')}>
            <div className="space-y-3">
              {devices.data && devices.data.length === 0 ? (
                <p className="type-caption">{t('eta.test.noDevices')}</p>
              ) : (
                <Select
                  label={t('eta.test.device')}
                  value={deviceId}
                  placeholder={t('eta.test.chooseDevice')}
                  options={(devices.data ?? []).map((device) => ({
                    value: device.id,
                    label: `${device.name} · ${device.branch_name}`,
                  }))}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    setTestResult(null);
                    setTestError('');
                  }}
                />
              )}
              {testResult && (
                <Notice tone={testResult.ok ? 'success' : 'error'}>
                  {testResult.ok
                    ? t('eta.test.ok')
                    : t('eta.test.failed', { reason: testResult.message ?? '' })}
                </Notice>
              )}
              <FormError message={testError} />
              <Button
                variant="secondary"
                loading={testing}
                disabled={!deviceId}
                onClick={() => void test()}
              >
                {t('eta.test.run')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
