// T01: the shop's tax classes inside Settings -> Tax. Every shop starts with standard 14%,
// zero-rated and exempt; a new rate applies to new documents only.
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  TAX_KINDS,
  TaxClassCreateBody,
  TaxClassUpdateBody,
  type TaxClass,
  type TaxKind,
} from '@ziadkhaled-wb/contracts';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { taxClassKeys, taxClassesApi } from '@/services/taxClassesApi';
import { settingsKeys } from '@/features/settings/useSettings';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';

type Form = {
  name: string;
  kind: TaxKind;
  rate: string;
  eta_tax_type: string;
  eta_subtype: string;
};
const empty: Form = {
  name: '',
  kind: 'standard',
  rate: '14',
  eta_tax_type: 'T1',
  eta_subtype: 'V009',
};

function taxError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'TAX_CLASS_NAME_TAKEN')
    return t('settings.taxClasses.nameTaken');
  if (e instanceof ApiError && e.code === 'TAX_CLASS_IN_USE') return t('settings.taxClasses.inUse');
  if (e instanceof ApiError && (e.code === 'VALIDATION_FAILED' || e.code === 'NAME_REQUIRED'))
    return t('settings.errors.validation');
  return t('errors.unknown');
}

export default function TaxClassesSection() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: taxClassKeys.list(orgId), queryFn: taxClassesApi.list });
  const [editing, setEditing] = useState<TaxClass | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The settings screen lists the active classes in its selects, so refresh both.
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: taxClassKeys.list(orgId) }),
      cache.invalidateQueries({ queryKey: settingsKeys.settings(orgId) }),
    ]);

  function startEdit(row: TaxClass | null) {
    setEditing(row);
    setForm(
      row
        ? {
            name: row.name,
            kind: row.kind,
            rate: String(Number(row.rate)),
            eta_tax_type: row.eta_tax_type,
            eta_subtype: row.eta_subtype,
          }
        : empty,
    );
    setError('');
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const body = { ...form, rate: form.kind === 'standard' ? form.rate || '0' : '0' };
    const parsed = editing
      ? TaxClassUpdateBody.safeParse(body)
      : TaxClassCreateBody.safeParse(body);
    if (!parsed.success) {
      setError(t('settings.errors.validation'));
      return;
    }
    setBusy(true);
    try {
      if (editing) await taxClassesApi.update(editing.id, TaxClassUpdateBody.parse(body));
      else await taxClassesApi.create(TaxClassCreateBody.parse(body));
      await refresh();
      setOpen(false);
      notify.success(t('settings.taxClasses.saved'));
    } catch (e) {
      setError(taxError(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived(row: TaxClass) {
    setBusy(true);
    setError('');
    try {
      if (row.archived_at) await taxClassesApi.restore(row.id);
      else await taxClassesApi.archive(row.id);
      await refresh();
      notify.success(t('settings.taxClasses.saved'));
    } catch (e) {
      notify.error(taxError(e));
    } finally {
      setBusy(false);
    }
  }

  const columns: ColumnDef<TaxClass, unknown>[] = [
    { accessorKey: 'name', header: t('settings.taxClasses.name') },
    {
      id: 'kind',
      header: t('settings.taxClasses.kind'),
      cell: ({ row }) => t(`settings.taxClasses.kinds.${row.original.kind}`),
    },
    {
      id: 'rate',
      header: t('settings.taxClasses.rate'),
      cell: ({ row }) => `${Number(row.original.rate)}%`,
    },
    {
      id: 'eta',
      header: t('settings.taxClasses.etaCode'),
      cell: ({ row }) => (
        <span dir="ltr">{`${row.original.eta_tax_type} / ${row.original.eta_subtype}`}</span>
      ),
    },
    {
      id: 'status',
      header: t('settings.taxClasses.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.archived_at ? 'neutral' : 'success'}>
          {t(
            row.original.archived_at
              ? 'settings.taxClasses.archived'
              : 'settings.taxClasses.active',
          )}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('settings.taxClasses.actions'),
      cell: ({ row }) => (
        <Can permission="catalog.manage">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !!row.original.archived_at}
              onClick={() => startEdit(row.original)}
            >
              {t('settings.taxClasses.edit')}
            </Button>
            <Button
              size="sm"
              variant={row.original.archived_at ? 'secondary' : 'ghost'}
              disabled={busy}
              onClick={() => void toggleArchived(row.original)}
            >
              {t(
                row.original.archived_at
                  ? 'settings.taxClasses.restore'
                  : 'settings.taxClasses.archive',
              )}
            </Button>
          </div>
        </Can>
      ),
    },
  ];

  return (
    <Card
      title={t('settings.taxClasses.title')}
      description={t('settings.taxClasses.description')}
      actions={
        <Can permission="catalog.manage">
          <Button size="sm" disabled={busy} onClick={() => startEdit(null)}>
            {t('settings.taxClasses.add')}
          </Button>
        </Can>
      }
      padded={false}
    >
      <DataTable
        caption={t('settings.taxClasses.title')}
        columns={columns}
        data={query.data ?? []}
        loading={query.isPending}
        error={query.isError}
        getRowId={(row) => row.id}
      />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        title={t(editing ? 'settings.taxClasses.edit' : 'settings.taxClasses.add')}
      >
        <form onSubmit={(e) => void save(e)} className="space-y-3" noValidate>
          <FormField
            label={t('settings.taxClasses.name')}
            value={form.name}
            maxLength={60}
            required
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label={t('settings.taxClasses.kind')}
            value={form.kind}
            options={TAX_KINDS.map((k) => ({
              value: k,
              label: t(`settings.taxClasses.kinds.${k}`),
            }))}
            onChange={(e) => {
              const kind = e.target.value as TaxKind;
              setForm({ ...form, kind, rate: kind === 'standard' ? form.rate : '0' });
            }}
          />
          <NumberInput
            label={t('settings.taxClasses.rate')}
            help={editing ? t('settings.taxClasses.rateHelp') : undefined}
            decimals={2}
            suffix="%"
            disabled={form.kind !== 'standard'}
            value={form.rate}
            onValueChange={(v) => setForm({ ...form, rate: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label={t('settings.taxClasses.etaType')}
              value={form.eta_tax_type}
              maxLength={10}
              ltr
              onChange={(e) => setForm({ ...form, eta_tax_type: e.target.value })}
            />
            <FormField
              label={t('settings.taxClasses.etaSubtype')}
              value={form.eta_subtype}
              maxLength={10}
              ltr
              onChange={(e) => setForm({ ...form, eta_subtype: e.target.value })}
            />
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={busy}>
            {t('settings.taxClasses.save')}
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
