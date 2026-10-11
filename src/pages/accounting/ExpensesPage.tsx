import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Expense } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Switch from '@/components/ui/Switch';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import {
  expenseKeys,
  expensesApi,
  type ExpenseListParams,
  type ExpenseReportParams,
} from '@/services/expensesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { ExpenseCategoriesDialog, NewExpenseDialog, ReverseExpenseDialog } from './ExpenseParts';
import { monthRange } from './expenseShared';

const PAGE_SIZE = 20;
const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/**
 * K03: what the shop spends. A total by category for the chosen period, the list of expenses
 * (reversals are their own rows), a new expense from a vault or the open shift, the categories,
 * and the owner's reversal.
 */
export default function ExpensesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const canCreate = useCan('expense.create');
  const canOpenReceipt = useCan('cash.view');
  const branches = useBranches();
  const [month] = useState(() => monthRange());
  const [branchId, setBranchId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [withReversals, setWithReversals] = useState(true);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [reversing, setReversing] = useState<Expense | null>(null);

  const categories = useQuery({
    queryKey: expenseKeys.categories(orgId, true),
    queryFn: () => expensesApi.categories(true),
  });
  const params: ExpenseListParams = {
    ...(branchId ? { branch_id: branchId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    include_reversals: withReversals,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: expenseKeys.list(orgId, params),
    queryFn: () => expensesApi.list(params),
    placeholderData: keepPreviousData,
  });
  const reportParams: ExpenseReportParams = {
    from,
    to,
    ...(branchId ? { branch_id: branchId } : {}),
  };
  const report = useQuery({
    queryKey: expenseKeys.report(orgId, reportParams),
    queryFn: () => expensesApi.report(reportParams),
    enabled: from !== '' && to !== '' && from <= to,
    placeholderData: keepPreviousData,
  });
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  async function openReceipt(fileId: string) {
    try {
      window.open((await expensesApi.receiptUrl(fileId)).url, '_blank', 'noopener');
    } catch {
      notify.error(t('cash.expenses.receipt.failed'));
    }
  }

  const columns: ColumnDef<Expense, unknown>[] = [
    {
      id: 'number',
      header: t('cash.expenses.columns.number'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <span dir="ltr">{row.original.number}</span>
          {row.original.reverses_expense_id !== null && (
            <Badge tone="warning">{t('cash.expenses.status.reversal')}</Badge>
          )}
          {row.original.reversed_by_expense_id !== null && (
            <Badge>{t('cash.expenses.status.reversed')}</Badge>
          )}
        </span>
      ),
    },
    {
      id: 'date',
      header: t('cash.expenses.columns.date'),
      cell: ({ row }) => formatBusinessDate(row.original.business_date),
    },
    {
      id: 'category',
      header: t('cash.expenses.columns.category'),
      cell: ({ row }) => <span dir="auto">{row.original.category_name}</span>,
    },
    {
      id: 'source',
      header: t('cash.expenses.columns.source'),
      cell: ({ row }) =>
        row.original.shift_number !== null ? (
          t('cash.expenses.source.shift', { number: row.original.shift_number })
        ) : (
          <span dir="auto">{row.original.cash_account_name}</span>
        ),
    },
    {
      id: 'note',
      header: t('cash.expenses.columns.note'),
      cell: ({ row }) => <span dir="auto">{row.original.note ?? ''}</span>,
    },
    {
      id: 'by',
      header: t('cash.expenses.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
    {
      id: 'amount',
      header: t('cash.expenses.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.amount),
    },
    {
      id: 'actions',
      header: t('cash.expenses.columns.actions'),
      cell: ({ row }) => {
        const x = row.original;
        const fileId = x.receipt_file_id;
        return (
          <span className="flex flex-wrap gap-1">
            {fileId !== null && canOpenReceipt && (
              <Button size="sm" variant="ghost" onClick={() => void openReceipt(fileId)}>
                {t('cash.expenses.receipt.view')}
              </Button>
            )}
            {isOwner && x.reverses_expense_id === null && x.reversed_by_expense_id === null && (
              <Button size="sm" variant="ghost" onClick={() => setReversing(x)}>
                {t('cash.expenses.reverse.action')}
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('cash.expenses.title')}
        description={t('cash.expenses.description')}
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setManaging(true)}>
                {t('cash.expenses.categories')}
              </Button>
              <Button onClick={() => setAdding(true)}>{t('cash.expenses.new')}</Button>
            </div>
          ) : undefined
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
          <Select
            label={t('cash.expenses.filters.branch')}
            value={branchId}
            options={[
              { value: '', label: t('cash.expenses.filters.allBranches') },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(e) => filter(setBranchId)(e.target.value)}
          />
          <Select
            label={t('cash.expenses.filters.category')}
            value={categoryId}
            options={[
              { value: '', label: t('cash.expenses.filters.allCategories') },
              ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(e) => filter(setCategoryId)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('cash.expenses.filters.from')}
            value={from}
            max={to || undefined}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
          <FormField
            type="date"
            ltr
            label={t('cash.expenses.filters.to')}
            value={to}
            min={from || undefined}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
        <div className="mt-3">
          <Switch
            label={t('cash.expenses.filters.includeReversals')}
            checked={withReversals}
            onChange={(e) => {
              setWithReversals(e.target.checked);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Card title={t('cash.expenses.report.title')} className="mb-4">
        <p className="type-caption mb-3">{t('cash.expenses.report.help')}</p>
        {!report.data ? (
          report.isFetching ? (
            <Skeleton className="h-16" />
          ) : null
        ) : report.data.items.length === 0 ? (
          <p className="type-body">{t('cash.expenses.report.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('cash.expenses.report.title')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('cash.expenses.report.category')}</th>
                  <th className={thNum}>{t('cash.expenses.report.count')}</th>
                  <th className={thNum}>{t('cash.expenses.report.total')}</th>
                </tr>
              </thead>
              <tbody>
                {report.data.items.map((r) => (
                  <tr key={r.category_id} className="border-b border-line">
                    <td className={td}>
                      <span dir="auto">{r.category_name}</span>
                    </td>
                    <td className={tdNum}>{formatNumber(r.count)}</td>
                    <td className={tdNum}>{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className={th}>
                    {t('cash.expenses.report.all')}
                  </th>
                  <td className={tdNum}>{formatNumber(report.data.count)}</td>
                  <td className={`${tdNum} font-semibold`} data-testid="expense-total">
                    {formatMoney(report.data.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <DataTable
        caption={t('cash.expenses.list')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        empty={{ title: t('cash.expenses.empty'), description: t('cash.expenses.emptyHint') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
      {adding && <NewExpenseDialog onClose={() => setAdding(false)} />}
      {managing && <ExpenseCategoriesDialog onClose={() => setManaging(false)} />}
      {reversing && <ReverseExpenseDialog expense={reversing} onClose={() => setReversing(null)} />}
    </PageContainer>
  );
}
