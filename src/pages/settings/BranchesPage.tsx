import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BranchCreateBody,
  BranchUpdateBody,
  BranchDeactivationCheck,
  compareMoney,
  type BranchDetail,
  type ManagedBranch,
} from '@ziadkhaled-wb/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import OnboardingReturnLink from '@/components/layout/OnboardingReturnLink';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { branchApi } from '@/services/branchApi';
import { branchKeys } from '@/features/me/useBranches';
import { meKeys } from '@/features/me/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';
const empty = {
  name: '',
  code: '',
  address: '',
  city: '',
  governorate: '',
  phone: '',
  eta_branch_code: '',
  default_cash_account_id: '',
};
type Counts = BranchDeactivationCheck;
const hasWarning = (c: Counts) =>
  c.open_shifts !== 0 || c.stock_units !== 0 || compareMoney(c.cash_balance, '0') !== 0;
export default function BranchesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: branchKeys.manage(orgId), queryFn: branchApi.manage });
  const [editing, setEditing] = useState<BranchDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [target, setTarget] = useState<ManagedBranch | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codeError, setCodeError] = useState('');
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: branchKeys.list(orgId) }),
      cache.invalidateQueries({ queryKey: branchKeys.manage(orgId) }),
      cache.invalidateQueries({ queryKey: meKeys.me(orgId) }),
      cache.invalidateQueries({ queryKey: meKeys.permissions(orgId) }),
    ]);
  function failure(e: unknown) {
    if (e instanceof ApiError && e.code === 'BRANCH_CODE_TAKEN')
      setCodeError(t('branches.codeTaken'));
    else if (e instanceof ApiError && e.code === 'BRANCH_DEACTIVATE_NEEDS_CONFIRM') {
      const parsed = BranchDeactivationCheck.safeParse(e.details);
      if (parsed.success) setCounts(parsed.data);
      setError(t('branches.warning'));
    } else if (e instanceof ApiError && e.code === 'PLAN_LIMIT_REACHED')
      setError(t('branches.planLimit'));
    else setError(t('errors.unknown'));
  }
  async function edit(row: ManagedBranch) {
    setBusy(true);
    setError('');
    setCodeError('');
    try {
      const detail = await branchApi.detail(row.id);
      setEditing(detail);
      setForm({
        name: detail.name,
        code: detail.code,
        address: detail.address ?? '',
        city: detail.city ?? '',
        governorate: detail.governorate ?? '',
        phone: detail.phone ?? '',
        eta_branch_code: detail.eta_branch_code ?? '',
        default_cash_account_id: detail.default_cash_account_id ?? '',
      });
      setFormOpen(true);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setCodeError('');
    const fields = {
      name: form.name,
      address: form.address || null,
      city: form.city || null,
      governorate: form.governorate || null,
      phone: form.phone || null,
      eta_branch_code: form.eta_branch_code || null,
    };
    if (!editing && !/^[A-Z0-9]{1,6}$/.test(form.code)) {
      setCodeError(t('branches.codeInvalid'));
      return;
    }
    const parsed = editing
      ? BranchUpdateBody.safeParse({
          ...fields,
          default_cash_account_id: form.default_cash_account_id || null,
        })
      : BranchCreateBody.safeParse({ ...fields, code: form.code });
    if (!parsed.success) {
      setError(t('branches.validation'));
      return;
    }
    setBusy(true);
    try {
      if (editing) await branchApi.update(editing.id, BranchUpdateBody.parse(parsed.data));
      else await branchApi.create(BranchCreateBody.parse(parsed.data));
      await refresh();
      setFormOpen(false);
      notify.success(t('branches.saved'));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function prepareDeactivate(row: ManagedBranch) {
    setBusy(true);
    setError('');
    try {
      const c = await branchApi.check(row.id);
      setTarget(row);
      setCounts(c);
      setReason('');
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(event: FormEvent) {
    event.preventDefault();
    if (!target || !counts || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await branchApi.deactivate(target.id, { reason: reason.trim(), confirm: hasWarning(counts) });
      await refresh();
      setTarget(null);
      notify.success(t('branches.saved'));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function reactivate(row: ManagedBranch) {
    setBusy(true);
    setError('');
    try {
      await branchApi.reactivate(row.id);
      await refresh();
      notify.success(t('branches.saved'));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  const columns: ColumnDef<ManagedBranch, unknown>[] = [
    { accessorKey: 'name', header: t('branches.fields.name') },
    { accessorKey: 'code', header: t('branches.fields.code') },
    {
      id: 'main',
      header: t('branches.main'),
      cell: ({ row }) => (row.original.is_main ? <Badge>{t('branches.main')}</Badge> : null),
    },
    {
      id: 'active',
      header: t('branches.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.is_active ? 'success' : 'neutral'}>
          {t(row.original.is_active ? 'branches.active' : 'branches.inactive')}
        </Badge>
      ),
    },
    { accessorKey: 'phone', header: t('branches.fields.phone') },
    {
      id: 'vault',
      header: t('branches.fields.vault'),
      cell: ({ row }) => row.original.default_vault?.name ?? t('branches.noVault'),
    },
    {
      id: 'actions',
      header: t('branches.actions'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !row.original.is_active}
            onClick={() => void edit(row.original)}
          >
            {t('branches.edit')}
          </Button>
          {row.original.is_active ? (
            !row.original.is_main && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void prepareDeactivate(row.original)}
              >
                {t('branches.deactivate')}
              </Button>
            )
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void reactivate(row.original)}>
              {t('branches.reactivate')}
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <PageContainer>
      <OnboardingReturnLink />
      <PageHeader
        title={t('branches.title')}
        actions={
          <Button
            disabled={busy}
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setError('');
              setCodeError('');
              setFormOpen(true);
            }}
          >
            {t('branches.create')}
          </Button>
        }
      />
      <FormError message={error} />
      <DataTable
        caption={t('branches.title')}
        columns={columns}
        data={query.data ?? []}
        loading={query.isPending}
        error={query.isError}
        getRowId={(row) => row.id}
      />
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!busy) setFormOpen(open);
        }}
        title={t(editing ? 'branches.edit' : 'branches.create')}
      >
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <FormField
            label={t('branches.fields.name')}
            value={form.name}
            maxLength={100}
            required
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <FormField
            label={t('branches.fields.code')}
            value={form.code}
            readOnly={!!editing}
            required
            error={codeError}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          {(['address', 'city', 'governorate', 'phone', 'eta_branch_code'] as const).map((key) => (
            <FormField
              key={key}
              label={t(`branches.fields.${key}`)}
              value={form[key]}
              maxLength={key === 'eta_branch_code' ? 20 : undefined}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          ))}
          {editing && (
            <Select
              label={t('branches.fields.vault')}
              value={form.default_cash_account_id}
              options={editing.vault_options.map((v) => ({ value: v.id, label: v.name }))}
              onChange={(e) => setForm({ ...form, default_cash_account_id: e.target.value })}
            />
          )}
          <FormError message={error} />
          <Button type="submit" disabled={busy}>
            {t('branches.save')}
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
        title={t('branches.deactivate')}
      >
        <form onSubmit={(e) => void deactivate(e)} className="space-y-4">
          {counts && hasWarning(counts) && (
            <div role="alert" className="rounded-control border border-ochre-500 p-3">
              <p>{t('branches.warning')}</p>
              <p>
                {t('branches.counts', {
                  shifts: counts.open_shifts,
                  stock: counts.stock_units,
                  cash: counts.cash_balance,
                })}
              </p>
            </div>
          )}
          <FormField
            label={t('branches.reason')}
            value={reason}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>
            {t(counts && hasWarning(counts) ? 'branches.deactivateAnyway' : 'branches.deactivate')}
          </Button>
        </form>
      </Dialog>
    </PageContainer>
  );
}
