import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { SaleStatus, type SaleHistoryRow, type SalesHistoryQuery } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useMe } from '@/features/me/useMe';
import { useAuthStore } from '@/store/authStore';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { saleKeys } from '@/services/salesApi';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/i18n';
import { SaleStatusBadge } from './SaleHistoryActions';
function today(zone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export default function SalesHistoryPage() {
  const org = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const me = useMe();
  const date = today(me.data?.org.timezone ?? 'Africa/Cairo');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const [cashier, setCashier] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const start = from ?? date;
  const end = to ?? date;
  const validDates = !start || !end || start <= end;
  const params: SalesHistoryQuery = {
    page,
    page_size: 20,
    ...(q ? { q } : {}),
    ...(start ? { from: start } : {}),
    ...(end ? { to: end } : {}),
    ...(branch ? { branch_id: branch } : {}),
    ...(cashier ? { cashier_id: cashier } : {}),
    ...(status ? { status: SaleStatus.parse(status) } : {}),
  };
  const rows = useQuery({
    queryKey: [...saleKeys.all(org), 'history', params],
    queryFn: () => salesHistoryApi.list(params),
    enabled: validDates,
    placeholderData: keepPreviousData,
  });
  const columns: ColumnDef<SaleHistoryRow>[] = [
    {
      accessorKey: 'number',
      header: t('sales.history.number'),
      cell: ({ row }) => (
        <Link className="btn-link" to={`/sales/${row.original.id}`}>
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: 'issued_at',
      header: t('sales.history.time'),
      cell: ({ row }) => formatDateTime(row.original.issued_at),
    },
    {
      id: 'branch',
      header: t('sales.history.branch'),
      cell: ({ row }) => row.original.branch.name,
    },
    {
      id: 'cashier',
      header: t('sales.history.cashier'),
      cell: ({ row }) => row.original.cashier.name,
    },
    {
      id: 'customer',
      header: t('sales.history.customer'),
      cell: ({ row }) => row.original.customer?.name ?? t('sales.detail.walkIn'),
    },
    {
      accessorKey: 'total',
      header: t('sales.history.total'),
      cell: ({ row }) => formatMoney(row.original.total),
    },
    {
      accessorKey: 'status',
      header: t('sales.history.state'),
      cell: ({ row }) => <SaleStatusBadge status={row.original.status} />,
    },
  ];
  const cashiers = [
    ...new Map(
      (rows.data?.items ?? []).filter((r) => r.cashier.id).map((r) => [r.cashier.id!, r.cashier]),
    ).values(),
  ];
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <PageContainer>
      <PageHeader title={t('sales.history.title')} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            label={t('sales.history.search')}
            value={q}
            onChange={(e) => change(setQ, e.target.value)}
          />
          <FormField
            label={t('sales.history.from')}
            type="date"
            value={start}
            onChange={(e) => change(setFrom, e.target.value)}
          />
          <FormField
            label={t('sales.history.to')}
            type="date"
            value={end}
            onChange={(e) => change(setTo, e.target.value)}
          />
          <Select
            label={t('sales.history.branch')}
            value={branch}
            onChange={(e) => change(setBranch, e.target.value)}
            options={[
              { value: '', label: t('sales.history.all') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <Select
            label={t('sales.history.cashier')}
            value={cashier}
            onChange={(e) => change(setCashier, e.target.value)}
            options={[
              { value: '', label: t('sales.history.all') },
              ...cashiers.map((c) => ({ value: c.id!, label: c.name ?? '' })),
            ]}
          />
          <Select
            label={t('sales.history.state')}
            value={status}
            onChange={(e) => change(setStatus, e.target.value)}
            options={[
              { value: '', label: t('sales.history.all') },
              ...SaleStatus.options.map((s) => ({
                value: s,
                label: t(`sales.history.status.${s}`),
              })),
            ]}
          />
        </div>
        <FormError message={!validDates ? t('sales.history.dateInvalid') : ''} />
      </Card>
      <DataTable
        caption={t('sales.history.title')}
        columns={columns}
        data={rows.data?.items ?? []}
        getRowId={(row) => row.id}
        loading={rows.isPending}
        error={rows.isError}
        onRetry={() => void rows.refetch()}
        empty={{ title: t('sales.history.empty') }}
        server={{ page, pageSize: 20, total: rows.data?.total ?? 0, onPageChange: setPage }}
      />
    </PageContainer>
  );
}
