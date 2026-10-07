import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  CategoryCreateBody,
  CategoryInUseDetail,
  CategoryUpdateBody,
  type Category,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import Can from '@/features/me/Can';
import { categoriesApi, categoryKeys } from '@/services/categoriesApi';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';

export default function CategoriesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: categoryKeys.list(orgId), queryFn: categoriesApi.list });
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', parent_id: '' });
  const [target, setTarget] = useState<Category | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const refresh = () => cache.invalidateQueries({ queryKey: categoryKeys.list(orgId) });
  const activeTop = (query.data ?? []).filter(
    (c) => !c.archived_at && !c.parent_id && c.id !== editing?.id,
  );
  const parentName = new Map((query.data ?? []).map((c) => [c.id, c.name]));
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const body = { name: form.name, parent_id: form.parent_id || null };
    try {
      if (editing) {
        const parsed = CategoryUpdateBody.safeParse(body);
        if (!parsed.success) {
          setError(t('categories.validation'));
          return;
        }
        await categoriesApi.update(editing.id, parsed.data);
      } else {
        const parsed = CategoryCreateBody.safeParse(body);
        if (!parsed.success) {
          setError(t('categories.validation'));
          return;
        }
        await categoriesApi.create(parsed.data);
      }
      await refresh();
      setOpen(false);
      notify.success(t('categories.saved'));
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'CATEGORY_NAME_TAKEN'
          ? t('categories.nameTaken')
          : t('categories.validation'),
      );
    }
  }
  async function archive() {
    if (!target) return;
    setArchiveError('');
    try {
      await categoriesApi.archive(target.id, moveTo ? { move_to_category_id: moveTo } : {});
      await refresh();
      setTarget(null);
      notify.success(t('categories.saved'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CATEGORY_IN_USE') {
        const details = CategoryInUseDetail.safeParse(e.details);
        setArchiveError(
          details.success
            ? t('categories.archiveRefused', {
                products: details.data.active_products,
                children: details.data.active_children,
              })
            : t('categories.inUse'),
        );
      } else if (e instanceof ApiError && e.code === 'CATEGORY_PARENT_ARCHIVED') {
        setArchiveError(t('categories.parentArchived'));
      } else if (e instanceof ApiError && e.code === 'CATEGORY_NOT_FOUND') {
        setArchiveError(t('categories.notFound'));
      } else {
        setArchiveError(t('categories.operationFailed'));
      }
    }
  }
  async function restore(category: Category) {
    try {
      await categoriesApi.restore(category.id);
      await refresh();
      notify.success(t('categories.saved'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CATEGORY_PARENT_ARCHIVED') {
        notify.error(t('categories.parentArchived'));
      } else if (e instanceof ApiError && e.code === 'CATEGORY_NOT_FOUND') {
        notify.error(t('categories.notFound'));
      } else {
        notify.error(t('categories.operationFailed'));
      }
    }
  }
  const columns: ColumnDef<Category, unknown>[] = [
    {
      id: 'name',
      header: t('categories.name'),
      cell: ({ row }) => (
        <span className={row.original.parent_id ? 'ms-5' : ''}>{row.original.name}</span>
      ),
    },
    {
      id: 'parent',
      header: t('categories.parent'),
      cell: ({ row }) =>
        row.original.parent_id ? parentName.get(row.original.parent_id) : t('categories.none'),
    },
    { accessorKey: 'active_product_count', header: t('categories.products') },
    {
      id: 'status',
      header: t('categories.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.archived_at ? 'neutral' : 'success'}>
          {t(row.original.archived_at ? 'categories.archived' : 'categories.active')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('categories.actions'),
      cell: ({ row }) => (
        <Can permission="catalog.manage">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!!row.original.archived_at}
              onClick={() => {
                setEditing(row.original);
                setForm({ name: row.original.name, parent_id: row.original.parent_id ?? '' });
                setError('');
                setOpen(true);
              }}
            >
              {t('categories.edit')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                row.original.archived_at
                  ? void restore(row.original)
                  : (setMoveTo(''), setArchiveError(''), setTarget(row.original))
              }
            >
              {t(row.original.archived_at ? 'categories.restore' : 'categories.archive')}
            </Button>
          </div>
        </Can>
      ),
    },
  ];
  const hasChildren = target
    ? (query.data ?? []).some((c) => c.parent_id === target.id && !c.archived_at)
    : false;
  const hasProducts = (target?.active_product_count ?? 0) > 0;
  return (
    <PageContainer>
      <PageHeader
        title={t('categories.title')}
        actions={
          <Can permission="catalog.manage">
            <Button
              onClick={() => {
                setEditing(null);
                setForm({ name: '', parent_id: '' });
                setError('');
                setOpen(true);
              }}
            >
              {t('categories.add')}
            </Button>
          </Can>
        }
      />
      <DataTable
        caption={t('categories.title')}
        columns={columns}
        data={[
          ...(query.data ?? []).filter((c) => !c.archived_at),
          ...(query.data ?? []).filter((c) => !!c.archived_at),
        ]}
        loading={query.isPending}
        error={query.isError}
        getRowId={(row) => row.id}
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t(editing ? 'categories.edit' : 'categories.add')}
      >
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <FormField
            label={t('categories.name')}
            value={form.name}
            error={error || undefined}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label={t('categories.parent')}
            value={form.parent_id}
            disabled={!!editing && (query.data ?? []).some((c) => c.parent_id === editing.id)}
            options={[
              { value: '', label: t('categories.none') },
              ...activeTop.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          />
          {editing && (query.data ?? []).some((c) => c.parent_id === editing.id) && (
            <p className="type-caption">{t('categories.hasChildren')}</p>
          )}
          <Button type="submit">{t('categories.save')}</Button>
        </form>
      </Dialog>
      <ConfirmDialog
        open={!!target && !hasChildren && !hasProducts}
        onOpenChange={(v) => !v && setTarget(null)}
        title={t('categories.archive')}
        description={target?.name}
        onConfirm={() => void archive()}
      />
      <Dialog
        open={!!target && (hasChildren || hasProducts)}
        onOpenChange={(v) => !v && setTarget(null)}
        title={t('categories.archive')}
      >
        <div className="space-y-3">
          <p>{hasChildren ? t('categories.children') : t('categories.inUse')}</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              {t('categories.activeProductsCount', { count: target?.active_product_count ?? 0 })}
            </li>
            <li>
              {t('categories.activeChildrenCount', {
                count: (query.data ?? []).filter(
                  (c) => c.parent_id === target?.id && !c.archived_at,
                ).length,
              })}
            </li>
          </ul>
          {archiveError && (
            <p role="alert" className="text-danger">
              {archiveError}
            </p>
          )}
        </div>
        {hasProducts && !hasChildren && (
          <>
            <Select
              label={t('categories.moveProducts')}
              value={moveTo}
              options={(query.data ?? [])
                .filter((c) => !c.archived_at && c.id !== target?.id)
                .map((c) => ({ value: c.id, label: c.name }))}
              onChange={(e) => setMoveTo(e.target.value)}
            />
            <Button disabled={!moveTo} onClick={() => void archive()}>
              {t('categories.archiveMove')}
            </Button>
          </>
        )}
      </Dialog>
    </PageContainer>
  );
}
