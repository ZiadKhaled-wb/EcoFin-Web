import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { UnitHistoryEntry } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import ErrorState from '@/components/ui/ErrorState';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { unitKeys, unitsApi } from '@/services/unitsApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import { UNIT_TONE } from './unitShared';

/** I04: one unit and everything that happened to it, oldest first. */
export default function UnitPage() {
  const { id = '' } = useParams();
  const orgId = useAuthStore((s) => s.orgId);
  const unit = useQuery({ queryKey: unitKeys.one(orgId, id), queryFn: () => unitsApi.get(id) });
  const u = unit.data;

  if (unit.isError && !u) {
    return (
      <PageContainer>
        <ErrorState
          title={t('stock.units.detail.loadFailed')}
          onRetry={() => void unit.refetch()}
        />
      </PageContainer>
    );
  }

  const columns: ColumnDef<UnitHistoryEntry, unknown>[] = [
    {
      id: 'date',
      header: t('stock.units.detail.columns.date'),
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'event',
      header: t('stock.units.detail.columns.event'),
      cell: ({ row }) => (
        <span>
          {t(`stock.types.${row.original.type}`)}
          {row.original.reason && <> · {t(`stock.reasons.${row.original.reason}`)}</>}
        </span>
      ),
    },
    {
      id: 'branch',
      header: t('stock.units.detail.columns.branch'),
      cell: ({ row }) => row.original.branch_name,
    },
    {
      id: 'document',
      header: t('stock.units.detail.columns.document'),
      cell: ({ row }) => <span dir="ltr">{row.original.source_number ?? ''}</span>,
    },
    {
      id: 'party',
      header: t('stock.units.detail.columns.party'),
      cell: ({ row }) => <span dir="auto">{row.original.party_name ?? ''}</span>,
    },
    {
      id: 'by',
      header: t('stock.units.detail.columns.by'),
      cell: ({ row }) => row.original.created_by_name ?? '',
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.units.detail.title', { serial: u?.serial ?? '' })}
        actions={
          <>
            {u && (
              <Link
                to={`/inventory/movements?serial=${encodeURIComponent(u.serial)}`}
                className="btn btn-ghost"
              >
                {t('stock.units.detail.allMovements')}
              </Link>
            )}
            <Link to="/inventory/units" className="btn btn-ghost">
              {t('stock.units.detail.back')}
            </Link>
          </>
        }
      />
      {u && (
        <Card className="mb-4 p-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="type-label">{t('stock.units.detail.product')}</dt>
              <dd>
                {getLanguage() === 'en' && u.name_en ? u.name_en : u.name_ar}{' '}
                <span className="type-caption" dir="ltr">
                  {u.sku}
                </span>
              </dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.units.detail.branch')}</dt>
              <dd>{u.branch_name}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.units.detail.status')}</dt>
              <dd>
                <Badge tone={UNIT_TONE[u.status]}>{t(`stock.units.statuses.${u.status}`)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.units.detail.cost')}</dt>
              <dd>{formatMoney(u.cost)}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.units.detail.since')}</dt>
              <dd>{formatDate(u.created_at)}</dd>
            </div>
            {u.purchase_invoice_number && (
              <div>
                <dt className="type-label">{t('stock.units.detail.invoice')}</dt>
                <dd>
                  <span dir="ltr">{u.purchase_invoice_number}</span>
                  {u.supplier_name ? ` · ${u.supplier_name}` : ''}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}
      <h2 className="type-section-title mb-2">{t('stock.units.detail.history')}</h2>
      <DataTable
        caption={t('stock.units.detail.historyTitle', { serial: u?.serial ?? '' })}
        columns={columns}
        data={u?.history ?? []}
        loading={unit.isPending}
        error={unit.isError}
        onRetry={() => void unit.refetch()}
        getRowId={(h) => h.id}
        empty={{ title: t('stock.units.detail.empty') }}
      />
    </PageContainer>
  );
}
