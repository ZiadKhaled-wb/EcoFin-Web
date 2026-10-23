import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Notice from '@/components/ui/Notice';
import { formatDateTime } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';
import { useOfflineStore } from '@/offline/store';
import { exportFileName, exportUnsynced } from '@/offline/sync';
import OfflineLock from './OfflineLock';

const LEASE_ERRORS: Record<string, TranslationKey> = {
  OFFLINE_DISABLED: 'offline.device.leaseErrors.OFFLINE_DISABLED',
  OFFLINE_ETA_NOT_READY: 'offline.device.leaseErrors.OFFLINE_ETA_NOT_READY',
  OFFLINE_NOT_SHIFT_OWNER: 'offline.device.leaseErrors.OFFLINE_NOT_SHIFT_OWNER',
  DEVICE_REVOKED: 'offline.device.leaseErrors.DEVICE_REVOKED',
};

/** Downloads `items` as `name` (D13.1). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * S08 (§5.6): offline selling on this computer: persistent storage, the lease, the key, what
 * waits to sync, and the export of unsynced sales for a manager to import (D13). Offline, the
 * export needs the PIN.
 */
export default function OfflineDevicePanel() {
  const store = useOfflineStore();
  const [error, setError] = useState('');
  const lease = store.lease;
  const offline = store.mode.mode === 'offline';

  async function exportSales() {
    if (!store.db || !lease) return;
    setError('');
    try {
      const items = await exportUnsynced(store.db);
      download(exportFileName(lease.offline_code, new Date()), JSON.stringify(items, null, 2));
    } catch {
      setError(t('offline.errors.failed'));
    }
  }

  if (!store.db) return null;
  return (
    <Card className="max-w-xl">
      <div className="space-y-3" data-testid="offline-device">
        <h2 className="type-section-title">{t('offline.device.title')}</h2>
        <dl className="type-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>{t('offline.device.storage')}</dt>
          <dd data-testid="offline-storage">
            {lease
              ? lease.persisted
                ? t('offline.device.granted')
                : t('offline.device.denied')
              : '—'}
          </dd>
          <dt>{t('offline.device.lease')}</dt>
          <dd>
            {lease
              ? t('offline.device.expires', { time: formatDateTime(lease.lease.expires_at) })
              : t('offline.device.noLease')}
          </dd>
          <dt>{t('offline.device.key')}</dt>
          <dd>{lease ? t('offline.device.keyYes') : t('offline.device.keyNo')}</dd>
          <dt>{t('offline.device.unsynced')}</dt>
          <dd className="num">{store.unsynced}</dd>
          <dt>{t('offline.device.rejected')}</dt>
          <dd className="num">{store.rejected}</dd>
        </dl>
        {store.leaseError && (
          <Notice tone="error">
            {t(LEASE_ERRORS[store.leaseError] ?? 'offline.device.leaseErrors.UNKNOWN')}
          </Notice>
        )}
        {lease && store.unsynced > 0 && (
          <>
            <p className="type-caption">{t('offline.device.exportHelp')}</p>
            {offline && !store.unlocked ? (
              <OfflineLock />
            ) : (
              <Button
                variant="secondary"
                onClick={() => void exportSales()}
                data-testid="offline-export"
              >
                {t('offline.device.export')}
              </Button>
            )}
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Card>
  );
}
