import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SURVEY_VALID_DAYS, type Customer } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useCan } from '@/features/me/useCan';
import { formatBusinessDate, formatDate, formatNumber } from '@/lib/format';
import { creditKeys } from '@/services/creditApi';
import { surveyKeys, surveysApi } from '@/services/surveysApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import AssignSurveyDialog from './AssignSurveyDialog';
import { STATUS_TONE, statusLabel, visitTypeLabel } from './surveyShared';

/**
 * R05 (D75): the customer's field surveys under the customer details, newest first. A manager
 * (survey.assign) assigns a new one; a blocked customer can't get one. A collector sees only the
 * surveys assigned to them (the server filters).
 */
export default function CustomerSurveysCard({ customer }: { customer: Customer }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canAssign = useCan('survey.assign');
  const [assigning, setAssigning] = useState(0);
  const blocked = customer.status === 'blocked';

  const list = useQuery({
    queryKey: surveyKeys.ofCustomer(orgId, customer.id),
    queryFn: () => surveysApi.ofCustomer(customer.id),
  });
  const items = list.data ?? [];
  const none = <span className="type-caption">{t('surveys.list.noValue')}</span>;

  function refresh() {
    void cache.invalidateQueries({ queryKey: surveyKeys.ofCustomer(orgId, customer.id) });
    void cache.invalidateQueries({ queryKey: surveyKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: creditKeys.profile(orgId, customer.id) });
  }

  return (
    <Card
      title={t('surveys.card.title')}
      description={t('surveys.card.hint', { days: formatNumber(SURVEY_VALID_DAYS) })}
      actions={
        canAssign &&
        !blocked && (
          <Button size="sm" variant="secondary" onClick={() => setAssigning((n) => n + 1)}>
            {t('surveys.card.assign')}
          </Button>
        )
      }
    >
      {blocked && canAssign && (
        <p role="note" className="type-caption mb-3">
          {t('surveys.card.blockedHint')}
        </p>
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title={t('surveys.card.loadFailed')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('surveys.card.empty')} description={t('surveys.card.emptyHint')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <caption className="sr-only">{t('surveys.card.title')}</caption>
            <thead>
              <tr className="type-caption text-start">
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('surveys.list.columns.status')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('surveys.list.columns.visitType')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('surveys.list.columns.assignee')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('surveys.list.columns.dueDate')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('surveys.list.columns.score')}
                </th>
                <th scope="col" className="py-2 text-start">
                  <span className="sr-only">{t('surveys.card.open')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pe-3">
                    <Badge tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</Badge>
                    <span className="type-caption block">{formatDate(s.created_at)}</span>
                  </td>
                  <td className="py-2 pe-3">{visitTypeLabel(s.visit_type)}</td>
                  <td className="py-2 pe-3">{s.assigned_to.full_name}</td>
                  <td className="py-2 pe-3">
                    {s.due_date ? <bdi>{formatBusinessDate(s.due_date)}</bdi> : none}
                  </td>
                  <td className="py-2 pe-3 tabular-nums">
                    {s.survey_score === null ? none : formatNumber(s.survey_score)}
                  </td>
                  <td className="py-2">
                    <Link
                      to={`/customers/surveys/${s.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {t('surveys.card.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {assigning > 0 && (
        <AssignSurveyDialog
          key={assigning}
          open
          onOpenChange={(open) => !open && setAssigning(0)}
          customer={customer}
          onDone={refresh}
        />
      )}
    </Card>
  );
}
