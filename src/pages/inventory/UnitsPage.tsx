import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { UnitStatus, type UnitSummary } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Notice from '@/components/ui/Notice';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { unitKeys, unitsApi, type UnitSearchParams } from '@/services/unitsApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import RegisterUnitsDialog from './RegisterUnitsDialog';
import { UNIT_TONE } from './unitShared';

const PAGE_SIZE = 50;

/**
 * I04 serials (stock.view): serial search in my branches, and Register serials (stock.adjust).
 * `?serial=` (the header's "Find a serial" box) opens that unit straight away when it exists.
 */
export default function UnitsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = params.get('serial')?.trim() ?? '';
  const branches = useBranches();
  const canRegister = useCan('stock.adjust');
  const [searchInput, setSearchInput] = useState(wanted);
  const [search, setSearch] = useState(wanted);
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [registering, setRegistering] = useState(false);
  const [missing, setMissing] = useState('');

  // The exact serial from the header box: open it, or say it doesn't exist and list similar ones.
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    unitsApi
      .find(wanted)
      .then((unit) => alive && navigate(`/inventory/units/${unit.id}`, { replace: true }))
      .catch((err: unknown) => {
        if (alive && err instanceof ApiError && err.code === 'UNIT_NOT_FOUND') setMissing(wanted);
      });
    return () => {
      alive = false;
    };
  }, [wanted, navigate]);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query: UnitSearchParams = {
    ...(search ? { search } : {}),
    ...(status ? { status: status as UnitSearchParams['status'] } : {}),
    ...(branchId ? { branch_id: branchId } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: unitKeys.search(orgId, query),
    queryFn: () => unitsApi.search(query),
    placeholderData: keepPreviousData,
  });
  const name = (u: UnitSummary) => (getLanguage() === 'en' && u.name_en ? u.name_en : u.name_ar);

  const columns: ColumnDef<UnitSummary, unknown>[] = [
    {
      id: 'serial',
      header: t('stock.units.columns.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.serial}</span>,
    },
    {
      id: 'product',
      header: t('stock.units.columns.product'),
      cell: ({ row }) => (
        <span>
          <span className="block">{name(row.original)}</span>
          <span className="type-caption block" dir="ltr">
            {row.original.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'branch',
      header: t('stock.units.columns.branch'),
      cell: ({ row }) => row.original.branch_name,
    },
    {
      id: 'status',
      header: t('stock.units.columns.status'),
      cell: ({ row }) => (
        <Badge tone={UNIT_TONE[row.original.status]}>
          {t(`stock.units.statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('stock.units.columns.actions'),
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/inventory/units/${row.original.id}`)}
        >
          {t('stock.units.view')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.units.title')}
        actions={
          canRegister && (branches.data?.length ?? 0) > 0 ? (
            <Button onClick={() => setRegistering(true)}>{t('stock.units.register.open')}</Button>
          ) : undefined
        }
      />
      <p className="type-caption mb-4">{t('stock.units.subtitle')}</p>
      {missing && (
        <div className="mb-4">
          <Notice tone="info">{t('stock.units.notFound', { serial: missing })}</Notice>
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr] md:items-end">
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('stock.units.search')}
          placeholder={t('stock.units.search')}
        />
        <Select
          label={t('stock.units.status')}
          value={status}
          options={[
            { value: '', label: t('stock.units.allStatuses') },
            ...UnitStatus.options.map((s) => ({ value: s, label: t(`stock.units.statuses.${s}`) })),
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t('stock.branch')}
          value={branchId}
          options={[
            { value: '', label: t('stock.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption={t('stock.units.title')}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(u) => u.id}
        empty={{ title: t('stock.units.empty'), description: t('stock.units.emptyHint') }}
        server={{ page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage }}
      />
      {registering && (
        <RegisterUnitsDialog branches={branches.data ?? []} onClose={() => setRegistering(false)} />
      )}
    </PageContainer>
  );
}
