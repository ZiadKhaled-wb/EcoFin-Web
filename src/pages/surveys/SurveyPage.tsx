import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SURVEY_CHECKLIST,
  SURVEY_CRITERIA,
  SURVEY_LOW_ACCURACY_M,
  SurveyCancelBody,
  SurveyDecisionBody,
  SurveyReassignBody,
  Uuid,
  type Survey,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { useMe } from '@/features/me/useMe';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { creditKeys } from '@/services/creditApi';
import { surveyKeys, surveysApi } from '@/services/surveysApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  CANCEL_REASON_MAX,
  DECISION_NOTE_MAX,
  STATUS_TONE,
  checklistLabel,
  criterionLabel,
  mapsUrl,
  statusLabel,
  surveyError,
  visitTypeLabel,
} from './surveyShared';
import { useAssigneeOptions } from './useAssigneeOptions';

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('surveys.page.notFound')}
        description={t('surveys.page.notFoundHint')}
        action={
          <Link to="/customers/surveys" className="btn btn-secondary">
            {t('surveys.page.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * R05 (D75): one field survey, for everyone allowed to read it. A decider (survey.decide) approves
 * or rejects a submitted survey (a rejection needs a note; the assignee can't decide their own,
 * except the owner). A manager (survey.assign) reassigns or cancels an open one. The assignee
 * fills it. Photos open only with customer.view_pii (signed links); others see the count.
 */
export default function SurveyPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const cache = useQueryClient();
  const canAssign = useCan('survey.assign');
  const canDecide = useCan('survey.decide');
  const canSeePii = useCan('customer.view_pii');
  const me = useMe();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const survey = useQuery({
    queryKey: surveyKeys.one(orgId, id),
    queryFn: () => surveysApi.get(id),
    enabled: validId,
  });
  const data = survey.data;
  const photos = useQuery({
    queryKey: surveyKeys.photos(orgId, id),
    queryFn: () => surveysApi.photos(id),
    enabled: validId && canSeePii && !!data && data.photos_count > 0,
  });

  function refresh(next: Survey) {
    cache.setQueryData(surveyKeys.one(orgId, id), next);
    void cache.invalidateQueries({ queryKey: surveyKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: surveyKeys.ofCustomer(orgId, next.customer.id) });
    void cache.invalidateQueries({ queryKey: creditKeys.profile(orgId, next.customer.id) });
  }

  async function view(fileId: string) {
    try {
      const { url } = await surveysApi.photoUrl(fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      notify.error(surveyError(err));
    }
  }

  if (!validId) return <NotFound />;
  if (survey.isError && !data) {
    if (survey.error instanceof ApiError && survey.error.code === 'SURVEY_NOT_FOUND') {
      return <NotFound />;
    }
    return (
      <PageContainer>
        <ErrorState title={t('surveys.errors.failed')} onRetry={() => void survey.refetch()} />
      </PageContainer>
    );
  }
  if (!data) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  const myId = me.data?.employee.id;
  const isAssignee = myId !== undefined && data.assigned_to.id === myId;
  const open = data.status === 'assigned' || data.status === 'submitted';
  const showDecide = canDecide && data.status === 'submitted' && (!isAssignee || isOwner);
  const none = <span className="type-caption">{t('surveys.page.noValue')}</span>;

  return (
    <PageContainer>
      <PageHeader
        title={t('surveys.page.title', { name: data.customer.full_name })}
        breadcrumbs={[
          { label: t('surveys.list.back'), to: '/customers' },
          { label: t('surveys.page.back'), to: '/customers/surveys' },
          { label: data.customer.full_name },
        ]}
        actions={
          <>
            {isAssignee && data.status === 'assigned' && (
              <Link to={`/customers/surveys/${data.id}/fill`} className="btn btn-primary">
                {t('surveys.page.fill')}
              </Link>
            )}
            {showDecide && (
              <>
                <Button onClick={() => setDeciding('approve')}>{t('surveys.page.approve')}</Button>
                <Button variant="danger" onClick={() => setDeciding('reject')}>
                  {t('surveys.page.reject')}
                </Button>
              </>
            )}
            {canAssign && data.status === 'assigned' && (
              <Button variant="secondary" onClick={() => setReassigning(true)}>
                {t('surveys.page.reassign')}
              </Button>
            )}
            {canAssign && open && (
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                {t('surveys.page.cancel')}
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <Card title={t('surveys.page.details')}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label={t('surveys.list.columns.status')}>
              <Badge tone={STATUS_TONE[data.status]}>{statusLabel(data.status)}</Badge>
            </Detail>
            <Detail label={t('surveys.page.customer')}>
              <Link
                to={`/customers/${data.customer.id}`}
                className="text-brand-700 hover:underline"
              >
                {data.customer.full_name}
              </Link>
            </Detail>
            <Detail label={t('surveys.visitType.label')}>{visitTypeLabel(data.visit_type)}</Detail>
            <Detail label={t('surveys.page.assignee')}>{data.assigned_to.full_name}</Detail>
            <Detail label={t('surveys.page.dueDate')}>
              {data.due_date ? <bdi>{formatBusinessDate(data.due_date)}</bdi> : none}
            </Detail>
            <Detail label={t('surveys.page.createdAt')}>
              <bdi>{formatDate(data.created_at)}</bdi>
              {data.created_by && (
                <span className="type-caption block">
                  {t('surveys.page.createdBy')}: {data.created_by.full_name}
                </span>
              )}
            </Detail>
            {data.submitted_at && (
              <Detail label={t('surveys.page.submittedAt')}>
                <bdi>{formatDateTime(data.submitted_at)}</bdi>
              </Detail>
            )}
            {data.instructions && (
              <Detail label={t('surveys.page.instructions')}>
                <span className="whitespace-pre-wrap">{data.instructions}</span>
              </Detail>
            )}
          </dl>
        </Card>

        {(data.decided_at || data.status === 'cancelled') && (
          <Card title={t('surveys.page.decision')}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label={t('surveys.list.columns.status')}>
                <Badge tone={STATUS_TONE[data.status]}>{statusLabel(data.status)}</Badge>
              </Detail>
              {data.decided_by && (
                <Detail label={t('surveys.page.decidedBy')}>{data.decided_by.full_name}</Detail>
              )}
              {data.decided_at && (
                <Detail label={t('surveys.page.decidedAt')}>
                  <bdi>{formatDateTime(data.decided_at)}</bdi>
                </Detail>
              )}
              {data.valid_until && (
                <Detail label={t('surveys.page.validUntil')}>
                  <bdi>{formatBusinessDate(data.valid_until)}</bdi>
                </Detail>
              )}
              {data.decision_note && (
                <Detail
                  label={
                    data.status === 'cancelled'
                      ? t('surveys.page.cancelReason')
                      : t('surveys.page.decisionNote')
                  }
                >
                  <span className="whitespace-pre-wrap">{data.decision_note}</span>
                </Detail>
              )}
            </dl>
          </Card>
        )}

        <Card title={t('surveys.page.answers')}>
          <div className="space-y-5">
            <p>
              <span className="type-caption">{t('surveys.page.score')}: </span>
              {data.survey_score === null ? (
                none
              ) : (
                <span className="font-medium tabular-nums">
                  {t('surveys.page.scoreValue', { score: formatNumber(data.survey_score) })}
                </span>
              )}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SURVEY_CRITERIA.map((key) => (
                <li key={key} className="flex justify-between gap-3">
                  <span>{criterionLabel(key)}</span>
                  <span className="tabular-nums">
                    {data.scores[key] === undefined ? (
                      <span className="type-caption">{t('surveys.page.unanswered')}</span>
                    ) : (
                      formatNumber(data.scores[key])
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <section aria-label={t('surveys.page.checklist')}>
              <h3 className="type-caption mb-2">{t('surveys.page.checklist')}</h3>
              <ul className="divide-y divide-line">
                {SURVEY_CHECKLIST.map((key) => {
                  const answer = data.checklist[key];
                  return (
                    <li key={key} className="flex justify-between gap-3 py-2">
                      <span>{checklistLabel(key)}</span>
                      {answer === undefined ? (
                        <span className="type-caption">{t('surveys.page.unanswered')}</span>
                      ) : (
                        <Badge tone={answer ? 'success' : 'danger'}>
                          {answer ? t('surveys.fill.yes') : t('surveys.fill.no')}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section aria-label={t('surveys.page.notes')}>
              <h3 className="type-caption mb-2">{t('surveys.page.notes')}</h3>
              {data.notes ? <p className="whitespace-pre-wrap">{data.notes}</p> : none}
            </section>
          </div>
        </Card>

        <Card title={t('surveys.page.location')}>
          {!data.gps ? (
            <p className="type-caption">{t('surveys.fill.location.none')}</p>
          ) : (
            <div className="space-y-3">
              {data.gps_low_accuracy && (
                <Notice tone="error">
                  {t('surveys.page.lowAccuracy', { m: formatNumber(SURVEY_LOW_ACCURACY_M) })}
                </Notice>
              )}
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label={t('surveys.page.accuracy')}>
                  {t('surveys.page.accuracyValue', {
                    m: formatNumber(Math.round(data.gps.gps_accuracy_m)),
                  })}
                </Detail>
                <Detail label={t('surveys.page.capturedAt')}>
                  <bdi>{formatDateTime(data.gps.client_captured_at)}</bdi>
                </Detail>
              </dl>
              <a
                href={mapsUrl(data.gps.lat, data.gps.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                {t('surveys.page.openMaps')}
              </a>
            </div>
          )}
        </Card>

        <Card title={t('surveys.page.photos')}>
          <p className="type-caption mb-3">
            {t('surveys.page.photosCount', { count: formatNumber(data.photos_count) })}
          </p>
          {data.photos_count === 0 ? (
            <p>{t('surveys.page.photosEmpty')}</p>
          ) : !canSeePii ? (
            <p role="note">{t('surveys.page.photosHidden')}</p>
          ) : photos.isPending ? (
            <LoadingState />
          ) : (
            <ul className="divide-y divide-line">
              {(photos.data ?? []).map((photo, index) => (
                <li key={photo.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {t('surveys.page.photoName', { n: formatNumber(index + 1) })}
                    <span className="type-caption ms-2">{formatDate(photo.createdAt)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void view(photo.id)}>
                    {t('surveys.page.viewPhoto')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {deciding && (
        <DecideDialog
          key={deciding}
          survey={data}
          decision={deciding}
          onClose={() => setDeciding(null)}
          onDone={refresh}
        />
      )}
      {reassigning && (
        <ReassignDialog survey={data} onClose={() => setReassigning(false)} onDone={refresh} />
      )}
      {cancelling && (
        <CancelDialog survey={data} onClose={() => setCancelling(false)} onDone={refresh} />
      )}
    </PageContainer>
  );
}

function DecideDialog({
  survey,
  decision,
  onClose,
  onDone,
}: {
  survey: Survey;
  decision: 'approve' | 'reject';
  onClose: () => void;
  onDone: (s: Survey) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reject = decision === 'reject';

  async function confirm() {
    setError('');
    const text = note.trim();
    const parsed = SurveyDecisionBody.safeParse({ decision, ...(text ? { note: text } : {}) });
    if (!parsed.success) {
      setError(reject ? t('surveys.decide.noteRequired') : t('surveys.errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      const next = await surveysApi.decide(survey.id, parsed.data);
      notify.success(reject ? t('surveys.decide.rejected') : t('surveys.decide.approved'));
      onDone(next);
      onClose();
    } catch (err) {
      setError(surveyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={reject ? t('surveys.decide.rejectTitle') : t('surveys.decide.approveTitle')}
      description={t('surveys.decide.description', {
        name: survey.customer.full_name,
        score: survey.survey_score === null ? '—' : formatNumber(survey.survey_score),
      })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
        className="space-y-4"
        noValidate
      >
        <Textarea
          label={t('surveys.decide.note')}
          help={reject ? t('surveys.decide.noteHelpReject') : t('surveys.decide.noteHelpApprove')}
          maxLength={DECISION_NOTE_MAX}
          rows={3}
          required={reject}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" variant={reject ? 'danger' : 'primary'} disabled={saving}>
            {reject ? t('surveys.decide.confirmReject') : t('surveys.decide.confirmApprove')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('surveys.decide.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReassignDialog({
  survey,
  onClose,
  onDone,
}: {
  survey: Survey;
  onClose: () => void;
  onDone: (s: Survey) => void;
}) {
  const assignees = useAssigneeOptions(true);
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const options = assignees.options.filter((o) => o.value !== survey.assigned_to.id);

  async function save() {
    setError('');
    const parsed = SurveyReassignBody.safeParse({ assigned_to: assignee });
    if (!parsed.success) {
      setError(t('surveys.errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      const next = await surveysApi.reassign(survey.id, parsed.data);
      notify.success(t('surveys.reassign.done'));
      onDone(next);
      onClose();
    } catch (err) {
      setError(surveyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('surveys.reassign.title')}
      description={t('surveys.reassign.description')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
        noValidate
      >
        {assignees.selfOnly && <Notice tone="info">{t('surveys.assign.selfOnly')}</Notice>}
        {assignees.failed && <Notice tone="error">{t('surveys.assign.assigneesFailed')}</Notice>}
        <Select
          label={t('surveys.assign.assignee')}
          placeholder={t('surveys.assign.assigneePlaceholder')}
          help={t('surveys.assign.assigneeHelp')}
          options={options}
          value={assignee}
          required
          disabled={assignees.loading}
          onChange={(e) => setAssignee(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || assignee === ''}>
            {t('surveys.reassign.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('surveys.assign.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({
  survey,
  onClose,
  onDone,
}: {
  survey: Survey;
  onClose: () => void;
  onDone: (s: Survey) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setError('');
    const parsed = SurveyCancelBody.safeParse({ reason });
    if (!parsed.success) {
      setError(t('surveys.cancelDialog.reasonRequired'));
      return;
    }
    setSaving(true);
    try {
      const next = await surveysApi.cancel(survey.id, parsed.data);
      notify.success(t('surveys.cancelDialog.done'));
      onDone(next);
      onClose();
    } catch (err) {
      setError(surveyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('surveys.cancelDialog.title')}
      description={t('surveys.cancelDialog.description')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
        className="space-y-4"
        noValidate
      >
        <Textarea
          label={t('surveys.cancelDialog.reason')}
          help={t('surveys.cancelDialog.reasonHelp')}
          maxLength={CANCEL_REASON_MAX}
          rows={3}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={saving}>
            {t('surveys.cancelDialog.confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('surveys.cancelDialog.back')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
