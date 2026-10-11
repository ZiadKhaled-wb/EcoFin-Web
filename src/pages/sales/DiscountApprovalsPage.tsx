import { useState } from 'react';
import type { DiscountApproval } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import {
  useDecideApproval,
  usePendingDiscountApprovals,
} from '@/features/approvals/useDiscountApprovals';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getLanguage, t } from '@/i18n';
import { saleError } from './saleShared';

const NOTE_MAX = 500;
/** A number with its percent sign keeps its own direction inside Arabic text. */
const ltr = (text: string) => `⁦${text}⁩`;

/**
 * S03 (D65): the over-cap discount requests of the manager's branches, waiting for a decision.
 * The cashier asked from the POS; the manager approves or rejects here from their own session
 * (the requester can't decide their own request). Refreshes every 15 seconds while open.
 */
export default function DiscountApprovalsPage() {
  const pending = usePendingDiscountApprovals();
  const decide = useDecideApproval();
  const [deciding, setDeciding] = useState<{ item: DiscountApproval; approve: boolean } | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  function open(item: DiscountApproval, approve: boolean) {
    setDeciding({ item, approve });
    setNote('');
    setError(undefined);
  }

  async function confirm() {
    if (!deciding) return;
    const text = note.trim();
    if (text.length > NOTE_MAX) {
      setError(t('sales.errors.validation'));
      return;
    }
    try {
      await decide.mutateAsync({
        id: deciding.item.id,
        approve: deciding.approve,
        ...(text ? { note: text } : {}),
      });
      notify.success(t(deciding.approve ? 'sales.approvals.approved' : 'sales.approvals.rejected'));
      setDeciding(null);
    } catch (err) {
      setError(saleError(err));
    }
  }

  const items = pending.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.approvals.title')}
        description={t('sales.approvals.description')}
      />
      {pending.isPending ? (
        <LoadingState />
      ) : pending.isError ? (
        <ErrorState
          description={t('sales.approvals.loadFailed')}
          onRetry={() => void pending.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('sales.approvals.empty')}
          description={t('sales.approvals.emptyHint')}
        />
      ) : (
        <ul className="space-y-4" aria-label={t('sales.approvals.title')}>
          {items.map((item) => (
            <ApprovalCard key={item.id} item={item} onDecide={open} />
          ))}
        </ul>
      )}

      <Dialog
        open={deciding !== null}
        onOpenChange={(next) => {
          if (!next) setDeciding(null);
        }}
        title={t(
          deciding?.approve ? 'sales.approvals.approveTitle' : 'sales.approvals.rejectTitle',
        )}
        {...(deciding
          ? {
              description: t('sales.approvals.dialogDescription', {
                name: deciding.item.requested_by_name ?? '',
                pct: ltr(`${deciding.item.max_effective_pct}%`),
                cap: ltr(`${deciding.item.cap_pct}%`),
              }),
            }
          : {})}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)}>
              {t('sales.approvals.cancel')}
            </Button>
            <Button
              variant={deciding?.approve ? 'primary' : 'danger'}
              loading={decide.isPending}
              onClick={() => void confirm()}
            >
              {t(
                deciding?.approve
                  ? 'sales.approvals.confirmApprove'
                  : 'sales.approvals.confirmReject',
              )}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('sales.approvals.note')}
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          {...(error ? { error } : {})}
        />
      </Dialog>
    </PageContainer>
  );
}

function ApprovalCard({
  item,
  onDecide,
}: {
  item: DiscountApproval;
  onDecide: (item: DiscountApproval, approve: boolean) => void;
}) {
  const lang = getLanguage();
  const who = item.requested_by_name ?? '';
  return (
    <li className="space-y-3 rounded-panel border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">{t('sales.approvals.requestedBy', { name: who })}</p>
          <p className="type-caption">
            <bdi>{item.branch_name ?? ''}</bdi> · <bdi>{formatDateTime(item.requested_at)}</bdi>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning" className="tabular-nums">
            {t('sales.approvals.requested')}: <span dir="ltr">{item.max_effective_pct}%</span>
          </Badge>
          <Badge tone="neutral" className="tabular-nums">
            {t('sales.approvals.cap')}: <span dir="ltr">{item.cap_pct}%</span>
          </Badge>
          <Badge tone="brand" className="tabular-nums">
            {t('sales.approvals.discountTotal')}: {formatMoney(item.discount_total)}
          </Badge>
        </div>
      </div>
      <div>
        <p className="type-caption">{t('sales.approvals.lines')}</p>
        <ul className="list-disc ps-5">
          {item.lines.map((l) => (
            <li key={`${l.product_id}-${l.discount_amount}`}>
              {t('sales.approvals.line', {
                name: lang === 'ar' ? l.name_ar : (l.name_en ?? l.name_ar),
                quantity: l.quantity,
                discount: formatMoney(l.discount_amount),
                pct: ltr(`${l.effective_pct}%`),
              })}
            </li>
          ))}
        </ul>
      </div>
      {item.reason && (
        <p>
          <span className="type-caption">{t('sales.approvals.reason')}: </span>
          {item.reason}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="danger" onClick={() => onDecide(item, false)}>
          {t('sales.approvals.reject')}
        </Button>
        <Button onClick={() => onDecide(item, true)}>{t('sales.approvals.approve')}</Button>
      </div>
    </li>
  );
}
