import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditProfile, Customer } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useCan } from '@/features/me/useCan';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { creditApi, creditKeys } from '@/services/creditApi';
import { useAuthStore } from '@/store/authStore';
import {
  STATUS_TONE as SURVEY_STATUS_TONE,
  statusLabel as surveyStatusLabel,
  useCanOpenSurveys,
} from '@/pages/surveys/surveyShared';
import { t, type TranslationKey } from '@/i18n';
import CreditExceptionDialog from './CreditExceptionDialog';
import CreditLimitDialog from './CreditLimitDialog';

function Figure({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd className={tone === 'danger' ? 'text-danger-600' : undefined}>{children}</dd>
    </div>
  );
}

function ScoreBar({ profile }: { profile: CreditProfile }) {
  const below = profile.score < profile.min_score;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {t('credit.card.scoreValue', { score: formatNumber(profile.score) })}
        </p>
        <Badge tone={below ? 'warning' : 'success'}>
          {t('credit.card.scoreMin', { min: formatNumber(profile.min_score) })}
        </Badge>
      </div>
      <div
        role="progressbar"
        aria-label={t('credit.card.scoreTitle')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={profile.score}
        className="relative mt-2 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={below ? 'h-full bg-ochre-500' : 'h-full bg-success-600'}
          style={{ width: `${profile.score}%` }}
        />
      </div>
      {below && (
        <p role="note" className="type-caption mt-2">
          {t('credit.card.scoreBelow')}
        </p>
      )}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {profile.components.map((c) => (
          <li key={c.key} className="flex justify-between gap-3">
            <span>
              {t(`credit.score.${c.key}` as TranslationKey)}
              {c.key === 'residence' && (
                <span className="type-caption block">{residenceSource(profile, c.value)}</span>
              )}
            </span>
            <span className="type-caption tabular-nums">
              {t('credit.card.points', {
                points: formatNumber(c.points),
                weight: formatNumber(c.weight),
              })}
            </span>
          </li>
        ))}
      </ul>
      <LatestSurvey profile={profile} />
    </div>
  );
}

/**
 * R05: where the residence points come from. The server fills residence from the latest approved
 * survey still valid (value = its score / 100); the profile names the newest survey of any status.
 */
function residenceSource(profile: CreditProfile, value: number): string {
  if (value <= 0) return t('surveys.credit.residenceNone');
  const latest = profile.latest_survey;
  const score = formatNumber(Math.round(value * 100));
  if (latest?.status === 'approved' && latest.decided_at) {
    return t('surveys.credit.residenceFromSurvey', { date: formatDate(latest.decided_at), score });
  }
  return t('surveys.credit.residenceScoreOnly', { score });
}

function LatestSurvey({ profile }: { profile: CreditProfile }) {
  const latest = profile.latest_survey;
  const canOpen = useCanOpenSurveys();
  if (!latest) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2">
      <span className="type-caption">{t('surveys.credit.latest')}</span>
      <Badge tone={SURVEY_STATUS_TONE[latest.status]}>{surveyStatusLabel(latest.status)}</Badge>
      {latest.survey_score !== null && (
        <span className="type-caption">
          {t('surveys.credit.latestScore', { score: formatNumber(latest.survey_score) })}
        </span>
      )}
      {canOpen && (
        <Link to={`/customers/surveys/${latest.id}`} className="text-brand-700 hover:underline">
          {t('surveys.credit.open')}
        </Link>
      )}
    </p>
  );
}

function Behaviour({ profile }: { profile: CreditProfile }) {
  const b = profile.behaviour;
  const empty = b.due_lines === 0 && b.open_contracts === 0 && b.completed_contracts === 0;
  if (empty) return <p className="type-caption">{t('credit.card.noHistory')}</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Figure label={t('credit.card.onTime')}>
        {b.on_time_pct === null ? (
          <span className="type-caption">{t('credit.card.noHistory')}</span>
        ) : (
          t('credit.card.onTimeValue', {
            pct: formatNumber(b.on_time_pct),
            count: formatNumber(b.due_lines),
          })
        )}
      </Figure>
      <Figure label={t('credit.card.maxDaysLate')}>
        {b.max_days_late === null ? (
          <span className="type-caption">{t('credit.card.noHistory')}</span>
        ) : (
          t('credit.card.daysValue', { count: formatNumber(b.max_days_late) })
        )}
      </Figure>
      <Figure
        label={t('credit.card.overdueAmount')}
        {...(b.overdue_lines > 0 ? { tone: 'danger' as const } : {})}
      >
        <span className="num">{formatMoney(b.current_overdue_amount)}</span>
      </Figure>
      <Figure label={t('credit.card.overdueLines')}>{formatNumber(b.overdue_lines)}</Figure>
      <Figure label={t('credit.card.openContracts')}>{formatNumber(b.open_contracts)}</Figure>
      <Figure label={t('credit.card.completedContracts')}>
        {formatNumber(b.completed_contracts)}
      </Figure>
    </dl>
  );
}

/**
 * R03 (D72): the customer's credit under the customer details. The limit, exposure, available
 * credit, score and behaviour all come from the server; this card only shows them. credit.approve
 * sets the limit; a cashier (sale.create) or a manager can ask for an exception.
 */
export default function CustomerCreditCard({ customer }: { customer: Customer }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canSet = useCan('credit.approve');
  const canSell = useCan('sale.create');
  const [limitOpen, setLimitOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const profile = useQuery({
    queryKey: creditKeys.profile(orgId, customer.id),
    queryFn: () => creditApi.profile(customer.id),
  });
  const data = profile.data;
  const refresh = () =>
    cache.invalidateQueries({ queryKey: creditKeys.profile(orgId, customer.id) });
  const blocked = customer.status === 'blocked';
  const canRequest = (canSet || canSell) && !blocked;

  return (
    <Card
      title={t('credit.card.title')}
      description={t('credit.card.hint')}
      actions={
        data && (canSet || canRequest) ? (
          <span className="flex flex-wrap items-center gap-2">
            {canSet && (
              <Button size="sm" variant="secondary" onClick={() => setLimitOpen(true)}>
                {t('credit.card.setLimit')}
              </Button>
            )}
            {canRequest && (
              <Button size="sm" variant="secondary" onClick={() => setRequestOpen(true)}>
                {t('credit.card.requestException')}
              </Button>
            )}
            {canRequest && (
              <Link to="/customers/credit-exceptions" className="btn btn-ghost btn-sm">
                {t('credit.card.openExceptions')}
              </Link>
            )}
          </span>
        ) : undefined
      }
    >
      {profile.isPending ? (
        <LoadingState />
      ) : profile.isError || !data ? (
        <ErrorState title={t('credit.card.loadFailed')} onRetry={() => void profile.refetch()} />
      ) : (
        <div className="space-y-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Figure label={t('credit.card.limit')}>
              <span className="num type-section-title">{formatMoney(data.credit_limit)}</span>
              {data.suggested_limit !== null && (
                <span className="type-caption block">
                  {t('credit.card.suggested', { amount: formatMoney(data.suggested_limit) })}
                </span>
              )}
            </Figure>
            <Figure label={t('credit.card.exposure')}>
              <span className="num type-section-title">{formatMoney(data.exposure)}</span>
            </Figure>
            <Figure label={t('credit.card.available')}>
              <span className="num type-section-title">{formatMoney(data.available)}</span>
              {data.over_limit_by !== '0.00' && (
                <span role="alert" className="block text-danger-600">
                  {t('credit.card.overLimit', { amount: formatMoney(data.over_limit_by) })}
                </span>
              )}
            </Figure>
          </dl>
          {blocked && canSell && (
            <p role="note" className="type-caption">
              {t('credit.card.blockedHint')}
            </p>
          )}
          <section aria-label={t('credit.card.scoreTitle')}>
            <h3 className="type-caption mb-2">{t('credit.card.scoreTitle')}</h3>
            <ScoreBar profile={data} />
          </section>
          <section aria-label={t('credit.card.behaviourTitle')}>
            <h3 className="type-caption mb-2">{t('credit.card.behaviourTitle')}</h3>
            <Behaviour profile={data} />
          </section>
          <section aria-label={t('credit.card.historyTitle')}>
            <h3 className="type-caption mb-2">{t('credit.card.historyTitle')}</h3>
            {data.limit_history.length === 0 ? (
              <p className="type-caption">{t('credit.card.noChanges')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.limit_history.map((h) => (
                  <li key={`${h.at}-${h.to}`} className="py-2">
                    <p>
                      {t('credit.card.historyLine', {
                        from: formatMoney(h.from),
                        to: formatMoney(h.to),
                      })}
                    </p>
                    <p className="type-caption">
                      <bdi>{formatDateTime(h.at)}</bdi>
                      {h.by_name ? ` · ${t('credit.card.by', { name: h.by_name })}` : ''} ·{' '}
                      {h.reason ?? t('credit.card.noReason')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {data && canSet && limitOpen && (
        <CreditLimitDialog
          key={data.credit_limit}
          open={limitOpen}
          onOpenChange={setLimitOpen}
          customerId={customer.id}
          profile={data}
          onSaved={() => void refresh()}
        />
      )}
      {canRequest && requestOpen && (
        <CreditExceptionDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          customerId={customer.id}
        />
      )}
    </Card>
  );
}
