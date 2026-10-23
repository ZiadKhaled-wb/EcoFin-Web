import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { OFFLINE_PIN } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import { t } from '@/i18n';
import { setPin, unlockWithPin } from '@/offline/device';
import { useOfflineStore } from '@/offline/store';

/**
 * D14.1: online, with a lease of this shift, the cashier sets the PIN that opens the POS offline.
 * The PIN is stored only as a PBKDF2 hash on this device.
 */
export function SetPinCard({ shiftId }: { shiftId: string }) {
  const db = useOfflineStore((s) => s.db);
  const [pin, setPinValue] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!db) return;
    if (!OFFLINE_PIN.pattern.test(pin)) return setError(t('offline.lock.invalid'));
    if (pin !== again) return setError(t('offline.lock.mismatch'));
    setBusy(true);
    try {
      await setPin(db, shiftId, pin);
      await useOfflineStore.getState().reload();
      useOfflineStore.getState().set({ unlocked: true });
    } catch {
      setError(t('offline.errors.failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <form className="space-y-3" onSubmit={(e) => void submit(e)} data-testid="offline-set-pin">
        <h2 className="type-section-title">{t('offline.lock.setTitle')}</h2>
        <p className="type-caption">{t('offline.lock.setDescription')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={t('offline.lock.pin')}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPinValue(e.target.value)}
          />
          <FormField
            label={t('offline.lock.confirm')}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy}>
          {t('offline.lock.set')}
        </Button>
      </form>
    </Card>
  );
}

/** D14.2, D14.3: offline, the POS opens with the PIN; five wrong ones lock it until a login. */
export default function OfflineLock() {
  const db = useOfflineStore((s) => s.db);
  const locked = useOfflineStore((s) => s.pinLocked);
  const [pin, setPinValue] = useState('');
  const [wrong, setWrong] = useState(0);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!db || busy) return;
    setBusy(true);
    try {
      const result = await unlockWithPin(db, pin);
      setPinValue('');
      if (result === 'ok') {
        setWrong(0);
        useOfflineStore.getState().set({ unlocked: true });
      } else if (result === 'wrong') {
        setWrong((n) => n + 1);
      }
      await useOfflineStore.getState().reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <form
        className="mx-auto max-w-sm space-y-3"
        onSubmit={(e) => void submit(e)}
        data-testid="offline-lock"
      >
        <h2 className="type-section-title">{t('offline.lock.title')}</h2>
        <p className="type-caption">{t('offline.lock.description')}</p>
        {locked ? (
          <>
            <Notice tone="error">{t('offline.lock.locked')}</Notice>
            <Link className="btn btn-secondary" to="/login">
              {t('offline.lock.login')}
            </Link>
          </>
        ) : (
          <>
            <FormField
              label={t('offline.lock.pin')}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
            />
            {wrong > 0 && (
              <Notice tone="error">
                {t('offline.lock.wrong', { left: Math.max(0, OFFLINE_PIN.maxTries - wrong) })}
              </Notice>
            )}
            <Button type="submit" loading={busy} disabled={pin.length < 4}>
              {t('offline.lock.unlock')}
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}
