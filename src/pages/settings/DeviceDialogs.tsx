import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DEVICE_NAME_MAX,
  DeviceCreateBody,
  DeviceUpdateBody,
  type Device,
  type DevicePairingCode,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { countdown } from '@/features/devices/countdown';
import { deviceErrorText } from '@/features/devices/deviceErrors';
import { useBranches } from '@/features/me/useBranches';
import { devicesApi } from '@/services/devicesApi';
import { t } from '@/i18n';

interface DialogProps {
  onClose: () => void;
  /** The list changed: read it again. */
  onDone: () => Promise<unknown>;
}

/** Add a device, or (with `device`) rename it and move it to another branch. */
export function DeviceFormDialog({
  device,
  onClose,
  onDone,
}: DialogProps & { device: Device | null }) {
  const branches = useBranches();
  const [name, setName] = useState(device?.name ?? '');
  const [pickedBranch, setPickedBranch] = useState(device?.branch_id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const branchId = pickedBranch || (branches.data ?? [])[0]?.id || '';

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const body = { name, branch_id: branchId };
    const parsed = (device ? DeviceUpdateBody : DeviceCreateBody).safeParse(body);
    if (!parsed.success) {
      setError(t('devices.errors.VALIDATION_FAILED'));
      return;
    }
    setBusy(true);
    try {
      if (device) await devicesApi.update(device.id, DeviceUpdateBody.parse(body));
      else await devicesApi.create(DeviceCreateBody.parse(body));
      await onDone();
      notify.success(t(device ? 'devices.edit.saved' : 'devices.add.saved'));
      onClose();
    } catch (e) {
      setError(deviceErrorText(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={t(device ? 'devices.edit.title' : 'devices.add.title')}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-3" noValidate>
        <FormField
          label={t('devices.add.name')}
          help={t('devices.add.nameHelp')}
          value={name}
          maxLength={DEVICE_NAME_MAX}
          required
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label={t('devices.add.branch')}
          value={branchId}
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          onChange={(e) => setPickedBranch(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" loading={busy}>
          {t(device ? 'devices.edit.save' : 'devices.add.save')}
        </Button>
      </form>
    </Dialog>
  );
}

/** Turning a device off needs a reason; it also unpairs its computer. */
export function DeactivateDeviceDialog({
  device,
  onClose,
  onDone,
}: DialogProps & { device: Device }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    setError('');
    setBusy(true);
    try {
      await devicesApi.setActive(device.id, { active: false, reason: reason.trim() });
      await onDone();
      notify.success(t('devices.deactivate.done'));
      onClose();
    } catch (e) {
      setError(deviceErrorText(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={t('devices.deactivate.title')}
      description={t('devices.deactivate.description', { name: device.name })}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField
          label={t('devices.deactivate.reason')}
          value={reason}
          maxLength={200}
          required
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" variant="danger" loading={busy} disabled={!reason.trim()}>
          {t('devices.deactivate.confirm')}
        </Button>
      </form>
    </Dialog>
  );
}

/** One decision: the computer paired with the device stops being it. */
export function UnpairDeviceDialog({ device, onClose, onDone }: DialogProps & { device: Device }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function unpair() {
    setError('');
    setBusy(true);
    try {
      await devicesApi.unpair(device.id);
      await onDone();
      notify.success(t('devices.unpair.done'));
      onClose();
    } catch (e) {
      setError(deviceErrorText(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={t('devices.unpair.title')}
      description={t('devices.unpair.description', { name: device.name })}
      footer={
        <Button variant="danger" loading={busy} onClick={() => void unpair()}>
          {t('devices.unpair.confirm')}
        </Button>
      }
    >
      <FormError message={error} />
    </Dialog>
  );
}

/**
 * The pairing code of a device, shown large with the time it has left. The code is asked for
 * when the dialog opens, lives only in this component and is gone when it closes: the server
 * never shows it again.
 */
export function PairingCodeDialog({ device, onClose, onDone }: DialogProps & { device: Device }) {
  const [code, setCode] = useState<DevicePairingCode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // One code for each time the dialog is opened, and one more for each "New code".
  const [attempt, setAttempt] = useState(0);
  // Each code replaces the one before it on the server, so an attempt asks exactly once, even
  // when React runs the effect twice (StrictMode): the second run reads the same request.
  const requests = useRef(new Map<number, Promise<DevicePairingCode>>());
  useEffect(() => {
    let live = true;
    const request = requests.current.get(attempt) ?? devicesApi.pairingCode(device.id);
    requests.current.set(attempt, request);
    request
      .then((made) => {
        if (!live) return;
        setNow(Date.now());
        setCode(made);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setCode(null);
        setError(deviceErrorText(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [device.id, attempt]);
  const again = () => {
    setError('');
    setBusy(true);
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const left = code
    ? Math.max(0, Math.ceil((new Date(code.expires_at).getTime() - now) / 1000))
    : 0;
  const expired = !!code && left === 0;
  const close = () => {
    setCode(null);
    void onDone();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t('devices.code.title', { name: device.name })}
      description={`${device.name} · ${device.branch_name}`}
      footer={
        <>
          <Button variant="secondary" loading={busy} onClick={again}>
            {t('devices.code.again')}
          </Button>
          <Button onClick={close}>{t('devices.code.done')}</Button>
        </>
      }
    >
      <div className="space-y-3 text-center">
        {device.paired && <p className="type-caption">{t('devices.code.replaces')}</p>}
        {code && !expired && (
          <>
            <p className="type-body">{t('devices.code.hint')}</p>
            <p
              dir="ltr"
              aria-label={t('devices.code.label')}
              data-testid="pairing-code"
              className="select-all font-mono text-4xl font-bold tracking-[0.25em]"
            >
              {code.code}
            </p>
            <p className="type-caption" role="timer">
              {t('devices.code.expiresIn', { time: countdown(left) })}
            </p>
          </>
        )}
        {expired && (
          <p role="alert" className="type-body">
            {t('devices.code.expired')}
          </p>
        )}
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
