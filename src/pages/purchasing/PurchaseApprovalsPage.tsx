import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PurchaseApprovalStatus, type PurchaseApprovalListItem } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  purchaseInvoiceKeys,
  purchaseInvoicesApi,
  type PurchaseApprovalListParams,
} from '@/services/purchaseInvoicesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const PAGE_SIZE = 20;
const STATUSES = PurchaseApprovalStatus.options.filter((s) => s !== 'cancelled');

/**
 * U06 (D55): purchase invoices above the approval limit, waiting for the owner (default), and the
 * decided ones. The owner decides on the invoice page; others only see the list.
 */
export default function PurchaseApprovalsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const branches = useBranches();
  const [status, setStatus] = useState<PurchaseApprovalStatus>('pending');
  const [page, setPage] = useState(1);
  const params: PurchaseApprovalListParams = { status, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: purchaseInvoiceKeys.approvals(orgId, params),
    queryFn: () => purchaseInvoicesApi.approvals(params),
    placeholderData: keepPreviousData,
  });
  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const decided = status !== 'pending';

  const columns: ColumnDef<PurchaseApprovalListItem, unknown>[] = [
    {
      id: 'number',
      header: t('purchases.approvals.columns.number'),
      cell: ({ row }) => (
        <Link
          to={`/purchasing/invoices/${row.original.invoice.id}`}
          className="text-brand-700 hover:underline"
          dir="ltr"
        >
          {row.original.invoice.number}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: t('purchases.approvals.columns.supplier'),
      cell: ({ row }) => row.original.invoice.supplier_name,
    },
    {
      id: 'branch',
      header: t('purchases.approvals.columns.branch'),
      cell: ({ row }) => branchName.get(row.original.invoice.branch_id) ?? '',
    },
    {
      id: 'total',
      header: t('purchases.approvals.columns.total'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.approval.amount),
    },
    {
      id: 'threshold',
      header: t('purchases.approvals.columns.threshold'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.approval.threshold ? formatMoney(row.original.approval.threshold) : '',
    },
    {
      id: 'requestedBy',
      header: t('purchases.approvals.columns.requestedBy'),
      cell: ({ row }) => row.original.approval.requested_by_name ?? '',
    },
    {
      id: 'requestedAt',
      header: t('purchases.approvals.columns.requestedAt'),
      cell: ({ row }) => formatDateTime(row.original.approval.requested_at),
    },
    ...(decided
      ? ([
          {
            id: 'decidedBy',
            header: t('purchases.approvals.columns.decidedBy'),
            cell: ({ row }) => row.original.approval.decided_by_name ?? '',
          },
          {
            id: 'note',
            header: t('purchases.approvals.columns.note'),
            meta: { wrap: true },
            cell: ({ row }) => row.original.approval.note ?? '',
          },
        ] satisfies ColumnDef<PurchaseApprovalListItem, unknown>[])
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.approvals.title')}
        description={t('purchases.approvals.description')}
      />
      <div className="mb-4 max-w-xs">
        <Select
          label={t('purchases.approvals.status')}
          value={status}
          options={STATUSES.map((s) => ({
            value: s,
            label: t(`purchases.approvals.statuses.${s}`),
          }))}
          onChange={(e) => {
            setStatus(e.target.value as PurchaseApprovalStatus);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('purchases.approvals.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.approval.id}
        empty={{
          title: t('purchases.approvals.empty'),
          description: t('purchases.approvals.emptyHint'),
        }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </PageContainer>
  );
}
