import type { AuditRow } from '@ziadkhaled-wb/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import Drawer from '@/components/ui/Drawer';
import FormField from '@/components/ui/FormField';
import { XIcon } from '@/components/ui/Icons';
import PageContainer from '@/components/ui/PageContainer';
import Select from '@/components/ui/Select';
import {
  AUDIT_PAGE_SIZE,
  hasAnyFilter,
  readFilters,
  toSearchParams,
  writeFilters,
  type AuditFilters,
} from '@/features/audit/filters';
import {
  KNOWN_ACTIONS,
  KNOWN_ENTITY_TYPES,
  actionLabel,
  entityTypeLabel,
} from '@/features/audit/labels';
import { useAuditSearch } from '@/features/audit/useAuditSearch';
import { useMe } from '@/features/me/useMe';
import { formatDateTime } from '@/lib/format';
import { t } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

const shortId = (id: string) => id.slice(0, 8);

/**
 * F07 · the owner's audit log (route guarded by audit.view). Filters live in the URL; the
 * server filters and pages; the actor's name filters by that person; a drawer shows one entry
 * with its before/after values.
 */
export default function AuditPage() {
  const lang = useLanguage();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const search = useAuditSearch(toSearchParams(filters));
  const me = useMe();
  const [open, setOpen] = useState<AuditRow | null>(null);

  const branchName = useMemo(() => {
    const names = new Map((me.data?.branches ?? []).map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? (names.get(id) ?? shortId(id)) : '');
  }, [me.data]);

  // Functional update: always applies the patch to the URL as it is now.
  const set = useCallback(
    (patch: Partial<AuditFilters>) => setParams((prev) => writeFilters(readFilters(prev), patch)),
    [setParams],
  );

  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('audit.columns.time'),
        cell: ({ row }) => formatDateTime(row.original.createdAt, lang),
      },
      {
        id: 'action',
        header: t('audit.columns.action'),
        cell: ({ row }) => (
          <Badge tone={row.original.severity === 'info' ? 'neutral' : 'warning'}>
            {actionLabel(row.original.action)}
          </Badge>
        ),
      },
      {
        id: 'actor',
        header: t('audit.columns.actor'),
        cell: ({ row }) => {
          const { employeeId, actorName } = row.original;
          if (!employeeId) return t('audit.system');
          const name = actorName ?? shortId(employeeId);
          return (
            <button
              type="button"
              className="btn-link"
              aria-label={t('audit.filterByPerson', { name })}
              onClick={() => set({ actorEmployeeId: employeeId, actorName: name })}
            >
              {name}
            </button>
          );
        },
      },
      {
        id: 'record',
        header: t('audit.columns.record'),
        cell: ({ row }) =>
          row.original.entityType
            ? `${entityTypeLabel(row.original.entityType)}${
                row.original.entityId ? ` · ${shortId(row.original.entityId)}` : ''
              }`
            : '',
      },
      {
        id: 'branch',
        header: t('audit.columns.branch'),
        cell: ({ row }) => branchName(row.original.branchId),
      },
      {
        id: 'ip',
        header: t('audit.columns.ip'),
        meta: { numeric: true },
        cell: ({ row }) => row.original.ip ?? '',
      },
      {
        id: 'details',
        header: t('audit.columns.details'),
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setOpen(row.original)}>
            {t('audit.openDetails')}
          </Button>
        ),
      },
    ],
    [lang, branchName, set, setOpen],
  );

  const all = { value: '', label: t('audit.filters.all') };
  const data = search.data;

  return (
    <PageContainer>
      <PageHeader title={t('audit.title')} description={t('audit.description')} />

      <div className="space-y-6">
        <Card>
          <form
            aria-label={t('audit.filters.label')}
            className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => e.preventDefault()}
          >
            <FormField
              type="date"
              ltr
              label={t('audit.filters.from')}
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set({ from: e.target.value })}
            />
            <FormField
              type="date"
              ltr
              label={t('audit.filters.to')}
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
            />
            <Select
              label={t('audit.filters.action')}
              value={filters.action}
              options={[all, ...KNOWN_ACTIONS.map((a) => ({ value: a, label: actionLabel(a) }))]}
              onChange={(e) => set({ action: e.target.value })}
            />
            <Select
              label={t('audit.filters.entityType')}
              value={filters.entityType}
              options={[
                all,
                ...KNOWN_ENTITY_TYPES.map((v) => ({ value: v, label: entityTypeLabel(v) })),
              ]}
              onChange={(e) => set({ entityType: e.target.value })}
            />
            <Select
              label={t('audit.filters.branch')}
              value={filters.branchId}
              options={[
                all,
                ...(me.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name })),
              ]}
              onChange={(e) => set({ branchId: e.target.value })}
            />
          </form>
          {hasAnyFilter(filters) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              {filters.actorEmployeeId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800">
                  {t('audit.filters.person', {
                    name: filters.actorName || shortId(filters.actorEmployeeId),
                  })}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-brand-100"
                    aria-label={t('audit.filters.clearPerson')}
                    onClick={() => set({ actorEmployeeId: '', actorName: '' })}
                  >
                    <XIcon size={14} />
                  </button>
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
                {t('audit.filters.clear')}
              </Button>
            </div>
          )}
        </Card>

        <DataTable
          caption={t('audit.caption')}
          columns={columns}
          data={data?.items ?? []}
          getRowId={(r) => String(r.id)}
          loading={search.isPending}
          error={search.isError}
          onRetry={() => void search.refetch()}
          empty={{ title: t('audit.empty.title'), description: t('audit.empty.description') }}
          server={{
            page: data?.page ?? filters.page,
            pageSize: data?.pageSize ?? AUDIT_PAGE_SIZE,
            total: data?.total ?? 0,
            onPageChange: (page) => set({ page }),
          }}
        />
      </div>

      <Drawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t('audit.detail.title')}
        side="end"
      >
        {open && <AuditDetail row={open} branch={branchName(open.branchId)} />}
      </Drawer>
    </PageContainer>
  );
}

function AuditDetail({ row, branch }: { row: AuditRow; branch: string }) {
  const lang = useLanguage();
  const none = t('audit.detail.none');
  const fields: [string, string, boolean?][] = [
    [t('audit.detail.time'), formatDateTime(row.createdAt, lang)],
    [t('audit.detail.action'), actionLabel(row.action)],
    [
      t('audit.detail.actor'),
      row.employeeId ? (row.actorName ?? shortId(row.employeeId)) : t('audit.system'),
    ],
    [
      t('audit.detail.record'),
      row.entityType ? `${entityTypeLabel(row.entityType)} ${row.entityId ?? ''}`.trim() : none,
    ],
    [t('audit.detail.branch'), branch || none],
    [t('audit.detail.reason'), row.reason ?? none],
    [t('audit.detail.ip'), row.ip ?? none, true],
    [t('audit.detail.device'), row.deviceId ?? none, true],
    [t('audit.detail.userAgent'), row.userAgent ?? none, true],
    [t('audit.detail.requestId'), row.requestId ?? none, true],
  ];
  return (
    <div className="space-y-5 p-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {fields.map(([label, value, ltr]) => (
          <div key={label} className="contents">
            <dt className="text-ink-mute">{label}</dt>
            <dd className="min-w-0 break-words" dir={ltr ? 'ltr' : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <JsonBlock title={t('audit.detail.before')} value={row.before} />
      <JsonBlock title={t('audit.detail.after')} value={row.after} />
    </div>
  );
}

/** Before/after values, pretty-printed; always left-to-right (it's code-like data). */
function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto rounded-control bg-paper p-3 text-start font-mono text-xs leading-relaxed"
      >
        {value === null || value === undefined
          ? t('audit.detail.none')
          : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
