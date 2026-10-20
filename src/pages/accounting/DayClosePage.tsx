import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DayClose } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import Notice from '@/components/ui/Notice';
import Skeleton from '@/components/ui/Skeleton';
import { useCan } from '@/features/me/useCan';
import { formatBusinessDate, formatDateTime } from '@/lib/format';
import { dayCloseKeys, dayClosesApi } from '@/services/dayClosesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  CloseDayDialog,
  DayClosePrint,
  DayTotals,
  IssuesList,
  ReopenDayDialog,
} from './DayCloseParts';
import { alreadyClosedId, dayCloseError, dayHref, hasBlockers } from './dayCloseShared';

/**
 * K04 day view. `/accounting/day-close/:branchId/:date`: the live numbers of an open or reopened
 * day with its problems and the close; a closed day answers its stored close instead.
 * `/accounting/day-close/closed/:id`: a stored close (snapshot, drift, print, reopen).
 */
export default function DayClosePage() {
  const { branchId, date, id } = useParams();
  if (id) return <ClosedDay id={id} />;
  if (!branchId || !date) return null;
  return <OpenDay branchId={branchId} date={date} />;
}

function Back() {
  return (
    <Link to="/accounting/day-close" className="btn btn-ghost">
      {t('dayClose.view.back')}
    </Link>
  );
}

function OpenDay({ branchId, date }: { branchId: string; date: string }) {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const canClose = useCan('day.close');
  const [closing, setClosing] = useState(false);
  const preview = useQuery({
    queryKey: dayCloseKeys.preview(orgId, branchId, date),
    queryFn: () => dayClosesApi.preview(branchId, date),
    retry: false,
  });
  const closedId = alreadyClosedId(preview.error);
  const goClosed = useCallback(
    (close: DayClose) => navigate(`/accounting/day-close/closed/${close.id}`, { replace: true }),
    [navigate],
  );
  const reload = () => void cache.invalidateQueries({ queryKey: dayCloseKeys.all(orgId) });

  if (closedId) {
    // Closed in the meantime (or from the list): the stored close is the answer.
    return <ClosedDay id={closedId} />;
  }
  const p = preview.data;
  return (
    <PageContainer>
      <PageHeader
        title={t('dayClose.title')}
        description={
          p ? `${p.branch_name} · ${formatBusinessDate(p.business_date)}` : formatBusinessDate(date)
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Back />
            <Button variant="secondary" onClick={reload}>
              {t('dayClose.view.refresh')}
            </Button>
            {p && canClose && (
              <Button
                variant="danger"
                onClick={() => setClosing(true)}
                disabled={hasBlockers(p.issues)}
              >
                {t('dayClose.view.close')}
              </Button>
            )}
          </div>
        }
      />
      {preview.isPending ? (
        <Skeleton className="h-64" />
      ) : preview.isError || !p ? (
        <ErrorState
          title={preview.isError ? dayCloseError(preview.error) : t('dayClose.view.loadFailed')}
          onRetry={() => void preview.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={p.status === 'reopened' ? 'danger' : 'warning'}>
              {t(`dayClose.status.${p.status}`)}
            </Badge>
            {p.is_today && <Badge tone="brand">{t('dayClose.view.today')}</Badge>}
          </div>
          {p.status === 'reopened' && p.last_close?.reopened_by && (
            <Notice tone="info">
              {t('dayClose.view.reopenedBy', {
                name: p.last_close.reopened_by.name ?? '',
                at: p.last_close.reopened_at ? formatDateTime(p.last_close.reopened_at) : '',
                reason: p.last_close.reopen_reason ?? '',
              })}
            </Notice>
          )}
          {canClose && hasBlockers(p.issues) && (
            <Notice tone="error">{t('dayClose.view.blocked')}</Notice>
          )}
          <Card title={t('dayClose.issues.title')}>
            <IssuesList issues={p.issues} date={p.business_date} />
          </Card>
          <DayTotals totals={p.totals} />
          {p.last_close && (
            <details className="rounded-panel border border-line bg-surface p-5">
              <summary className="type-section-title cursor-pointer">
                {t('dayClose.view.lastClose')}
              </summary>
              <p className="type-caption my-3">{t('dayClose.view.lastCloseHint')}</p>
              <DayTotals totals={p.last_close.totals} />
            </details>
          )}
          {closing && (
            <CloseDayDialog
              preview={p}
              onClose={() => setClosing(false)}
              onChanged={() => {
                setClosing(false);
                reload();
              }}
              onClosed={goClosed}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}

function ClosedDay({ id }: { id: string }) {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const canReopen = useCan('day.reopen');
  const [reopening, setReopening] = useState(false);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);
  const got = useQuery({
    queryKey: dayCloseKeys.one(orgId, id),
    queryFn: () => dayClosesApi.get(id),
  });
  const c = got.data;
  return (
    <PageContainer>
      <PageHeader
        title={t('dayClose.title')}
        description={c ? `${c.branch_name} · ${formatBusinessDate(c.business_date)}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Back />
            {c?.status === 'closed' && (
              <Button variant="secondary" onClick={() => setPrinting(true)}>
                {t('dayClose.view.print')}
              </Button>
            )}
            {c?.status === 'closed' && canReopen && (
              <Button variant="danger" onClick={() => setReopening(true)}>
                {t('dayClose.view.reopen')}
              </Button>
            )}
          </div>
        }
      />
      {got.isPending ? (
        <Skeleton className="h-64" />
      ) : got.isError || !c ? (
        <ErrorState
          title={got.isError ? dayCloseError(got.error) : t('dayClose.view.loadFailed')}
          onRetry={() => void got.refetch()}
        />
      ) : c.status === 'reopened' ? (
        // Reopened: the live day is the page to show.
        <ReopenedRedirect close={c} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{t('dayClose.status.closed')}</Badge>
            <span className="type-caption">
              {t('dayClose.view.closedBy', {
                name: c.closed_by.name ?? '',
                at: formatDateTime(c.closed_at),
              })}
            </span>
          </div>
          {c.note && (
            <p className="type-body">
              <span className="type-caption">{t('dayClose.view.note')}: </span>
              {c.note}
            </p>
          )}
          {c.drift && <Notice tone="error">{t('dayClose.view.drift')}</Notice>}
          <Card title={t('dayClose.issues.title')}>
            <IssuesList issues={c.issues} date={c.business_date} />
          </Card>
          <DayTotals totals={c.totals} />
          {printing && <DayClosePrint close={c} onDone={stopPrinting} />}
          {reopening && (
            <ReopenDayDialog
              close={c}
              onClose={() => setReopening(false)}
              onReopened={() => navigate(dayHref(c.branch_id, c.business_date), { replace: true })}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}

function ReopenedRedirect({ close }: { close: DayClose }) {
  return (
    <Notice tone="info">
      <Link to={dayHref(close.branch_id, close.business_date)} className="underline">
        {t('dayClose.status.reopened')}
      </Link>
    </Notice>
  );
}
