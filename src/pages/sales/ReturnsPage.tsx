import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BusinessDate, SalesReturnKind } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateInput from '@/components/ui/DateInput';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Select from '@/components/ui/Select';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { returnKeys, returnsApi, type ReturnListParams } from '@/services/returnsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';
const PAGE_SIZE = 20;

export function ReturnKindBadge({ kind }: { kind: SalesReturnKind }) {
  return (
    <Badge tone={kind === 'void' ? 'danger' : kind === 'exchange' ? 'brand' : 'warning'}>
      {t(`returns.kinds.${kind}`)}
    </Badge>
  );
}

/** S05 (D88): returns, voids and exchanges of the caller's branches; filters live in the URL. */
export default function ReturnsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const [search, setSearch] = useSearchParams();
  const from = BusinessDate.safeParse(search.get('from')).data;
  const to = BusinessDate.safeParse(search.get('to')).data;
  const kind = SalesReturnKind.safeParse(search.get('kind')).data;
  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);
  const params: ReturnListParams = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(kind ? { kind } : {}),
    page,
    page_size: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: returnKeys.list(orgId, params),
    queryFn: () => returnsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== 'page') next.delete('page');
    setSearch(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader title={t('returns.title')} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="type-label block" htmlFor="returns-from">
          {t('returns.list.from')}
          <DateInput
            id="returns-from"
            value={from ?? ''}
            onChange={(e) => set('from', e.target.value)}
          />
        </label>
        <label className="type-label block" htmlFor="returns-to">
          {t('returns.list.to')}
          <DateInput id="returns-to" value={to ?? ''} onChange={(e) => set('to', e.target.value)} />
        </label>
        <Select
          label={t('returns.list.kind')}
          value={kind ?? ''}
          options={[
            { value: '', label: t('returns.list.allKinds') },
            ...SalesReturnKind.options.map((k) => ({ value: k, label: t(`returns.kinds.${k}`) })),
          ]}
          onChange={(e) => set('kind', e.target.value)}
        />
      </div>
      {query.isError && !query.data ? (
        <ErrorState title={t('returns.list.loadFailed')} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <LoadingState />
      ) : !query.data.items.length ? (
        <EmptyState title={t('returns.list.empty')} description={t('returns.list.emptyHint')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('returns.title')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('returns.list.number')}</th>
                  <th className={th}>{t('returns.list.kind')}</th>
                  <th className={th}>{t('returns.list.sale')}</th>
                  <th className={th}>{t('returns.list.date')}</th>
                  <th className={th}>{t('returns.list.branch')}</th>
                  <th className={th}>{t('returns.list.customer')}</th>
                  <th className={thNum}>{t('returns.list.total')}</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className={td}>
                      <Link to={`/sales/returns/${r.id}`} className="link" dir="ltr">
                        {r.number}
                      </Link>
                    </td>
                    <td className={td}>
                      <ReturnKindBadge kind={r.kind} />
                    </td>
                    <td className={td}>
                      <Link to={`/sales/${r.sale_id}`} className="link" dir="ltr">
                        {r.sale_number}
                      </Link>
                    </td>
                    <td className={td}>{formatBusinessDate(r.business_date)}</td>
                    <td className={td} dir="auto">
                      {r.branch.name}
                    </td>
                    <td className={td} dir="auto">
                      {r.customer?.name ?? ''}
                    </td>
                    <td className={tdNum}>{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => set('page', String(page - 1))}
            >
              ‹
            </Button>
            <Button
              variant="secondary"
              disabled={page * PAGE_SIZE >= query.data.total_count}
              onClick={() => set('page', String(page + 1))}
            >
              ›
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  );
}
