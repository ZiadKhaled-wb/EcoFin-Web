import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OfflineSettingsBody, type OfflineSettings } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import Switch from '@/components/ui/Switch';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { offlineApi, offlineKeys } from '@/services/offlineApi';
import { useAuthStore } from '@/store/authStore';
import { offlineError } from '@/pages/sales/offline/offlineShared';

/** S08 (§5.8, D16): Settings → POS offline. The bounds are shown in the labels and checked by the database. */
export default function OfflineSettingsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const settings = useQuery({
    queryKey: offlineKeys.settings(orgId),
    queryFn: offlineApi.settings,
  });
  return (
    <PageContainer>
      <PageHeader
        title={t('offline.settings.title')}
        description={t('offline.settings.description')}
      />
      {settings.isPending ? (
        <LoadingState />
      ) : settings.isError ? (
        <ErrorState onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </PageContainer>
  );
}

function SettingsForm({ initial }: { initial: OfflineSettings }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [enabled, setEnabled] = useState(initial.offline_enabled);
  const [maxSale, setMaxSale] = useState(initial.offline_max_sale_total);
  const [maxHours, setMaxHours] = useState(String(initial.offline_max_hours));
  const [maxSales, setMaxSales] = useState(String(initial.offline_max_sales));
  const [maxLease, setMaxLease] = useState(initial.offline_max_lease_total);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    const body = OfflineSettingsBody.safeParse({
      offline_enabled: enabled,
      offline_max_sale_total: maxSale,
      offline_max_hours: Number(maxHours),
      offline_max_sales: Number(maxSales),
      offline_max_lease_total: maxLease,
    });
    if (!body.success) return setError(t('offline.errors.VALIDATION_FAILED'));
    setBusy(true);
    try {
      const saved = await offlineApi.saveSettings(body.data);
      cache.setQueryData(offlineKeys.settings(orgId), saved);
      notify.success(t('offline.settings.saved'));
    } catch (err) {
      setError(offlineError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <div className="space-y-4" data-testid="offline-settings">
        <Switch
          label={t('offline.settings.enabled')}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <MoneyInput
          label={t('offline.settings.maxSale')}
          value={maxSale}
          onValueChange={setMaxSale}
        />
        <NumberInput
          label={t('offline.settings.maxHours')}
          value={maxHours}
          onValueChange={setMaxHours}
        />
        <NumberInput
          label={t('offline.settings.maxSales')}
          value={maxSales}
          onValueChange={setMaxSales}
        />
        <MoneyInput
          label={t('offline.settings.maxLeaseTotal')}
          value={maxLease}
          onValueChange={setMaxLease}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button loading={busy} onClick={() => void save()}>
          {t('offline.settings.save')}
        </Button>
      </div>
    </Card>
  );
}
