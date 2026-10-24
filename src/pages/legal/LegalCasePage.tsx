import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Uuid,
  legalNextStatuses,
  type LegalCaseDetail,
  type LegalCaseStatus,
  type LegalHearing,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Textarea from '@/components/ui/Textarea';
import { useCan } from '@/features/me/useCan';
import { useNavAccess } from '@/features/me/useNavAccess';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney } from '@/lib/format';
import { legalApi, legalKeys } from '@/services/legalApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  AddHearingDialog,
  CloseCaseDialog,
  EditDetailsDialog,
  HearingOutcomeDialog,
} from './LegalCaseDialogs';
import LegalDocuments from './LegalDocuments';
import { legalError } from './legalErrors';
import { LegalStatusBadge } from './legalShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd dir="auto">{children}</dd>
    </div>
  );
}

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('legal.case.notFound')}
        description={t('legal.case.notFoundHint')}
      />
    </PageContainer>
  );
}

type Dialog = 'close' | 'edit' | 'hearing' | null;
/** The moves with a button of their own; closing has its own dialog. */
type MoveStatus = 'filed' | 'in_court' | 'judgment';

/**
 * L01 + N09 (D92): one legal case. Its details, the status moves the server allows, hearings,
 * append-only notes, papers (F14) and the money since the case was opened. There is no "collect"
 * button here: a payment is taken on the collection screen like any other, and the case only shows
 * it. Nothing on this page adds to what the customer owes (no fee, no cost: Islamic finance rule 4).
 */
export default function LegalCasePage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const canManage = useCan('legal.manage');
  const canSeeCustomer = useNavAccess('customers');
  const cache = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hearing, setHearing] = useState<LegalHearing | null>(null);
  const [moving, setMoving] = useState<LegalCaseStatus | null>(null);
  const [moveError, setMoveError] = useState('');
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState('');

  const query = useQuery({
    queryKey: legalKeys.detail(orgId, id),
    queryFn: () => legalApi.get(id),
    enabled: validId,
    retry: false,
  });
  const lawyers = useQuery({
    queryKey: legalKeys.lawyers(orgId),
    queryFn: legalApi.lawyers,
    enabled: isOwner,
  });

  /** Every write answers with the whole case: replace it in the cache and refresh the lists. */
  function replace(detail: LegalCaseDetail) {
    cache.setQueryData(legalKeys.detail(orgId, id), detail);
    void cache.invalidateQueries({ queryKey: ['legal', orgId, 'list'] });
    void cache.invalidateQueries({ queryKey: ['legal', orgId, 'lawyers'] });
    void cache.invalidateQueries({ queryKey: ['overdue', orgId] });
    setDialog(null);
    setHearing(null);
  }

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (
      query.error instanceof ApiError &&
      (query.error.status === 404 || query.error.code === 'LEGAL_CASE_NOT_FOUND')
    ) {
      return <NotFound />;
    }
    const moduleMissing =
      query.error instanceof ApiError && query.error.code === 'MODULE_NOT_IN_PLAN';
    return (
      <PageContainer>
        <ErrorState
          title={moduleMissing ? t('legal.errors.MODULE_NOT_IN_PLAN') : t('legal.case.loadFailed')}
          {...(moduleMissing ? {} : { onRetry: () => void query.refetch() })}
        />
      </PageContainer>
    );
  }
  const c = query.data;
  if (!c) return <LoadingState />;

  const open = c.status !== 'closed';
  const moves = legalNextStatuses(c.status).filter(
    (s): s is MoveStatus => s !== 'closed' && s !== 'preparing',
  );
  const fileMissing =
    c.status === 'preparing'
      ? !c.lawyer
        ? 'lawyer'
        : !c.court
          ? 'court'
          : !c.case_number
            ? 'number'
            : null
      : null;

  async function move(to: MoveStatus) {
    if (moving) return;
    setMoving(to);
    setMoveError('');
    try {
      replace(await legalApi.setStatus(id, { status: to }));
    } catch (err) {
      setMoveError(legalError(err));
    } finally {
      setMoving(null);
    }
  }

  async function addNote() {
    const text = note.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setNoteError('');
    try {
      replace(await legalApi.addNote(id, { note: text }));
      setNote('');
    } catch (err) {
      setNoteError(legalError(err));
    } finally {
      setNoteBusy(false);
    }
  }

  const moveLabel = (to: MoveStatus) =>
    c.status === 'judgment' && to === 'in_court' ? t('legal.move.appeal') : t(`legal.move.${to}`);

  return (
    <PageContainer>
      <PageHeader
        title={t('legal.case.title', { number: c.number })}
        breadcrumbs={[{ label: t('legal.title'), to: '/legal' }, { label: c.number }]}
        actions={
          canManage && open ? (
            <div className="flex flex-wrap gap-2">
              {moves.map((to) => (
                <Button
                  key={to}
                  variant="secondary"
                  loading={moving === to}
                  disabled={!!moving || (to === 'filed' && fileMissing !== null)}
                  onClick={() => void move(to)}
                >
                  {moveLabel(to)}
                </Button>
              ))}
              <Button variant="danger" disabled={!!moving} onClick={() => setDialog('close')}>
                {t('legal.close.button')}
              </Button>
            </div>
          ) : undefined
        }
      />
      {moveError && (
        <div className="mb-4">
          <FormError message={moveError} />
        </div>
      )}
      {canManage && c.status === 'preparing' && fileMissing && (
        <div className="mb-4">
          <Notice tone="info">{t(`legal.case.fileNeeds.${fileMissing}`)}</Notice>
        </div>
      )}
      <div className="space-y-4">
        <Card
          title={t('legal.case.details')}
          actions={
            canManage && open ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('edit')}>
                {t('legal.case.edit')}
              </Button>
            ) : undefined
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t('legal.columns.status')}>
              <LegalStatusBadge status={c.status} />
            </Fact>
            <Fact label={t('legal.columns.contract')}>
              <Link to={`/contracts/${c.contract.id}`} className="link num" dir="ltr">
                {c.contract.number}
              </Link>
            </Fact>
            <Fact label={t('legal.columns.customer')}>
              {canSeeCustomer ? (
                <Link to={`/customers/${c.customer.id}`} className="link">
                  <bdi>{c.customer.name}</bdi>
                </Link>
              ) : (
                <bdi>{c.customer.name}</bdi>
              )}
              {c.customer.phone && (
                <span className="type-caption block" dir="ltr">
                  {c.customer.phone}
                </span>
              )}
              {c.customer.status === 'blocked' && <Badge tone="danger">{t('legal.blocked')}</Badge>}
            </Fact>
            <Fact label={t('legal.fields.lawyer')}>{c.lawyer?.name ?? t('legal.noLawyer')}</Fact>
            <Fact label={t('legal.fields.court')}>{c.court ?? '—'}</Fact>
            <Fact label={t('legal.fields.caseType')}>{c.case_type ?? '—'}</Fact>
            <Fact label={t('legal.fields.caseNumber')}>{c.case_number ?? '—'}</Fact>
            <Fact label={t('legal.fields.openedOn')}>{formatBusinessDate(c.opened_on)}</Fact>
            <Fact label={t('legal.fields.claim')}>
              <span className="num">{formatMoney(c.claim_amount)}</span>
            </Fact>
            <Fact label={t('legal.columns.nextHearing')}>
              {c.next_hearing_date ? formatBusinessDate(c.next_hearing_date) : '—'}
            </Fact>
            {c.referral && (
              <Fact label={t('legal.fields.referral')}>
                {t('legal.case.fromReferral', {
                  date: formatBusinessDate(c.referral.business_date),
                  days: c.referral.days_late,
                })}
              </Fact>
            )}
            {c.created_by_name && (
              <Fact label={t('legal.fields.openedBy')}>{c.created_by_name}</Fact>
            )}
          </dl>
          {c.guarantors.length > 0 && (
            <div className="mt-4">
              <div className="type-caption">{t('legal.fields.guarantors')}</div>
              <ul className="type-body">
                {c.guarantors.map((g) => (
                  <li key={g.id} dir="auto">
                    {g.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.status === 'closed' && (
            <div className="mt-4 space-y-1">
              <div className="type-label">
                {t('legal.close.closedWith', {
                  kind: c.outcome_kind ? t(`legal.outcomeKind.${c.outcome_kind}`) : '—',
                })}
              </div>
              {c.outcome && (
                <p className="type-body" dir="auto">
                  {c.outcome}
                </p>
              )}
              {c.closed_at && <p className="type-caption">{formatDateTime(c.closed_at)}</p>}
              <p className="type-caption">{t('legal.close.noEffect')}</p>
            </div>
          )}
        </Card>

        <Card title={t('legal.amounts.title')} description={t('legal.amounts.hint')}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="legal-amounts">
            <Fact label={t('legal.amounts.claim')}>
              <span className="num">{formatMoney(c.amounts.claim_amount)}</span>
            </Fact>
            <Fact label={t('legal.amounts.total')}>
              <span className="num">{formatMoney(c.amounts.total_payable)}</span>
            </Fact>
            <Fact label={t('legal.amounts.paidBefore')}>
              <span className="num">{formatMoney(c.amounts.paid_before_case)}</span>
            </Fact>
            <Fact label={t('legal.amounts.paidSince')}>
              <span className="num">{formatMoney(c.amounts.paid_since_opened)}</span>
            </Fact>
            <Fact label={t('legal.amounts.remaining')}>
              <span className="num">{formatMoney(c.amounts.remaining)}</span>
            </Fact>
          </dl>
          <div className="mt-4 overflow-x-auto">
            <div className="type-label mb-2">{t('legal.amounts.collections')}</div>
            {c.collections_since_opened.length === 0 ? (
              <p className="type-caption">{t('legal.amounts.noCollections')}</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>{t('legal.amounts.receipt')}</th>
                    <th className={th}>{t('legal.amounts.date')}</th>
                    <th className={thNum}>{t('legal.amounts.amount')}</th>
                    <th className={th}>{t('legal.amounts.takenBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.collections_since_opened.map((r) => (
                    <tr key={r.receipt_id} className="border-b border-line last:border-0">
                      <td className={td}>
                        <span className="num" dir="ltr">
                          {r.number}
                        </span>
                      </td>
                      <td className={td}>{formatBusinessDate(r.date)}</td>
                      <td className={tdNum}>
                        <span className="num">{formatMoney(r.amount)}</span>
                      </td>
                      <td className={td} dir="auto">
                        {r.taken_by ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card
          title={t('legal.hearings.title')}
          actions={
            canManage && open ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('hearing')}>
                {t('legal.hearings.add')}
              </Button>
            ) : undefined
          }
        >
          {c.hearings.length === 0 ? (
            <p className="type-caption">{t('legal.hearings.empty')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {c.hearings.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div>
                    <div className="type-body">{formatBusinessDate(h.hearing_date)}</div>
                    {h.notes && (
                      <div className="type-caption" dir="auto">
                        {h.notes}
                      </div>
                    )}
                    <div className="type-caption" dir="auto">
                      {h.outcome
                        ? t('legal.hearings.outcomeIs', { outcome: h.outcome })
                        : t('legal.hearings.noOutcome')}
                    </div>
                  </div>
                  {canManage && open && (
                    <Button size="sm" variant="ghost" onClick={() => setHearing(h)}>
                      {t('legal.hearings.record')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('legal.notes.title')} description={t('legal.notes.hint')}>
          {canManage && (
            <div className="mb-4 space-y-2">
              <Textarea
                label={t('legal.notes.add')}
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
              <FormError message={noteError} />
              <Button
                size="sm"
                loading={noteBusy}
                disabled={!note.trim() || noteBusy}
                onClick={() => void addNote()}
              >
                {t('legal.notes.save')}
              </Button>
            </div>
          )}
          {c.notes.length === 0 ? (
            <p className="type-caption">{t('legal.notes.empty')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {c.notes.map((n) => (
                <li key={n.id} className="py-2">
                  <p className="type-body whitespace-pre-wrap" dir="auto">
                    {n.note}
                  </p>
                  <p className="type-caption" dir="auto">
                    {n.created_by_name ?? '—'} · {formatDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <LegalDocuments caseId={c.id} canUpload={canManage} />
      </div>

      {dialog === 'close' && (
        <CloseCaseDialog legalCase={c} onClose={() => setDialog(null)} onDone={replace} />
      )}
      {dialog === 'edit' && (
        <EditDetailsDialog
          legalCase={c}
          isOwner={isOwner}
          lawyers={lawyers.data?.items ?? []}
          onClose={() => setDialog(null)}
          onDone={replace}
        />
      )}
      {dialog === 'hearing' && (
        <AddHearingDialog legalCase={c} onClose={() => setDialog(null)} onDone={replace} />
      )}
      {hearing && (
        <HearingOutcomeDialog
          legalCase={c}
          hearing={hearing}
          onClose={() => setHearing(null)}
          onDone={replace}
        />
      )}
    </PageContainer>
  );
}
