import { AuthChangePasswordBody } from '@ecotech/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import Dialog from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Form';
import { useZodForm } from '@/components/ui/useZodForm';
import PageContainer from '@/components/ui/PageContainer';
import { notify } from '@/components/ui/notify';
import SubmitButton from '@/components/ui/SubmitButton';
import { formatMoney } from '@/lib/format';
import { t } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

type ProductRow = { id: string; name: string; status: 'active' | 'draft'; price: string };
type ViewState = 'data' | 'loading' | 'empty' | 'error';

const VIEW_STATES: ViewState[] = ['data', 'loading', 'empty', 'error'];

// Prices are decimal strings, as the contract sends them. They are never turned into numbers.
const ROWS: ProductRow[] = Array.from({ length: 23 }, (_, i) => ({
  id: `p-${i + 1}`,
  name: `${i % 2 === 0 ? 'Sofa' : 'Table'} ${i + 1}`,
  status: i % 3 === 0 ? 'draft' : 'active',
  price: `${1000 + i * 125}.${i % 2 === 0 ? '50' : '00'}`,
}));

type FormValues = { currentPassword: string; newPassword: string };

/**
 * The F09 reference page: everything on it is a shared component. It proves the shell in both
 * languages and is the pattern real pages copy. Dev only (see App.tsx).
 */
export default function SamplePage() {
  const lang = useLanguage();
  const [view, setView] = useState<ViewState>('data');
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: t('sample.table.name') },
      {
        accessorKey: 'status',
        header: t('sample.table.status'),
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'active' ? 'success' : 'neutral'}>
            {t(`sample.table.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'price',
        header: t('sample.table.price'),
        meta: { numeric: true },
        // Sorts the decimal strings by value without float maths on money: same-length compare.
        sortingFn: (a, b) => comparePlainDecimals(a.original.price, b.original.price),
        cell: ({ row }) => formatMoney(row.original.price, lang),
      },
    ],
    [lang],
  );

  const form = useZodForm<FormValues>(AuthChangePasswordBody, {
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit(() => {
    // A real page would call its feature API here.
    notify.success(t('sample.form.success'));
    form.reset();
  });

  const data = view === 'empty' ? [] : ROWS;

  return (
    <PageContainer>
      <PageHeader
        title={t('sample.title')}
        description={t('sample.description')}
        actions={<Button onClick={() => setDialogOpen(true)}>{t('sample.dialog.open')}</Button>}
      />

      <div className="space-y-8">
        <div role="group" aria-label={t('sample.states.label')} className="flex flex-wrap gap-2">
          {VIEW_STATES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={view === s ? 'primary' : 'secondary'}
              aria-pressed={view === s}
              onClick={() => setView(s)}
            >
              {t(`sample.states.${s}`)}
            </Button>
          ))}
        </div>

        <DataTable
          caption={t('sample.title')}
          columns={columns}
          data={data}
          getRowId={(r) => r.id}
          loading={view === 'loading'}
          error={view === 'error'}
          onRetry={() => setView('data')}
          searchable
          pageSize={5}
          filter={{
            columnId: 'status',
            label: t('sample.table.statusFilter'),
            options: [
              { value: 'active', label: t('sample.table.active') },
              { value: 'draft', label: t('sample.table.draft') },
            ],
          }}
          empty={{
            title: t('sample.table.emptyTitle'),
            description: t('sample.table.emptyDescription'),
            action: (
              <Button onClick={() => setView('data')}>{t('sample.table.emptyAction')}</Button>
            ),
          }}
        />

        <Card title={t('sample.form.title')}>
          <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-5">
            <TextField
              control={form.control}
              name="currentPassword"
              label={t('sample.form.currentPassword')}
              type="password"
              autoComplete="current-password"
            />
            <TextField
              control={form.control}
              name="newPassword"
              label={t('sample.form.newPassword')}
              type="password"
              autoComplete="new-password"
            />
            <SubmitButton label={t('sample.form.submit')} loading={form.formState.isSubmitting} />
          </form>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t('sample.dialog.title')}
        description={t('sample.dialog.description')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              {t('ui.cancel')}
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false);
                notify.info(t('sample.dialog.confirmed'));
              }}
            >
              {t('ui.confirm')}
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}

/** Compares two non-negative decimal strings without parsing them as floats. */
function comparePlainDecimals(a: string, b: string): number {
  const [ai = '', af = ''] = a.split('.');
  const [bi = '', bf = ''] = b.split('.');
  if (ai.length !== bi.length) return ai.length - bi.length;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const x = af.padEnd(len, '0');
  const y = bf.padEnd(len, '0');
  return x === y ? 0 : x < y ? -1 : 1;
}
