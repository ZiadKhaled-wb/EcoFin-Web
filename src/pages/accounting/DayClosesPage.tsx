import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DayCloseStatus, type DayCloseListItem } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { dayCloseKeys, dayClosesApi } from '@/services/dayClosesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { dayHref } from './dayCloseShared';

const STATUSES = DayCloseStatus.options;
const isStatus = (v: string): v is DayCloseStatus => (STATUSES as readonly string[]).includes(v);
const STATUS_TONE = { open: 'warning', closed: 'success', reopened: 'danger' } as const;

/** Today in the browser's local date: the server checks the shop's own date. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * K04: the business days of the caller's branches (open, closed, reopened) with their sales and
 * problems, and a picker to open any day (day.close or cash.view; the server limits the branches).
 */
export default function DayClosesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const branches = useBranches();
  const [branchId, setBranchId] = useState(params.get('branch_id') ?? '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pickBranch, setPickBranch] = useState(params.get('branch_id') ?? '');
  const [pickDate, setPickDate] = useState(localToday());

  const query = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const list = useQuery({
    queryKey: dayCloseKeys.list(orgId, query),
    queryFn: () => dayClosesApi.list(query),
    placeholderData: keepPreviousData,
  });
  const branchOptions = (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const chosenBranch = pickBranch || branchOptions[0]?.value || '';

  const columns: ColumnDef<DayCloseListItem, unknown>[] = [
    {
      id: 'date',
      header: t('dayClose.list.columns.date'),
      cell: ({ row }) => (
        <Link
          to={dayHref(row.original.branch_id, row.original.business_date)}
          className="text-brand-700 hover:underline"
        >
          {formatBusinessDate(row.original.business_date)}
        </Link>
      ),
    },
    {
      id: 'branch',
      header: t('dayClose.list.columns.branch'),
      cell: ({ row }) => row.original.branch_name,
    },
    {
      id: 'status',
      header: t('dayClose.list.columns.status'),
      cell: ({ row }) => (
        <Badge tone={STATUS_TONE[row.original.status]}>
          {t(`dayClose.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'sales',
      header: t('dayClose.list.columns.sales'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.sales_total),
    },
    {
      id: 'issues',
      header: t('dayClose.list.columns.issues'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.issues_count === null ? (
          ''
        ) : (
          <Badge tone={row.original.issues_count > 0 ? 'warning' : 'success'}>
            {formatNumber(row.original.issues_count)}
          </Badge>
        ),
    },
    {
      id: 'closedBy',
      header: t('dayClose.list.columns.closedBy'),
      cell: ({ row }) => row.original.closed_by_name ?? '',
    },
  ];

  return (
    <PageContainer>
      <PageHeader title={t('dayClose.title')} description={t('dayClose.description')} />
      <Card title={t('dayClose.pick.title')} className="mb-6">
        <form
          className="grid gap-3 md:grid-cols-3 md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosenBranch && pickDate) navigate(dayHref(chosenBranch, pickDate));
          }}
        >
          <Select
            label={t('dayClose.pick.branch')}
            value={chosenBranch}
            options={branchOptions}
            onChange={(e) => setPickBranch(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('dayClose.pick.date')}
            value={pickDate}
            max={localToday()}
            onChange={(e) => setPickDate(e.target.value)}
          />
          <Button type="submit" disabled={!chosenBranch || !pickDate}>
            {t('dayClose.pick.go')}
          </Button>
        </form>
      </Card>
      <h2 className="type-section-title mb-3">{t('dayClose.list.title')}</h2>
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <Select
            label={t('dayClose.list.branch')}
            value={branchId}
            options={[{ value: '', label: t('dayClose.list.allBranches') }, ...branchOptions]}
            onChange={(e) => setBranchId(e.target.value)}
          />
          <Select
            label={t('dayClose.list.status')}
            value={status}
            options={[
              { value: '', label: t('dayClose.list.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: t(`dayClose.status.${s}`) })),
            ]}
            onChange={(e) => setStatus(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('dayClose.list.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('dayClose.list.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </Card>
      <DataTable
        caption={t('dayClose.list.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => `${row.branch_id}-${row.business_date}`}
        empty={{ title: t('dayClose.list.empty'), description: t('dayClose.list.emptyHint') }}
      />
    </PageContainer>
  );
}
