import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EmployeeCreateBody,
  EmployeeRole,
  EmployeeStatus,
  EMPLOYEE_ROLES,
  PERMISSIONS,
  PERMISSION_MODULES,
  ROLE_DEFAULT_PERMISSIONS,
  type EmployeeRow,
  type PermissionKey,
} from '@ziadkhaled-wb/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Dialog from '@/components/ui/Dialog';
import Drawer from '@/components/ui/Drawer';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { staffApi } from '@/services/staffApi';
import { branchApi } from '@/services/branchApi';
import { useMe } from '@/features/me/useMe';
import { usePermissions, meKeys } from '@/features/me/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';
import { ROLE_LABELS } from '@/types/auth';
import StaffLinkDialog from './StaffLinkDialog';
const empty = {
  full_name: '',
  phone: '',
  email: '',
  username: '',
  role: 'CASHIER' as EmployeeRole,
  branch_ids: [] as string[],
  default_branch_id: '',
};
const permissionLabel = (key: PermissionKey) =>
  t(('employees.permissions.' + key.replaceAll('.', '_')) as TranslationKey);
export default function EmployeesPage() {
  const org = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const me = useMe();
  const permissions = usePermissions();
  const callerRole = useAuthStore((s) => s.user?.role);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['employees', org, search, role, status, page],
    queryFn: () =>
      staffApi.list({
        search,
        ...(role ? { role: EmployeeRole.parse(role) } : {}),
        ...(status ? { status: EmployeeStatus.parse(status) } : {}),
        page,
        page_size: 50,
      }),
  });
  const branches = useQuery({ queryKey: ['branches', org, 'list'], queryFn: branchApi.list });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState<PermissionKey[]>([...ROLE_DEFAULT_PERMISSIONS.CASHIER]);
  const [target, setTarget] = useState<EmployeeRow | null>(null);
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ email?: string; username?: string }>({});
  const [permission, setPermission] = useState<PermissionKey>('sale.create');
  const [grant, setGrant] = useState(true);
  const [accessReason, setAccessReason] = useState('');
  const owns = callerRole === 'OWNER';
  const holds = (key: PermissionKey) => permissions.data?.keys.includes(key) ?? false;
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['employees', org] }),
      cache.invalidateQueries({ queryKey: meKeys.permissions(org) }),
      cache.invalidateQueries({ queryKey: meKeys.me(org) }),
    ]);
  function failure(e: unknown) {
    if (e instanceof ApiError && e.code === 'EMAIL_TAKEN')
      setFieldError({ email: t('employees.emailTaken') });
    else if (e instanceof ApiError && e.code === 'USERNAME_TAKEN')
      setFieldError({ username: t('employees.usernameTaken') });
    else if (
      e instanceof ApiError &&
      ['PERMISSION_ESCALATION', 'FORBIDDEN', 'BRANCH_DENIED'].includes(e.code)
    )
      setError(t('employees.escalation'));
    else if (e instanceof ApiError && e.code === 'LOGIN_LOCKED')
      setError(t('employees.loginLocked'));
    else if (e instanceof ApiError && e.code === 'PLAN_LIMIT_REACHED')
      setError(t('employees.planLimit'));
    else setError(t('errors.unknown'));
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      notify.success(t('employees.saved'));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  function edit(row: EmployeeRow) {
    setEditing(row);
    setForm({
      full_name: row.full_name,
      phone: row.phone ?? '',
      email: row.email ?? '',
      username: row.username ?? '',
      role: row.role,
      branch_ids: row.branch_ids,
      default_branch_id: row.default_branch_id ?? '',
    });
    setError('');
    setFieldError({});
    setAccessReason('');
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFieldError({});
    if (!form.email.trim() && !form.username.trim()) {
      setError(t('employees.loginRequired'));
      return;
    }
    const fields = {
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      username: form.username || null,
      role: form.role,
      default_branch_id: form.default_branch_id || form.branch_ids[0] || null,
    };
    if (editing) {
      await run(async () => {
        await staffApi.update(editing.id, fields);
        setOpen(false);
        setEditing(null);
      });
      return;
    }
    const defaults = ROLE_DEFAULT_PERMISSIONS[form.role];
    const overrides = PERMISSIONS.filter(
      (p) => selected.includes(p.key) !== defaults.includes(p.key),
    ).map((p) => ({ key: p.key, granted: selected.includes(p.key) }));
    const parsed = EmployeeCreateBody.safeParse({
      ...fields,
      branch_ids: form.branch_ids,
      overrides,
    });
    if (!parsed.success) {
      setError(t('employees.validation'));
      return;
    }
    await run(async () => {
      const result = await staffApi.create(parsed.data);
      setOpen(false);
      setLink(result.invite_link ?? null);
      if (result.email_sent === false) notify.info(t('employees.mailFailed'));
    });
  }
  async function delivery(row: EmployeeRow, reset: boolean) {
    await run(async () => {
      const result = reset ? await staffApi.reset(row.id) : await staffApi.invite(row.id);
      setLink(
        ('reset_link' in result ? result.reset_link : undefined) ??
          ('invite_link' in result ? result.invite_link : undefined) ??
          null,
      );
      if (result.email_sent === false) notify.info(t('employees.mailFailed'));
    });
  }
  const statusOf = (r: EmployeeRow) =>
    !r.is_active
      ? 'inactive'
      : r.invite_status !== 'accepted' && r.invite_status !== 'expired'
        ? 'pending'
        : r.invite_status === 'expired'
          ? 'expired'
          : 'active';
  const columns: ColumnDef<EmployeeRow, unknown>[] = [
    { accessorKey: 'full_name', header: t('employees.fields.full_name') },
    {
      id: 'role',
      header: t('employees.fields.role'),
      cell: ({ row }) => ROLE_LABELS[row.original.role],
    },
    {
      id: 'branches',
      header: t('employees.fields.branches'),
      cell: ({ row }) =>
        row.original.role === 'OWNER'
          ? t('employees.allBranches')
          : row.original.branch_ids
              .map(
                (id) =>
                  branches.data?.find((b) => b.id === id)?.name ?? t('employees.unavailableBranch'),
              )
              .join(', '),
    },
    {
      id: 'login',
      header: t('employees.fields.login'),
      cell: ({ row }) => <span dir="ltr">{row.original.username ?? row.original.email}</span>,
    },
    {
      id: 'status',
      header: t('employees.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.is_active ? 'success' : 'neutral'}>
          {t(`employees.statuses.${statusOf(row.original)}`)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('employees.actions'),
      cell: ({ row }) =>
        row.original.role === 'OWNER' ||
        !me.data ||
        row.original.id === me.data.employee.id ? null : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => edit(row.original)}>
              {t('employees.edit')}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              variant={row.original.is_active ? 'danger' : 'secondary'}
              onClick={() => {
                setTarget(row.original);
                setReason('');
                setError('');
              }}
            >
              {t(row.original.is_active ? 'employees.deactivate' : 'employees.reactivate')}
            </Button>
            {row.original.is_active &&
              (row.original.invite_status === 'accepted' ? (
                <Button size="sm" disabled={busy} onClick={() => void delivery(row.original, true)}>
                  {t('employees.reset')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void delivery(row.original, false)}
                >
                  {t('employees.resend')}
                </Button>
              ))}
          </div>
        ),
    },
  ];
  const formContent = (
    <form className="space-y-4 p-4" onSubmit={(event) => void save(event)} noValidate>
      {(['full_name', 'phone', 'email', 'username'] as const).map((key) => (
        <FormField
          key={key}
          label={t(`employees.fields.${key}`)}
          value={form[key]}
          required={key === 'full_name'}
          type={key === 'email' ? 'email' : 'text'}
          readOnly={
            !!editing &&
            editing.invite_status === 'accepted' &&
            (key === 'email' || key === 'username')
          }
          error={
            key === 'email'
              ? fieldError.email
              : key === 'username'
                ? fieldError.username
                : undefined
          }
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ))}
      {editing?.invite_status === 'accepted' && <p>{t('employees.loginLocked')}</p>}
      <Select
        label={t('employees.fields.role')}
        value={form.role}
        options={EMPLOYEE_ROLES.filter((r) => r !== 'OWNER').map((r) => ({
          value: r,
          label: ROLE_LABELS[r],
          disabled: !owns && ROLE_DEFAULT_PERMISSIONS[r].some((k) => !holds(k)),
        }))}
        onChange={(e) => {
          const next = EmployeeRole.parse(e.target.value);
          setForm({ ...form, role: next });
          setSelected([...ROLE_DEFAULT_PERMISSIONS[next]]);
        }}
      />
      <fieldset className="space-y-2">
        <legend>{t('employees.fields.branches')}</legend>
        {branches.data?.map((b) => (
          <label className="flex items-center gap-2" key={b.id}>
            <input
              type="checkbox"
              checked={form.branch_ids.includes(b.id)}
              onChange={(e) => {
                const ids = e.target.checked
                  ? [...form.branch_ids, b.id]
                  : form.branch_ids.filter((id) => id !== b.id);
                setForm({
                  ...form,
                  branch_ids: ids,
                  default_branch_id: ids.includes(form.default_branch_id)
                    ? form.default_branch_id
                    : (ids[0] ?? ''),
                });
              }}
            />
            {b.name}
          </label>
        ))}
      </fieldset>
      <Select
        label={t('employees.fields.defaultBranch')}
        value={form.default_branch_id}
        placeholder={t('employees.chooseBranch')}
        options={form.branch_ids.map((id) => ({
          value: id,
          label: branches.data?.find((b) => b.id === id)?.name ?? t('employees.unavailableBranch'),
        }))}
        onChange={(e) => setForm({ ...form, default_branch_id: e.target.value })}
      />
      {!editing && (
        <div className="space-y-4">
          {PERMISSION_MODULES.map((module) => (
            <fieldset key={module} className="space-y-2">
              <legend className="font-bold">{t(`employees.modules.${module}`)}</legend>
              {PERMISSIONS.filter((p) => p.module === module).map((p) => (
                <label key={p.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    disabled={!holds(p.key)}
                    checked={selected.includes(p.key)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.key]
                          : selected.filter((k) => k !== p.key),
                      )
                    }
                  />
                  {permissionLabel(p.key)}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {t('employees.save')}
      </Button>
    </form>
  );
  return (
    <PageContainer>
      <PageHeader
        title={t('employees.title')}
        actions={
          <Button
            disabled={busy || permissions.isPending}
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setSelected([...ROLE_DEFAULT_PERMISSIONS.CASHIER]);
              setOpen(true);
              setError('');
              setFieldError({});
            }}
          >
            {t('employees.create')}
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <FormField
          label={t('employees.search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t('employees.fields.role')}
          value={role}
          options={[
            { value: '', label: t('employees.all') },
            ...EMPLOYEE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          ]}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t('employees.status')}
          value={status}
          options={[
            { value: '', label: t('employees.all') },
            ...EmployeeStatus.options.map((s) => ({
              value: s,
              label: t(`employees.statuses.${s}`),
            })),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {!open && !target && <FormError message={error} />}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        loading={query.isPending}
        error={query.isError}
        getRowId={(r) => r.id}
        caption={t('employees.title')}
        server={{ page, pageSize: 50, total: query.data?.total ?? 0, onPageChange: setPage }}
      />
      <Dialog
        open={open && !editing}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={t('employees.create')}
        className="max-w-2xl"
      >
        {formContent}
      </Dialog>
      <Drawer
        open={open && !!editing}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={t('employees.edit')}
        className="w-[38rem]"
      >
        {formContent}
        {editing && (
          <div className="space-y-4 border-t border-line p-4">
            <h2>{t('employees.access')}</h2>
            <p>{t('employees.overrideCount', { count: editing.override_count })}</p>
            <FormField
              label={t('employees.reason')}
              required
              value={accessReason}
              onChange={(e) => setAccessReason(e.target.value)}
            />
            <Button
              disabled={busy || !accessReason.trim() || form.branch_ids.length === 0}
              onClick={() =>
                void run(async () => {
                  await staffApi.branches(editing.id, {
                    branchIds: form.branch_ids,
                    reason: accessReason,
                  });
                  setEditing({ ...editing, branch_ids: form.branch_ids });
                })
              }
            >
              {t('employees.saveBranches')}
            </Button>
            <Select
              label={t('employees.permission')}
              value={permission}
              options={PERMISSIONS.map((p) => ({
                value: p.key,
                label: permissionLabel(p.key),
                disabled: !holds(p.key) || (!owns && p.key === 'employee.manage'),
              }))}
              onChange={(e) => setPermission(e.target.value as PermissionKey)}
            />
            <Select
              label={t('employees.change')}
              value={grant ? 'grant' : 'revoke'}
              options={[
                { value: 'grant', label: t('employees.grant') },
                { value: 'revoke', label: t('employees.revoke') },
              ]}
              onChange={(e) => setGrant(e.target.value === 'grant')}
            />
            <Button
              disabled={
                busy ||
                !accessReason.trim() ||
                !holds(permission) ||
                (!owns && permission === 'employee.manage')
              }
              onClick={() =>
                void run(() =>
                  staffApi.permission(editing.id, {
                    permissionKey: permission,
                    granted: grant,
                    reason: accessReason,
                  }),
                )
              }
            >
              {t('employees.savePermission')}
            </Button>
          </div>
        )}
      </Drawer>
      <Dialog
        open={!!target}
        onOpenChange={(value) => {
          if (!value && !busy) setTarget(null);
        }}
        title={t(target?.is_active ? 'employees.deactivate' : 'employees.reactivate')}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (target)
              void run(async () => {
                await staffApi.active(target.id, {
                  active: !target.is_active,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                });
                setTarget(null);
              });
          }}
        >
          <p>{target?.full_name}</p>
          <FormField
            label={t('employees.reason')}
            value={reason}
            required={!!target?.is_active}
            onChange={(e) => setReason(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" disabled={busy || (!!target?.is_active && !reason.trim())}>
            {t('employees.confirm')}
          </Button>
        </form>
      </Dialog>
      <StaffLinkDialog link={link} onClose={() => setLink(null)} />
    </PageContainer>
  );
}
