import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DeviceEtaBody, DeviceEtaStatus, type Device } from '@ziadkhaled-wb/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { etaErrorText } from '@/features/eta/etaErrors';
import { etaApi, etaKeys } from '@/services/etaApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const STATUS_TONE: Record<DeviceEtaStatus, BadgeTone> = {
  unregistered: 'neutral',
  pending: 'warning',
  active: 'success',
  revoked: 'danger',
};

type DeviceForm = {
  eta_serial: string;
  eta_os_version: string;
  eta_model_framework: string;
  /** Write-only: never filled from the server. */
  preshared_key: string;
  eta_status: DeviceEtaStatus;
};

/**
 * T02 (D67): Settings → Devices. The shop's POS devices and each one's registration with the tax
 * authority: serial, OS version, model framework, pre-shared key and status. The key is
 * write-only: the dialog shows only whether one is saved.
 */
export default function DevicesPage() {
  const org = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const devices = useQuery({ queryKey: etaKeys.devices(org), queryFn: etaApi.devices });
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function edit(device: Device) {
    setEditing(device);
    setError('');
    setForm({
      eta_serial: device.eta_serial ?? '',
      eta_os_version: device.eta_os_version ?? '',
      eta_model_framework: device.eta_model_framework ?? '',
      preshared_key: '',
      eta_status: device.eta_status,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    setError('');
    const parsed = DeviceEtaBody.safeParse({
      eta_serial: form.eta_serial || null,
      eta_os_version: form.eta_os_version || null,
      eta_model_framework: form.eta_model_framework || null,
      eta_status: form.eta_status,
      ...(form.preshared_key ? { preshared_key: form.preshared_key } : {}),
    });
    if (!parsed.success) {
      setError(t('eta.devices.validation'));
      return;
    }
    setSaving(true);
    try {
      await etaApi.saveDevice(editing.id, parsed.data);
      await cache.invalidateQueries({ queryKey: etaKeys.devices(org) });
      setEditing(null);
      setForm(null); // the typed key leaves the page with the save
      notify.success(t('eta.devices.saved'));
    } catch (e) {
      setError(etaErrorText(e));
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnDef<Device, unknown>[] = [
    { accessorKey: 'name', header: t('eta.devices.name') },
    { accessorKey: 'branch_name', header: t('eta.devices.branch') },
    {
      id: 'serial',
      header: t('eta.devices.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.eta_serial ?? '—'}</span>,
    },
    {
      id: 'status',
      header: t('eta.devices.status'),
      cell: ({ row }) => (
        <Badge tone={STATUS_TONE[row.original.eta_status]}>
          {t(`eta.devices.statuses.${row.original.eta_status}`)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('eta.devices.actions'),
      cell: ({ row }) => (
        <Button size="sm" variant="secondary" onClick={() => edit(row.original)}>
          {t('eta.devices.edit')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title={t('eta.devices.title')} description={t('eta.devices.description')} />
      <DataTable
        caption={t('eta.devices.title')}
        columns={columns}
        data={devices.data ?? []}
        loading={devices.isPending}
        error={devices.isError}
        getRowId={(row) => row.id}
      />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditing(null);
            setForm(null);
          }
        }}
        title={t('eta.devices.edit')}
        description={editing ? `${editing.name} · ${editing.branch_name}` : undefined}
      >
        {form && (
          <form onSubmit={(event) => void save(event)} className="space-y-3">
            <FormField
              label={t('eta.devices.serial')}
              value={form.eta_serial}
              maxLength={100}
              ltr
              onChange={(e) => setForm({ ...form, eta_serial: e.target.value })}
            />
            <FormField
              label={t('eta.devices.osVersion')}
              value={form.eta_os_version}
              maxLength={50}
              ltr
              onChange={(e) => setForm({ ...form, eta_os_version: e.target.value })}
            />
            <FormField
              label={t('eta.devices.modelFramework')}
              value={form.eta_model_framework}
              maxLength={10}
              ltr
              onChange={(e) => setForm({ ...form, eta_model_framework: e.target.value })}
            />
            <div className="space-y-1">
              <FormField
                label={t('eta.devices.presharedKey')}
                type="password"
                value={form.preshared_key}
                maxLength={200}
                autoComplete="new-password"
                help={t('eta.devices.presharedKeyHelp')}
                onChange={(e) => setForm({ ...form, preshared_key: e.target.value })}
              />
              <Badge tone={editing?.has_preshared_key ? 'success' : 'neutral'}>
                {t(editing?.has_preshared_key ? 'eta.secretSaved' : 'eta.secretMissing')}
              </Badge>
            </div>
            <Select
              label={t('eta.devices.status')}
              value={form.eta_status}
              options={DeviceEtaStatus.options.map((value) => ({
                value,
                label: t(`eta.devices.statuses.${value}`),
              }))}
              onChange={(e) =>
                setForm({ ...form, eta_status: DeviceEtaStatus.parse(e.target.value) })
              }
            />
            <FormError message={error} />
            <Button type="submit" loading={saving}>
              {t('eta.devices.save')}
            </Button>
          </form>
        )}
      </Dialog>
    </PageContainer>
  );
}
