import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  MigrationReport,
  MigrationReportBatch,
  MigrationReportCustomer,
} from '@ziadkhaled-wb/contracts';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import PageContainer from '@/components/ui/PageContainer';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { saveBlob } from '@/features/imports/importShared';
import ReverseBatchDialog from '@/features/migration/ReverseBatchDialog';
import SignOffSection from '@/features/migration/SignOffSection';
import { batchState } from '@/features/migration/migrationShared';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { migrationApi, migrationKeys, type MigrationFilters } from '@/services/migrationApi';
import { useAuthStore } from '@/store/authStore';

const TABS = ['report', 'signoff'] as const;
type Tab = (typeof TABS)[number];
const th = 'type-label px-3 py-2 text-start';
const td = 'type-body px-3 py-2 text-start';

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="rounded-control border border-line px-4 py-3">
      <p className="type-caption">{label}</p>
      <p
        className={cn('type-section-title num', tone === 'danger' && 'text-danger-600')}
        data-testid={`tile-${label}`}
      >
        {value}
      </p>
    </div>
  );
}

function Totals({ report }: { report: MigrationReport }) {
  const x = report.totals;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label={t('migration.totals.contracts')} value={formatNumber(x.contracts)} />
      <Tile label={t('migration.totals.customers')} value={formatNumber(x.customers)} />
      <Tile label={t('migration.totals.original')} value={formatMoney(x.original_total)} />
      <Tile label={t('migration.totals.paidBefore')} value={formatMoney(x.paid_before)} />
      <Tile label={t('migration.totals.imported')} value={formatMoney(x.imported_total)} />
      <Tile label={t('migration.totals.open')} value={formatMoney(x.open_now)} />
      <Tile
        label={t('migration.totals.overdue')}
        value={formatMoney(x.overdue_now)}
        tone={Number(x.overdue_now) > 0 ? 'danger' : undefined}
      />
      <Tile label={t('migration.totals.collected')} value={formatMoney(x.collected_since)} />
    </div>
  );
}

function Batches({
  batches,
  onReverse,
}: {
  batches: MigrationReportBatch[];
  onReverse: (b: MigrationReportBatch) => void;
}) {
  if (batches.length === 0) return <p className="p-6">{t('migration.batches.empty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max">
        <caption className="sr-only">{t('migration.batches.title')}</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th className={th}>{t('migration.batches.when')}</th>
            <th className={th}>{t('migration.batches.kind')}</th>
            <th className={th}>{t('migration.batches.file')}</th>
            <th className={th}>{t('migration.batches.contracts')}</th>
            <th className={th}>{t('migration.batches.total')}</th>
            <th className={th}>{t('migration.batches.state')}</th>
            <th className={th}>
              <span className="sr-only">{t('migration.batches.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {batches.map((b) => {
            const state = batchState(b);
            return (
              <tr key={b.id}>
                <td className={td}>{formatDateTime(b.created_at)}</td>
                <td className={td}>{t(`migration.kinds.${b.kind}`)}</td>
                <td className={td}>{b.file_name ?? ''}</td>
                <td className={td + ' num'}>{formatNumber(b.contracts)}</td>
                <td className={td + ' num'}>
                  {formatMoney(b.kind === 'opening_cash' ? b.cash_total : b.imported_total)}
                </td>
                <td className={td}>
                  <Badge
                    tone={
                      state === 'signed' ? 'success' : state === 'reversed' ? 'danger' : 'brand'
                    }
                  >
                    {t(`migration.batches.states.${state}`)}
                  </Badge>
                </td>
                <td className={td}>
                  {b.can_reverse && (
                    <Button size="sm" variant="secondary" onClick={() => onReverse(b)}>
                      {t('migration.batches.reverse')}
                    </Button>
                  )}
                  {!b.can_reverse && b.blocker && !b.reversed && b.signoff_id === null && (
                    <span className="type-caption">
                      {t('migration.batches.blocked', {
                        number: b.blocker.number,
                        reason: t(`migration.blocker.${b.blocker.reason}`),
                      })}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * M02 migration (import.data or report.financial): the reconciliation report of the opening
 * balances (per customer, branch and batch, plus the opening cash), the CSV to print, the sign-off
 * against the old records' total and the undo of a wrong batch. The server computes every number.
 */
export default function MigrationPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [tab, setTab] = useState<Tab>('report');
  const [batchId, setBatchId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [reversing, setReversing] = useState<MigrationReportBatch | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const filters: MigrationFilters = {
    ...(batchId ? { batch_id: batchId } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
  };
  // The unfiltered report supplies the batch picker and the sign-off list.
  const all = useQuery({
    queryKey: migrationKeys.report(orgId, {}),
    queryFn: () => migrationApi.report(),
  });
  const report = useQuery({
    queryKey: migrationKeys.report(orgId, filters),
    queryFn: () => migrationApi.report(filters),
    placeholderData: keepPreviousData,
  });

  async function downloadCsv() {
    setCsvBusy(true);
    try {
      const blob = await migrationApi.reportCsv(filters);
      saveBlob(blob, `migration-report-${report.data?.as_of ?? 'today'}.csv`);
    } catch {
      notify.error(t('migration.csvFailed'));
    } finally {
      setCsvBusy(false);
    }
  }

  const batchOptions = (all.data?.batches ?? []).map((b) => ({
    value: b.id,
    label: `${t(`migration.kinds.${b.kind}`)} · ${b.file_name ?? ''} · ${formatDateTime(b.created_at)}`,
  }));
  const branchOptions = (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }));

  const customerColumns: ColumnDef<MigrationReportCustomer, unknown>[] = [
    {
      id: 'name',
      header: t('migration.customers.name'),
      accessorFn: (c) => c.name,
      cell: ({ row }) => (
        <Link
          to={`/customers/${row.original.customer_id}`}
          className="text-brand-700 hover:underline"
        >
          <bdi>{row.original.name}</bdi>
        </Link>
      ),
    },
    {
      id: 'national_id',
      header: t('migration.customers.nationalId'),
      accessorFn: (c) => c.national_id ?? '',
      cell: ({ row }) => <span dir="ltr">{row.original.national_id ?? ''}</span>,
    },
    {
      id: 'contracts',
      header: t('migration.customers.contracts'),
      accessorFn: (c) => c.contracts,
      meta: { numeric: true },
    },
    {
      id: 'original',
      header: t('migration.customers.original'),
      accessorFn: (c) => Number(c.original_total),
      cell: ({ row }) => formatMoney(row.original.original_total),
      meta: { numeric: true },
    },
    {
      id: 'paidBefore',
      header: t('migration.customers.paidBefore'),
      accessorFn: (c) => Number(c.paid_before),
      cell: ({ row }) => formatMoney(row.original.paid_before),
      meta: { numeric: true },
    },
    {
      id: 'open',
      header: t('migration.customers.open'),
      accessorFn: (c) => Number(c.open_now),
      cell: ({ row }) => formatMoney(row.original.open_now),
      meta: { numeric: true },
    },
    {
      id: 'overdue',
      header: t('migration.customers.overdue'),
      accessorFn: (c) => Number(c.overdue_now),
      cell: ({ row }) => formatMoney(row.original.overdue_now),
      meta: { numeric: true },
    },
    {
      id: 'collected',
      header: t('migration.customers.collected'),
      accessorFn: (c) => Number(c.collected_since),
      cell: ({ row }) => formatMoney(row.original.collected_since),
      meta: { numeric: true },
    },
  ];

  if (report.isError && !report.data) {
    return (
      <PageContainer>
        <PageHeader title={t('migration.title')} description={t('migration.description')} />
        <ErrorState onRetry={() => void report.refetch()} />
      </PageContainer>
    );
  }

  const data = report.data;
  return (
    <PageContainer>
      <PageHeader
        title={t('migration.title')}
        description={t('migration.description')}
        actions={
          <Link to="/settings/import" className="btn btn-secondary">
            {t('migration.openImport')}
          </Link>
        }
      />
      <div
        role="tablist"
        aria-label={t('migration.title')}
        className="mb-6 flex gap-1 border-b border-line"
      >
        {TABS.map((id) => (
          <button
            key={id}
            id={`migration-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`migration-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              'type-body min-h-11 shrink-0 border-b-2 px-4 whitespace-nowrap transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-mute hover:text-ink',
            )}
          >
            {t(`migration.tabs.${id}`)}
          </button>
        ))}
      </div>

      {!data ? (
        <LoadingState />
      ) : tab === 'report' ? (
        <div
          id="migration-panel-report"
          role="tabpanel"
          aria-labelledby="migration-tab-report"
          className="space-y-6"
        >
          <div className="flex flex-wrap items-end gap-4">
            <Select
              label={t('migration.filters.batch')}
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder={t('migration.filters.all')}
              options={batchOptions}
            />
            <Select
              label={t('migration.filters.branch')}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder={t('migration.filters.all')}
              options={branchOptions}
            />
            <Button variant="secondary" loading={csvBusy} onClick={() => void downloadCsv()}>
              {t('migration.downloadCsv')}
            </Button>
          </div>
          <Totals report={data} />
          <Card title={t('migration.customers.title')} padded={false}>
            <DataTable
              caption={t('migration.customers.title')}
              columns={customerColumns}
              data={data.customers}
              getRowId={(c) => c.customer_id}
              searchable
              pageSize={20}
            />
          </Card>
          {data.branches.length > 1 && (
            <Card title={t('migration.branches.title')} padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <caption className="sr-only">{t('migration.branches.title')}</caption>
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className={th}>{t('migration.branches.name')}</th>
                      <th className={th}>{t('migration.customers.contracts')}</th>
                      <th className={th}>{t('migration.customers.open')}</th>
                      <th className={th}>{t('migration.customers.overdue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.branches.map((b) => (
                      <tr key={b.branch_id}>
                        <td className={td}>{b.name}</td>
                        <td className={td + ' num'}>{formatNumber(b.contracts)}</td>
                        <td className={td + ' num'}>{formatMoney(b.open_now)}</td>
                        <td className={td + ' num'}>{formatMoney(b.overdue_now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title={t('migration.cash.title')} padded={false}>
            {data.cash.length === 0 ? (
              <p className="p-6">{t('migration.cash.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <caption className="sr-only">{t('migration.cash.title')}</caption>
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className={th}>{t('migration.cash.account')}</th>
                      <th className={th}>{t('migration.cash.branch')}</th>
                      <th className={th}>{t('migration.cash.posted')}</th>
                      <th className={th}>{t('migration.cash.now')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.cash.map((a) => (
                      <tr key={a.account_id}>
                        <td className={td}>{a.name}</td>
                        <td className={td}>{a.branch_name ?? t('migration.cash.shopWide')}</td>
                        <td className={td + ' num'}>{formatMoney(a.opening_posted)}</td>
                        <td className={td + ' num'}>{formatMoney(a.balance_now)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={td + ' font-semibold'} colSpan={2}>
                        {t('migration.cash.total')}
                      </td>
                      <td className={td + ' num font-semibold'}>
                        {formatMoney(data.cash_totals.opening_posted)}
                      </td>
                      <td className={td + ' num font-semibold'}>
                        {formatMoney(data.cash_totals.balance_now)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title={t('migration.batches.title')} padded={false}>
            <Batches batches={data.batches} onReverse={setReversing} />
          </Card>
        </div>
      ) : (
        <div id="migration-panel-signoff" role="tabpanel" aria-labelledby="migration-tab-signoff">
          <SignOffSection batches={all.data?.batches ?? data.batches} />
        </div>
      )}
      {reversing && <ReverseBatchDialog batch={reversing} onClose={() => setReversing(null)} />}
    </PageContainer>
  );
}
