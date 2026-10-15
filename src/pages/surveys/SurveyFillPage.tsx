import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SURVEY_CHECKLIST,
  SURVEY_CRITERIA,
  SURVEY_LOW_ACCURACY_M,
  SURVEY_MAX_PHOTOS,
  SurveyAnswersBody,
  SurveySubmitBody,
  Uuid,
  type Survey,
  type SurveyChecklistItem,
  type SurveyCriterion,
  type SurveyVisitType,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useMe } from '@/features/me/useMe';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatDateTime, formatNumber } from '@/lib/format';
import { creditKeys } from '@/services/creditApi';
import { surveyKeys, surveysApi } from '@/services/surveysApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  NOTES_MAX,
  changedAnswers,
  checklistLabel,
  clearDraft,
  criterionLabel,
  draftFromSurvey,
  loadDraft,
  missingParts,
  storeDraft,
  surveyError,
  visitTypeLabel,
  type SurveyDraft,
} from './surveyShared';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const VISIT_TYPES: SurveyVisitType[] = ['home', 'work'];
/** The phone may take its time to get a good fix outdoors. */
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

type GeoState = 'idle' | 'capturing' | 'denied' | 'unavailable' | 'unsupported';

interface Upload {
  key: number;
  name: string;
  preview: string;
  progress: number;
  state: 'uploading' | 'done' | 'failed';
}

/** A big tap target that behaves as one option of a radio group. */
function Choice({
  selected,
  label,
  onSelect,
  children,
}: {
  selected: boolean;
  label?: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'min-h-11 min-w-11 rounded-md border px-2 text-center font-medium tabular-nums',
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface hover:border-brand-500',
      )}
    >
      {children}
    </button>
  );
}

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

/**
 * R05 (D75): the assignee fills the survey on a phone at the customer's door: visit type, six
 * criteria (1-10), the checklist, notes, the GPS fix and photos (uploaded at once, private). Save
 * sends only what changed; Submit needs everything. Unsaved answers stay on this device per survey.
 */
export default function SurveyFillPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const me = useMe();
  const survey = useQuery({
    queryKey: surveyKeys.one(orgId, id),
    queryFn: () => surveysApi.get(id),
    enabled: validId,
  });
  const data = survey.data;

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
  if (!data || !me.data) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  const blocker =
    data.assigned_to.id !== me.data.employee.id
      ? t('surveys.fill.notAssignee')
      : data.status !== 'assigned'
        ? t('surveys.fill.notOpen')
        : null;
  if (blocker) {
    // Not this employee's open survey (any more): no answers for it stay on this device.
    if (data.status !== 'assigned') clearDraft(data.id);
    return (
      <PageContainer>
        <EmptyState
          role="alert"
          title={blocker}
          action={
            <Link to={`/customers/surveys/${data.id}`} className="btn btn-secondary">
              {t('surveys.fill.back')}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  return <FillForm key={data.id} survey={data} />;
}

function FillForm({ survey }: { survey: Survey }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [restored] = useState(() => {
    const stored = loadDraft(survey.id, survey.updated_at);
    return stored && Object.keys(changedAnswers(stored, survey)).length > 0 ? stored : null;
  });
  const [draft, setDraft] = useState<SurveyDraft>(() => restored ?? draftFromSurvey(survey));
  const [geo, setGeo] = useState<GeoState>('idle');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const previews = useRef<string[]>([]);

  // Stored against the version on screen: a save or upload that changes the survey moves it on.
  useEffect(
    () => storeDraft(survey.id, survey.updated_at, draft),
    [survey.id, survey.updated_at, draft],
  );
  // The local previews are object URLs: free them when the page goes away.
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const uploading = uploads.filter((u) => u.state === 'uploading').length;
  const photos = survey.photos_count;
  const room = SURVEY_MAX_PHOTOS - photos - uploading;
  const missing = missingParts(draft, photos);
  const lowAccuracy = !!draft.gps && draft.gps.gps_accuracy_m > SURVEY_LOW_ACCURACY_M;

  function update(patch: Partial<SurveyDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  const setScore = (key: SurveyCriterion, n: number) =>
    setDraft((d) => ({ ...d, scores: { ...d.scores, [key]: n } }));
  const setCheck = (key: SurveyChecklistItem, v: boolean) =>
    setDraft((d) => ({ ...d, checklist: { ...d.checklist, [key]: v } }));

  function refresh(next: Survey) {
    cache.setQueryData(surveyKeys.one(orgId, survey.id), next);
    void cache.invalidateQueries({ queryKey: surveyKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: surveyKeys.ofCustomer(orgId, survey.customer.id) });
    void cache.invalidateQueries({ queryKey: creditKeys.profile(orgId, survey.customer.id) });
  }

  function capture() {
    if (!('geolocation' in navigator)) {
      setGeo('unsupported');
      return;
    }
    setGeo('capturing');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          gps: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            gps_accuracy_m: Math.round(pos.coords.accuracy * 100) / 100,
            client_captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
          },
        });
        setGeo('idle');
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      GEO_OPTIONS,
    );
  }

  function patchUpload(key: number, patch: Partial<Upload>) {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function uploadOne(file: File) {
    const key = nextKey.current++;
    const preview = URL.createObjectURL(file);
    previews.current.push(preview);
    setUploads((list) => [
      ...list,
      { key, name: file.name, preview, progress: 0, state: 'uploading' },
    ]);
    try {
      await surveysApi.uploadPhoto(survey.id, file, (p) => patchUpload(key, { progress: p }));
      patchUpload(key, { state: 'done', progress: 1 });
      await cache.invalidateQueries({ queryKey: surveyKeys.one(orgId, survey.id) });
    } catch (err) {
      patchUpload(key, { state: 'failed' });
      notify.error(surveyError(err));
    }
  }

  function pick(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (chosen.length > room) {
      notify.error(t('surveys.fill.photos.max', { max: formatNumber(SURVEY_MAX_PHOTOS) }));
    }
    for (const file of chosen.slice(0, Math.max(0, room))) void uploadOne(file);
  }

  async function save() {
    const body = changedAnswers(draft, survey);
    if (Object.keys(body).length === 0) {
      notify.success(t('surveys.fill.nothingToSave'));
      return;
    }
    const parsed = SurveyAnswersBody.safeParse(body);
    if (!parsed.success) {
      notify.error(t('surveys.errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      refresh(await surveysApi.save(survey.id, parsed.data));
      notify.success(t('surveys.fill.saved'));
    } catch (err) {
      notify.error(surveyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    const parsed = SurveySubmitBody.safeParse(changedAnswers(draft, survey));
    if (!parsed.success) {
      notify.error(t('surveys.errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      const next = await surveysApi.submit(survey.id, parsed.data);
      clearDraft(survey.id);
      refresh(next);
      notify.success(t('surveys.fill.submitted'));
      void navigate(`/customers/surveys/${survey.id}`, { replace: true });
    } catch (err) {
      notify.error(surveyError(err));
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  const customer = survey.customer;
  const place = [customer.address, customer.city].filter(Boolean).join(' · ');

  return (
    <PageContainer>
      <PageHeader
        title={t('surveys.fill.title')}
        description={customer.full_name}
        breadcrumbs={[
          { label: t('surveys.page.back'), to: '/customers/surveys' },
          { label: t('surveys.fill.back'), to: `/customers/surveys/${survey.id}` },
        ]}
      />
      <div className="mx-auto max-w-2xl space-y-5">
        {restored && <Notice tone="info">{t('surveys.fill.draftRestored')}</Notice>}

        <Card title={t('surveys.fill.customerTitle')}>
          <div className="space-y-3">
            <p className="font-medium">{customer.full_name}</p>
            {customer.phones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customer.phones.map((phone) => (
                  <a
                    key={phone}
                    href={`tel:${phone}`}
                    className="btn btn-secondary min-h-11"
                    aria-label={t('surveys.fill.call', { phone })}
                  >
                    <span dir="ltr">{phone}</span>
                  </a>
                ))}
              </div>
            )}
            <p>
              <span className="type-caption block">{t('surveys.fill.address')}</span>
              {place || <span className="type-caption">{t('surveys.fill.noAddress')}</span>}
            </p>
            {survey.due_date && (
              <p className="type-caption">
                {t('surveys.fill.dueDate', { date: formatBusinessDate(survey.due_date) })}
              </p>
            )}
            {survey.instructions && (
              <div>
                <span className="type-caption block">{t('surveys.fill.instructions')}</span>
                <p className="whitespace-pre-wrap">{survey.instructions}</p>
              </div>
            )}
          </div>
        </Card>

        <Card title={t('surveys.visitType.label')}>
          <div
            role="radiogroup"
            aria-label={t('surveys.visitType.label')}
            className="grid grid-cols-2 gap-2"
          >
            {VISIT_TYPES.map((v) => (
              <Choice
                key={v}
                selected={draft.visit_type === v}
                onSelect={() => update({ visit_type: v })}
              >
                {visitTypeLabel(v)}
              </Choice>
            ))}
          </div>
        </Card>

        <Card title={t('surveys.fill.criteriaTitle')} description={t('surveys.fill.criteriaHint')}>
          <div className="space-y-5">
            {SURVEY_CRITERIA.map((key) => (
              <fieldset key={key}>
                <legend className="mb-2 font-medium">{criterionLabel(key)}</legend>
                <div
                  role="radiogroup"
                  aria-label={criterionLabel(key)}
                  className="grid grid-cols-5 gap-2"
                >
                  {SCORES.map((n) => (
                    <Choice
                      key={n}
                      selected={draft.scores[key] === n}
                      label={t('surveys.fill.scoreOption', {
                        criterion: criterionLabel(key),
                        n: formatNumber(n),
                      })}
                      onSelect={() => setScore(key, n)}
                    >
                      {formatNumber(n)}
                    </Choice>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>

        <Card title={t('surveys.fill.checklistTitle')}>
          <ul className="divide-y divide-line">
            {SURVEY_CHECKLIST.map((key) => (
              <li key={key} className="space-y-2 py-3">
                <p>{checklistLabel(key)}</p>
                <div
                  role="radiogroup"
                  aria-label={checklistLabel(key)}
                  className="grid grid-cols-2 gap-2"
                >
                  <Choice
                    selected={draft.checklist[key] === true}
                    onSelect={() => setCheck(key, true)}
                  >
                    {t('surveys.fill.yes')}
                  </Choice>
                  <Choice
                    selected={draft.checklist[key] === false}
                    onSelect={() => setCheck(key, false)}
                  >
                    {t('surveys.fill.no')}
                  </Choice>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('surveys.fill.notes')}>
          <Textarea
            label={t('surveys.fill.notes')}
            help={t('surveys.fill.notesHelp')}
            maxLength={NOTES_MAX}
            rows={4}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </Card>

        <Card
          title={t('surveys.fill.location.title')}
          description={t('surveys.fill.location.hint')}
        >
          <div className="space-y-3" aria-live="polite">
            {draft.gps ? (
              <p>
                {t('surveys.fill.location.accuracy', {
                  m: formatNumber(Math.round(draft.gps.gps_accuracy_m)),
                })}
                <span className="type-caption block">
                  {t('surveys.fill.location.captured', {
                    at: formatDateTime(draft.gps.client_captured_at),
                  })}
                </span>
              </p>
            ) : (
              <p className="type-caption">{t('surveys.fill.location.none')}</p>
            )}
            {lowAccuracy && (
              <Notice tone="error">
                {t('surveys.fill.location.low', { m: formatNumber(SURVEY_LOW_ACCURACY_M) })}
              </Notice>
            )}
            {geo === 'denied' && <Notice tone="error">{t('surveys.fill.location.denied')}</Notice>}
            {geo === 'unavailable' && (
              <Notice tone="error">{t('surveys.fill.location.unavailable')}</Notice>
            )}
            {geo === 'unsupported' && (
              <Notice tone="error">{t('surveys.fill.location.unsupported')}</Notice>
            )}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              loading={geo === 'capturing'}
              loadingLabel={t('surveys.fill.location.capturing')}
              onClick={capture}
            >
              {draft.gps || geo === 'denied' || geo === 'unavailable'
                ? t('surveys.fill.location.retry')
                : t('surveys.fill.location.capture')}
            </Button>
          </div>
        </Card>

        <Card
          title={t('surveys.fill.photos.title')}
          description={t('surveys.fill.photos.hint', { max: formatNumber(SURVEY_MAX_PHOTOS) })}
          actions={
            <span className="type-caption tabular-nums">
              {t('surveys.fill.photos.count', {
                count: formatNumber(photos + uploading),
                max: formatNumber(SURVEY_MAX_PHOTOS),
              })}
            </span>
          }
        >
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              aria-label={t('surveys.fill.photos.add')}
              onChange={(e) => pick(e.target.files)}
            />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              disabled={room <= 0}
              onClick={() => fileRef.current?.click()}
            >
              {t('surveys.fill.photos.add')}
            </Button>
            {room <= 0 && (
              <p role="note" className="type-caption">
                {t('surveys.fill.photos.max', { max: formatNumber(SURVEY_MAX_PHOTOS) })}
              </p>
            )}
            {uploads.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {uploads.map((u, index) => (
                  <li key={u.key} className="space-y-1">
                    <img
                      src={u.preview}
                      alt={t('surveys.fill.photos.preview', { n: formatNumber(index + 1) })}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                    <span
                      className={cn(
                        'type-caption block',
                        u.state === 'failed' && 'text-danger-600',
                      )}
                    >
                      {u.state === 'uploading'
                        ? t('surveys.fill.photos.uploading', {
                            pct: formatNumber(Math.round(u.progress * 100)),
                          })
                        : u.state === 'done'
                          ? t('surveys.fill.photos.uploaded')
                          : t('surveys.fill.photos.failed')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {missing.length > 0 && (
          <div role="note" className="type-caption">
            <p>{t('surveys.fill.missingTitle')}</p>
            <ul className="list-disc ps-5">
              {missing.map((m) => (
                <li key={m}>{t(`surveys.fill.missing.${m}`)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pb-6">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={saving}
            onClick={() => void save()}
          >
            {t('surveys.fill.save')}
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={saving || missing.length > 0 || uploading > 0}
            onClick={() => setConfirming(true)}
          >
            {t('surveys.fill.submit')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('surveys.fill.submitTitle')}
        description={t('surveys.fill.submitDescription')}
        confirmLabel={t('surveys.fill.submit')}
        loading={saving}
        onConfirm={() => void submit()}
      />
    </PageContainer>
  );
}
