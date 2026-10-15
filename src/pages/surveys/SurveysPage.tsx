import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useCan } from '@/features/me/useCan';
import { formatBusinessDate, formatNumber } from '@/lib/format';
import { surveyKeys, surveysApi, type SurveyListParams } from '@/services/surveysApi';
import { shopToday } from '@/pages/purchasing/purchaseShared';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { STATUS_TONE, isOverdue, statusLabel, visitTypeLabel } from './surveyShared';

type Tab = 'mine' | 'review' | 'all';
const PAGE_SIZE = 25;

const PARAMS: Record<Tab, SurveyListParams> = {
  mine: { mine: true },
  review: { status: 'submitted' },
  all: {},
};

/**
 * R05 (D75): the shop's field surveys. Tabs: the ones assigned to me (a collector's only view), the
 * submitted ones waiting for a decision (survey.decide) and all of them (survey.assign or
 * survey.decide). The server filters again: a collector never gets someone else's survey.
 */
export default function SurveysPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const canAssign = useCan('survey.assign');
  const canDecide = useCan('survey.decide');
  const canSubmit = useCan('survey.submit');
  const tabs: Tab[] = [
    ...(canSubmit ? (['mine'] as const) : []),
    ...(canDecide ? (['review'] as const) : []),
    ...(canAssign || canDecide ? (['all'] as const) : []),
  ];
  const fallback: Tab = canDecide ? 'review' : canAssign ? 'all' : 'mine';
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = chosen && tabs.includes(chosen) ? chosen : fallback;
  const [page, setPage] = useState(1);
  const today = shopToday();

  const params: SurveyListParams = { ...PARAMS[tab], page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: surveyKeys.list(orgId, params),
    queryFn: () => surveysApi.list(params),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  const none = <span className="type-caption">{t('surveys.list.noValue')}</span>;

  function choose(next: Tab) {
    setChosen(next);
    setPage(1);
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('surveys.list.title')}
        description={t('surveys.list.description')}
        breadcrumbs={[
          { label: t('surveys.list.back'), to: '/customers' },
          { label: t('surveys.list.title') },
        ]}
      />
      {tabs.length > 1 && (
        <div role="tablist" aria-label={t('surveys.list.tabsLabel')} className="mb-4 flex gap-2">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => choose(key)}
            >
              {t(`surveys.list.tabs.${key}`)}
            </button>
          ))}
        </div>
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title={t('surveys.list.loadFailed')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('surveys.list.empty')} description={t('surveys.list.emptyHint')} />
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-start">
              <caption className="sr-only">{t(`surveys.list.tabs.${tab}`)}</caption>
              <thead>
                <tr className="type-caption text-start">
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.customer')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.visitType')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.assignee')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.dueDate')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.status')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start">
                    {t('surveys.list.columns.score')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((s) => {
                  const late = isOverdue(s, today);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/customers/surveys/${s.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {s.customer.full_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{visitTypeLabel(s.visit_type)}</td>
                      <td className="px-4 py-3">{s.assigned_to.full_name}</td>
                      <td className={late ? 'px-4 py-3 text-danger-600' : 'px-4 py-3'}>
                        {s.due_date ? <bdi>{formatBusinessDate(s.due_date)}</bdi> : none}
                        {late && (
                          <span className="block type-caption">{t('surveys.list.overdue')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {s.survey_score === null ? none : formatNumber(s.survey_score)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('surveys.list.previous')}
              </Button>
              <span className="type-caption">
                {t('surveys.list.pageOf', {
                  page: formatNumber(page),
                  pages: formatNumber(pages),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('surveys.list.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
