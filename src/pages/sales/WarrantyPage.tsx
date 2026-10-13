import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ClaimStatus,
  type WarrantyClaim,
  type WarrantyLine,
  type WarrantyLookupQuery,
  type WarrantyClaimsQuery,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import DataTable from '@/components/ui/DataTable';
import { useBranches } from '@/features/me/useBranches';
import { useAuthStore } from '@/store/authStore';
import { warrantyApi, warrantyKeys } from '@/services/warrantyApi';
import { t } from '@/i18n';
import {
  ClaimStatusBadge,
  WarrantyBadge,
  WarrantyLineDetails,
  SerialChain,
} from './WarrantyShared';
import OpenWarrantyClaimDialog from './OpenWarrantyClaimDialog';
export default function WarrantyPage() {
  const [tab, setTab] = useState<'lookup' | 'claims'>('lookup'),
    [kind, setKind] = useState<'serial' | 'phone' | 'sale_number'>('serial'),
    [value, setValue] = useState(''),
    [query, setQuery] = useState<WarrantyLookupQuery | null>(null),
    [selected, setSelected] = useState<WarrantyLine | null>(null);
  const [status, setStatus] = useState(''),
    [branch, setBranch] = useState(''),
    [expired, setExpired] = useState(''),
    [page, setPage] = useState(1);
  const org = useAuthStore((s) => s.orgId),
    branches = useBranches();
  const lookup = useQuery({
    queryKey: [...warrantyKeys.all(org), 'lookup', query],
    queryFn: () => warrantyApi.lookup(query!),
    enabled: !!query,
  });
  const params: WarrantyClaimsQuery = {
    page,
    page_size: 20,
    ...(status ? { status: ClaimStatus.parse(status) } : {}),
    ...(branch ? { branch_id: branch } : {}),
    ...(expired ? { out_of_warranty: expired === 'true' } : {}),
  };
  const claims = useQuery({
    queryKey: [...warrantyKeys.all(org), 'list', params],
    queryFn: () => warrantyApi.list(params),
    enabled: tab === 'claims',
    placeholderData: keepPreviousData,
  });
  const columns: ColumnDef<WarrantyClaim>[] = [
    {
      accessorKey: 'number',
      header: t('sales.warranty.number'),
      cell: ({ row }) => (
        <Link className="btn-link" to={'/warranty/claims/' + row.original.id}>
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'product',
      header: t('sales.warranty.product'),
      cell: ({ row }) => row.original.line.product.name,
    },
    {
      id: 'branch',
      header: t('sales.warranty.branch'),
      cell: ({ row }) => row.original.line.branch.name,
    },
    {
      accessorKey: 'status',
      header: t('sales.warranty.state'),
      cell: ({ row }) => <ClaimStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'out_of_warranty',
      header: t('sales.warranty.coverage'),
      cell: ({ row }) => <WarrantyBadge covered={!row.original.out_of_warranty} />,
    },
  ];
  return (
    <PageContainer>
      <PageHeader title={t('sales.warranty.title')} />
      <div className="mb-4 flex gap-2" role="tablist" aria-label={t('sales.warranty.title')}>
        {(['lookup', 'claims'] as const).map((k) => (
          <Button
            key={k}
            role="tab"
            aria-selected={tab === k}
            tabIndex={tab === k ? 0 : -1}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === 'Home'
                    ? 'lookup'
                    : e.key === 'End'
                      ? 'claims'
                      : tab === 'lookup'
                        ? 'claims'
                        : 'lookup';
                setTab(next);
                document.getElementById('warranty-tab-' + next)?.focus();
              }
            }}
            aria-controls={'warranty-' + k}
            id={'warranty-tab-' + k}
            variant={tab === k ? 'primary' : 'secondary'}
            onClick={() => setTab(k)}
          >
            {t(`sales.warranty.${k}`)}
          </Button>
        ))}
      </div>
      {tab === 'lookup' ? (
        <div role="tabpanel" id="warranty-lookup" aria-labelledby="warranty-tab-lookup">
          <Card className="mb-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim()) setQuery({ [kind]: value.trim() });
              }}
            >
              <Select
                label={t('sales.warranty.lookupBy')}
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                options={(['serial', 'phone', 'sale_number'] as const).map((k) => ({
                  value: k,
                  label: t(`sales.warranty.key.${k}`),
                }))}
              />
              <FormField
                label={t('sales.warranty.search')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <Button type="submit" loading={lookup.isFetching}>
                {t('sales.warranty.lookup')}
              </Button>
            </form>
            <FormError message={lookup.isError ? t('sales.warranty.loadFailed') : ''} />
          </Card>
          <div className="space-y-4">
            {lookup.data?.items.map((line) => (
              <Card key={line.sale_line_id} title={line.product.name}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <WarrantyBadge covered={line.in_warranty} />
                  <Button onClick={() => setSelected(line)}>{t('sales.warranty.open')}</Button>
                </div>
                <WarrantyLineDetails line={line} />
                <div className="mt-4">
                  <SerialChain line={line} />
                </div>
                <ul className="mt-3 space-y-2">
                  {line.claims.map((c) => (
                    <li key={c.id}>
                      <Link className="btn-link me-3" to={'/warranty/claims/' + c.id}>
                        {c.number}
                      </Link>
                      <ClaimStatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {query && lookup.isSuccess && !lookup.data.items.length && (
              <p role="status">{t('sales.warranty.empty')}</p>
            )}
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="warranty-claims" aria-labelledby="warranty-tab-claims">
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label={t('sales.warranty.state')}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('sales.warranty.all') },
                  ...ClaimStatus.options.map((s) => ({
                    value: s,
                    label: t(`sales.warranty.status.${s}`),
                  })),
                ]}
              />
              <Select
                label={t('sales.warranty.branch')}
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('sales.warranty.all') },
                  ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
              <Select
                label={t('sales.warranty.coverage')}
                value={expired}
                onChange={(e) => {
                  setExpired(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: '', label: t('sales.warranty.all') },
                  { value: 'false', label: t('sales.warranty.in') },
                  { value: 'true', label: t('sales.warranty.out') },
                ]}
              />
            </div>
          </Card>
          <DataTable
            caption={t('sales.warranty.claims')}
            data={claims.data?.items ?? []}
            columns={columns}
            getRowId={(c) => c.id}
            loading={claims.isPending}
            error={claims.isError}
            onRetry={() => void claims.refetch()}
            empty={{ title: t('sales.warranty.empty') }}
            server={{ page, pageSize: 20, total: claims.data?.total ?? 0, onPageChange: setPage }}
          />
        </div>
      )}
      {selected && (
        <OpenWarrantyClaimDialog
          key={selected.sale_line_id}
          line={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </PageContainer>
  );
}
