import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { CashAccount, CashAccountStatus } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useBranches } from '@/features/me/useBranches';
import { formatMoney } from '@/lib/format';
import { uuidParam } from '@/lib/urlFilters';
import { cashApi, cashKeys, type CashAccountListParams } from '@/services/cashApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { CashAccountForm, CashOpeningDialog, CashTransferDialog } from './CashDialogs';
import { cashError, isZero } from './cashShared';

const STATUSES: CashAccountStatus[] = ['active', 'inactive', 'all'];
const ALL_BRANCHES = '';

/**
 * K01 vaults (D56): the safes and bank accounts the caller may see, with their balances. Adding,
 * renaming and (de)activating need cash.account_manage; the opening balance cash.adjust (only on
 * an empty account); transfers cash.transfer. The server checks every call.
 */
export default function VaultsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const [status, setStatus] = useState<CashAccountStatus>('active');
  // D01: the dashboard opens the safes and banks of a branch with ?branch_id=.
  const [urlParams] = useSearchParams();
  const [branchId, setBranchId] = useState(() => uuidParam(urlParams, 'branch_id') || ALL_BRANCHES);
  const [form, setForm] = useState<{ account: CashAccount | null } | null>(null);
  const [opening, setOpening] = useState<CashAccount | null>(null);
  const [transfer, setTransfer] = useState<{ from?: CashAccount } | null>(null);
  const [deactivating, setDeactivating] = useState<CashAccount | null>(null);

  const params: CashAccountListParams = {
    status,
    ...(branchId ? { branch_id: branchId } : {}),
  };
  const list = useQuery({
    queryKey: cashKeys.accounts(orgId, params),
    queryFn: () => cashApi.list(params),
    placeholderData: keepPreviousData,
  });
  // The transfer dialog offers every active account the caller sees, whatever the filters.
  const activeParams: CashAccountListParams = { status: 'active' };
  const active = useQuery({
    queryKey: cashKeys.accounts(orgId, activeParams),
    queryFn: () => cashApi.list(activeParams),
    enabled: !!transfer,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: cashKeys.all(orgId) });

  async function deactivate() {
    if (!deactivating) return;
    try {
      await cashApi.deactivate(deactivating.id);
      notify.success(t('cash.deactivated'));
      await refresh();
    } catch (e) {
      notify.error(cashError(e));
    } finally {
      setDeactivating(null);
    }
  }

  async function reactivate(account: CashAccount) {
    try {
      await cashApi.reactivate(account.id);
      notify.success(t('cash.reactivated'));
      await refresh();
    } catch (e) {
      notify.error(cashError(e));
    }
  }

  const columns: ColumnDef<CashAccount, unknown>[] = [
    {
      id: 'name',
      header: t('cash.columns.name'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            to={`/accounting/vaults/${row.original.id}`}
            className="text-brand-700 hover:underline"
          >
            {row.original.name}
          </Link>
          {row.original.is_default && <Badge tone="brand">{t('cash.default')}</Badge>}
        </span>
      ),
    },
    {
      id: 'kind',
      header: t('cash.columns.kind'),
      cell: ({ row }) => t(`cash.kind.${row.original.kind}`),
    },
    {
      id: 'branch',
      header: t('cash.columns.branch'),
      cell: ({ row }) => row.original.branch_name ?? t('cash.shopWide'),
    },
    {
      id: 'balance',
      header: t('cash.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => formatMoney(row.original.balance),
    },
    {
      id: 'status',
      header: t('cash.columns.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.is_active ? 'success' : 'neutral'}>
          {t(row.original.is_active ? 'cash.status.active' : 'cash.status.inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('cash.columns.actions'),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            {a.is_active && (
              <Can permission="cash.transfer">
                <Button size="sm" variant="ghost" onClick={() => setTransfer({ from: a })}>
                  {t('cash.transfer')}
                </Button>
              </Can>
            )}
            {a.is_active && isZero(a.balance) && (
              <Can permission="cash.adjust">
                <Button size="sm" variant="ghost" onClick={() => setOpening(a)}>
                  {t('cash.opening')}
                </Button>
              </Can>
            )}
            <Can permission="cash.account_manage">
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setForm({ account: a })}>
                  {t('cash.rename')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => (a.is_active ? setDeactivating(a) : void reactivate(a))}
                >
                  {t(a.is_active ? 'cash.deactivate' : 'cash.reactivate')}
                </Button>
              </div>
            </Can>
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('cash.title')}
        description={t('cash.description')}
        actions={
          <div className="flex gap-2">
            <Can permission="cash.transfer">
              <Button variant="secondary" onClick={() => setTransfer({})}>
                {t('cash.transfer')}
              </Button>
            </Can>
            <Can permission="cash.account_manage">
              <Button onClick={() => setForm({ account: null })}>{t('cash.add')}</Button>
            </Can>
          </div>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 md:items-end">
        <Select
          label={t('cash.statusFilter')}
          value={status}
          options={STATUSES.map((s) => ({ value: s, label: t(`cash.status.${s}`) }))}
          onChange={(e) => setStatus(e.target.value as CashAccountStatus)}
        />
        <Select
          label={t('cash.branchFilter')}
          value={branchId}
          options={[
            { value: ALL_BRANCHES, label: t('cash.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          onChange={(e) => setBranchId(e.target.value)}
        />
      </div>
      <DataTable
        caption={t('cash.title')}
        columns={columns}
        data={list.data ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(row) => row.id}
        rowClassName={(row) => (row.is_active ? undefined : 'opacity-60')}
        empty={{ title: t('cash.empty'), description: t('cash.emptyHint') }}
      />
      {form && (
        <CashAccountForm
          account={form.account}
          branches={branches.data ?? []}
          onClose={() => setForm(null)}
          onSaved={() => void refresh()}
        />
      )}
      {opening && (
        <CashOpeningDialog
          account={opening}
          onClose={() => setOpening(null)}
          onSaved={() => void refresh()}
        />
      )}
      {transfer && active.data && (
        <CashTransferDialog
          accounts={active.data}
          {...(transfer.from ? { from: transfer.from } : {})}
          onClose={() => setTransfer(null)}
          onSaved={() => void refresh()}
        />
      )}
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(v) => !v && setDeactivating(null)}
        title={t('cash.deactivateTitle')}
        description={t('cash.deactivateConfirm')}
        confirmLabel={t('cash.deactivate')}
        tone="danger"
        onConfirm={() => void deactivate()}
      />
    </PageContainer>
  );
}
