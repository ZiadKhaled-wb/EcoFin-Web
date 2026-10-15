import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditException, CreditExceptionListQuery } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { creditApi, creditKeys } from '@/services/creditApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import { STATUS_TONE, creditError, reasonLabel } from './creditShared';

type Status = CreditExceptionListQuery['status'];
const NOTE_MAX = 500;
const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'cancelled', 'all'];

/**
 * R03 (D72): the credit exceptions of the shop, waiting ones first. A manager (credit.approve) approves
 * or rejects (a rejection needs a note); the requester can take a waiting request back. The requester
 * can't decide their own request, except the owner: the server enforces it, the button is only hidden.
 * Every number is the snapshot the server stored when the cashier asked.
 */
export default function CreditExceptionsPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const canDecide = useCan('credit.approve');
  const cache = useQueryClient();
  const [status, setStatus] = useState<Status>('pending');
  const [deciding, setDeciding] = useState<{ item: CreditException; approve: boolean } | null>(
    null,
  );
  const [cancelling, setCancelling] = useState<CreditException | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const list = useQuery({
    queryKey: creditKeys.exceptionList(orgId, status),
    queryFn: () => creditApi.list(status),
    refetchInterval: 15_000,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: creditKeys.exceptions(orgId) });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string }) =>
      creditApi.decide(v.id, { approve: v.approve, ...(v.note ? { note: v.note } : {}) }),
  });
  const cancel = useMutation({ mutationFn: (id: string) => creditApi.cancel(id) });

  function openDecision(item: CreditException, approve: boolean) {
    setDeciding({ item, approve });
    setNote('');
    setError('');
  }

  async function confirmDecision() {
    if (!deciding) return;
    const text = note.trim();
    if (!deciding.approve && text.length < 3) {
      setError(t('credit.exceptions.noteRequired'));
      return;
    }
    if (text.length > NOTE_MAX) {
      setError(t('credit.errors.validation'));
      return;
    }
    try {
      await decide.mutateAsync({
        id: deciding.item.id,
        approve: deciding.approve,
        ...(text ? { note: text } : {}),
      });
      notify.success(
        t(deciding.approve ? 'credit.exceptions.approved' : 'credit.exceptions.rejected'),
      );
      setDeciding(null);
      await refresh();
    } catch (err) {
      setError(creditError(err));
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    try {
      await cancel.mutateAsync(cancelling.id);
      notify.success(t('credit.exceptions.cancelled'));
      await refresh();
    } catch (err) {
      notify.error(creditError(err));
    } finally {
      setCancelling(null);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('credit.exceptions.title')}
        description={t('credit.exceptions.description')}
      />
      <div className="mb-4 max-w-xs">
        <Select
          label={t('credit.exceptions.filter')}
          value={status}
          options={STATUSES.map((value) => ({
            value,
            label:
              value === 'all'
                ? t('credit.exceptions.filterAll')
                : t(`credit.status.${value}` as TranslationKey),
          }))}
          onChange={(e) => setStatus(e.target.value as Status)}
        />
      </div>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title={t('credit.exceptions.loadFailed')} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('credit.exceptions.empty')}
          description={t('credit.exceptions.emptyHint')}
        />
      ) : (
        <ul className="space-y-4" aria-label={t('credit.exceptions.title')}>
          {items.map((item) => (
            <ExceptionCard
              key={item.id}
              item={item}
              canDecide={canDecide && (!item.mine || isOwner)}
              onDecide={openDecision}
              onCancel={setCancelling}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={deciding !== null}
        onOpenChange={(next) => {
          if (!next) setDeciding(null);
        }}
        title={t(
          deciding?.approve ? 'credit.exceptions.approveTitle' : 'credit.exceptions.rejectTitle',
        )}
        description={
          deciding?.approve
            ? t('credit.exceptions.approveHint', {
                name: deciding.item.customer_name ?? '',
                amount: formatMoney(deciding.item.financed_amount),
              })
            : t('credit.exceptions.rejectHint')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)}>
              {t('credit.exceptions.keep')}
            </Button>
            <Button
              variant={deciding?.approve ? 'primary' : 'danger'}
              loading={decide.isPending}
              onClick={() => void confirmDecision()}
            >
              {t(
                deciding?.approve
                  ? 'credit.exceptions.confirmApprove'
                  : 'credit.exceptions.confirmReject',
              )}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('credit.exceptions.noteLabel')}
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          required={deciding?.approve === false}
          error={error}
          onChange={(e) => setNote(e.target.value)}
        />
      </Dialog>

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(next) => {
          if (!next) setCancelling(null);
        }}
        title={t('credit.exceptions.cancelTitle')}
        description={t('credit.exceptions.cancelHint')}
        confirmLabel={t('credit.exceptions.cancel')}
        loading={cancel.isPending}
        onConfirm={() => void confirmCancel()}
      />
    </PageContainer>
  );
}

function ExceptionCard({
  item,
  canDecide,
  onDecide,
  onCancel,
}: {
  item: CreditException;
  canDecide: boolean;
  onDecide: (item: CreditException, approve: boolean) => void;
  onCancel: (item: CreditException) => void;
}) {
  const s = item.snapshot;
  const name = item.customer_name ?? '';
  const pending = item.status === 'pending';
  return (
    <li className="space-y-3 rounded-panel border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">
            <Link
              to={`/customers/${item.customer_id}`}
              aria-label={t('credit.exceptions.openCustomer', { name })}
              className="link"
            >
              {name}
            </Link>
          </p>
          <p className="type-caption">
            {item.mine
              ? t('credit.exceptions.requestedByYou')
              : t('credit.exceptions.requestedBy', { name: item.requested_by_name ?? '' })}{' '}
            · <bdi>{formatDateTime(item.requested_at)}</bdi>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[item.status]}>
            {t(`credit.status.${item.status}` as TranslationKey)}
          </Badge>
          {item.reasons.map((r) => (
            <Badge key={r} tone="warning">
              {reasonLabel(r)}
            </Badge>
          ))}
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-4">
        <div>
          <dt className="type-caption">{t('credit.exceptions.amount')}</dt>
          <dd className="num font-medium">{formatMoney(item.financed_amount)}</dd>
        </div>
        <div>
          <dt className="type-caption">{t('credit.exceptions.limit')}</dt>
          <dd className="num">{formatMoney(s.limit)}</dd>
        </div>
        <div>
          <dt className="type-caption">{t('credit.exceptions.exposure')}</dt>
          <dd className="num">{formatMoney(s.exposure)}</dd>
        </div>
        <div>
          <dt className="type-caption">{t('credit.exceptions.available')}</dt>
          <dd className="num">{formatMoney(s.available)}</dd>
        </div>
      </dl>
      <p className="type-caption">
        {t('credit.exceptions.score', {
          score: formatNumber(s.score),
          min: formatNumber(s.min_score),
        })}
      </p>
      {item.reason && (
        <p>
          <span className="type-caption">{t('credit.exceptions.reason')}: </span>
          {item.reason}
        </p>
      )}
      {item.decided_at && (
        <p className="type-caption">
          {t('credit.exceptions.decidedBy', { name: item.decided_by_name ?? '' })} ·{' '}
          <bdi>{formatDateTime(item.decided_at)}</bdi>
          {item.decision_note ? ` · ${t('credit.exceptions.note')}: ${item.decision_note}` : ''}
          {item.expires_at && item.status === 'approved' && !item.used
            ? ` · ${t('credit.exceptions.validUntil', { date: formatDateTime(item.expires_at) })}`
            : ''}
          {item.used ? ` · ${t('credit.exceptions.used')}` : ''}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap justify-end gap-3">
          {item.mine && (
            <Button variant="ghost" onClick={() => onCancel(item)}>
              {t('credit.exceptions.cancel')}
            </Button>
          )}
          {canDecide && (
            <>
              <Button variant="danger" onClick={() => onDecide(item, false)}>
                {t('credit.exceptions.reject')}
              </Button>
              <Button onClick={() => onDecide(item, true)}>{t('credit.exceptions.approve')}</Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
