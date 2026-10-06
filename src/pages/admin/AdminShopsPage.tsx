import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { OrgStatus, type AdminShop, type AdminShopStatusBody } from '@ziadkhaled-wb/contracts';
import PageHeader from '@/components/layout/PageHeader';
import PageContainer from '@/components/ui/PageContainer';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import Select from '@/components/ui/Select';
import Notice from '@/components/ui/Notice';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';
import { formatDate } from '@/lib/format';
import { adminApi } from '@/services/shopApi';
import { shopError } from './shopErrors';
export default function AdminShopsPage() {
  const lang = useLanguage();
  const cache = useQueryClient();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrgStatus | ''>('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<AdminShop | null>(null);
  const [reason, setReason] = useState('');
  const shops = useQuery({
    queryKey: ['admin', 'shops', search, status, page],
    queryFn: () => adminApi.shops({ search, ...(status ? { status } : {}), page, page_size: 20 }),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ['admin', 'shops'] });
  const changeStatus = async (shop: AdminShop, next: AdminShopStatusBody) => {
    setBusy(shop.id);
    try {
      await adminApi.status(shop.id, next);
      await refresh();
      notify.success(t('shops.updated'));
      setSuspending(null);
    } catch (error) {
      notify.error(shopError(error));
    } finally {
      setBusy(null);
    }
  };
  const resend = async (shop: AdminShop) => {
    setBusy(shop.id);
    try {
      const result = await adminApi.resend(shop.id);
      await refresh();
      if (result.invite_email_sent) notify.success(t('shops.resent'));
      else notify.error(t('shops.resendFailed'));
    } catch (error) {
      notify.error(shopError(error));
    } finally {
      setBusy(null);
    }
  };
  const columns: ColumnDef<AdminShop, unknown>[] = [
    { accessorKey: 'name', header: t('shops.fields.name') },
    {
      accessorKey: 'tenant_slug',
      header: t('shops.fields.slug'),
      cell: ({ row }) => <span dir="ltr">{row.original.tenant_slug}</span>,
    },
    { accessorKey: 'plan_key', header: t('shops.fields.plan') },
    {
      accessorKey: 'status',
      header: t('shops.fields.status'),
      cell: ({ row }) => (
        <Badge tone={row.original.status === 'active' ? 'success' : 'warning'}>
          {t(`shops.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'owner',
      header: t('shops.owner'),
      cell: ({ row }) => (
        <div>
          <p>{row.original.owner_full_name}</p>
          <p dir="ltr" className="text-xs text-ink-mute">
            {row.original.owner_email}
          </p>
        </div>
      ),
    },
    {
      id: 'invite',
      header: t('shops.inviteStatus'),
      cell: ({ row }) => (
        <Badge
          tone={
            row.original.owner_invite_status === 'accepted'
              ? 'success'
              : row.original.owner_invite_status === 'expired'
                ? 'danger'
                : 'neutral'
          }
        >
          {t(`shops.inviteStatusLabels.${row.original.owner_invite_status}`)}
        </Badge>
      ),
    },
    {
      id: 'created',
      header: t('shops.createdAt'),
      cell: ({ row }) => formatDate(row.original.created_at, lang),
    },
    {
      id: 'actions',
      header: t('shops.actions'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          {row.original.status === 'active' && (
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setReason('');
                setSuspending(row.original);
              }}
            >
              {t('shops.suspend')}
            </Button>
          )}
          {row.original.status === 'suspended' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => void changeStatus(row.original, { status: 'active' })}
            >
              {t('shops.reactivate')}
            </Button>
          )}
          {row.original.owner_invite_status !== 'accepted' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || row.original.status !== 'active'}
              onClick={() => void resend(row.original)}
            >
              {t('shops.resend')}
            </Button>
          )}
        </div>
      ),
    },
  ];
  const notice = location.state as { created?: boolean; emailSent?: boolean } | null;
  return (
    <PageContainer>
      <PageHeader
        title={t('shops.title')}
        actions={
          <Link to="/admin/shops/new" className="btn btn-primary">
            {t('shops.create')}
          </Link>
        }
      />
      <div className="space-y-4">
        {notice?.created && (
          <Notice tone={notice.emailSent ? 'success' : 'error'}>
            {t(notice.emailSent ? 'shops.created' : 'shops.emailFailed')}
          </Notice>
        )}
        <div className="max-w-xs">
          <Select
            label={t('shops.fields.status')}
            value={status}
            options={[
              { value: '', label: t('shops.allStatuses') },
              ...(['active', 'suspended', 'expired', 'closed'] as const).map((value) => ({
                value,
                label: t(`shops.status.${value}`),
              })),
            ]}
            onChange={(e) => {
              setStatus(e.target.value ? OrgStatus.parse(e.target.value) : '');
              setPage(1);
            }}
          />
        </div>
        <DataTable
          columns={columns}
          data={shops.data?.items ?? []}
          caption={t('shops.title')}
          getRowId={(row) => row.id}
          loading={shops.isPending}
          error={shops.isError}
          onRetry={() => void shops.refetch()}
          empty={{ title: t('shops.empty'), description: t('shops.emptyHint') }}
          searchable
          server={{
            page,
            pageSize: 20,
            total: shops.data?.total ?? 0,
            onPageChange: setPage,
            search,
            onSearchChange: (value) => {
              setSearch(value);
              setPage(1);
            },
          }}
        />
      </div>
      <Dialog
        open={suspending !== null}
        onOpenChange={(open) => {
          if (!open) setSuspending(null);
        }}
        title={t('shops.suspendTitle', { name: suspending?.name ?? '' })}
        description={t('shops.suspendDescription')}
        footer={
          <Button
            variant="danger"
            disabled={!reason.trim()}
            loading={busy !== null}
            onClick={() => {
              if (suspending && reason.trim())
                void changeStatus(suspending, { status: 'suspended', reason: reason.trim() });
            }}
          >
            {t('shops.confirmSuspend')}
          </Button>
        }
      >
        <FormField
          label={t('shops.fields.reason')}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </Dialog>
    </PageContainer>
  );
}
