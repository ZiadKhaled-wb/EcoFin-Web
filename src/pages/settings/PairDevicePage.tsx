import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  PAIRING_CODE_LENGTH,
  isPairingCode,
  normalizePairingCode,
  type CurrentDevice,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import { deviceErrorText } from '@/features/devices/deviceErrors';
import { setDeviceToken } from '@/features/devices/deviceToken';
import { useCurrentDevice } from '@/features/devices/useCurrentDevice';
import { deviceKeys, devicesApi } from '@/services/devicesApi';
import { useAuthStore } from '@/store/authStore';
import OfflineDevicePanel from '@/pages/sales/offline/OfflineDevicePanel';
import { t } from '@/i18n';

/**
 * O03 (D69): /device/pair. An employee types the code from the owner's devices page; the
 * answer's device token is stored for this shop and this browser is that POS device from then
 * on. The token is never shown.
 */
export default function PairDevicePage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const { device } = useCurrentDevice();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState<CurrentDevice | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!orgId) return;
    setError('');
    setPaired(null);
    const typed = normalizePairingCode(code);
    if (!isPairingCode(typed)) {
      setError(t('devices.errors.PAIRING_CODE_INVALID'));
      return;
    }
    setBusy(true);
    try {
      const answer = await devicesApi.pair(typed);
      setDeviceToken(orgId, answer.device_token);
      cache.setQueryData(deviceKeys.current(orgId, answer.device_token), answer.device);
      setPaired(answer.device);
      setCode('');
    } catch (e) {
      setError(deviceErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = paired ?? device;
  return (
    <PageContainer>
      <PageHeader title={t('devices.pair.title')} description={t('devices.pair.description')} />
      <Card className="max-w-xl">
        <div className="space-y-4">
          {paired ? (
            <p role="status" className="type-section-title">
              {t('devices.pair.success', { name: paired.name, branch: paired.branch_name })}
            </p>
          ) : (
            shown && (
              <p className="type-body">
                {t('devices.pair.current', { name: shown.name, branch: shown.branch_name })}{' '}
                {t('devices.pair.again')}
              </p>
            )
          )}
          <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
            <FormField
              label={t('devices.pair.code')}
              help={t('devices.pair.codeHelp')}
              value={code}
              // Room for the dash and spaces people type between the two halves.
              maxLength={PAIRING_CODE_LENGTH + 4}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              ltr
              className="font-mono uppercase tracking-widest"
              onChange={(e) => setCode(e.target.value)}
            />
            <FormError message={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} disabled={code.trim() === ''}>
                {t('devices.pair.submit')}
              </Button>
              {shown && (
                <Link to="/accounting/shifts" className="btn btn-secondary">
                  {t('devices.pair.toShift')}
                </Link>
              )}
            </div>
          </form>
        </div>
      </Card>
      <div className="mt-4">
        <OfflineDevicePanel />
      </div>
    </PageContainer>
  );
}
