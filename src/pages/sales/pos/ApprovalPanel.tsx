import type { RefObject } from 'react';
import Button from '@/components/ui/Button';
import FormError from '@/components/ui/FormError';
import type { CartApproval } from './useCartApproval';
import { t } from '@/i18n';

/** A number with its percent sign keeps its own direction inside Arabic text. */
const pct = (value: string) => `⁦${value}%⁩`;

/**
 * S06 over S03 (D65): the sale answered "this discount is above your limit". The cashier asks a
 * manager, waits (the request is read again every 3 seconds), and goes on once it is approved.
 */
export default function ApprovalPanel({
  approval,
  error,
  panelRef,
  onAsk,
}: {
  approval: CartApproval;
  error: string;
  /** The screen gives the panel's first button the focus when the panel opens. */
  panelRef: RefObject<HTMLElement | null>;
  onAsk: () => void;
}) {
  const { status, cap } = approval;
  const decided = approval.approval;
  return (
    <section
      ref={panelRef}
      aria-label={t('sales.pos.approval.title')}
      className="space-y-2 rounded-control border border-line-strong bg-ochre-50 p-3"
    >
      <h3 className="type-label">{t('sales.pos.approval.title')}</h3>
      {cap && cap.cap_pct !== '' && (
        <p className="type-body">
          {t('sales.pos.approval.aboveCap', {
            pct: pct(cap.effective_pct),
            cap: pct(cap.cap_pct),
          })}
        </p>
      )}
      {status === null || status === 'cancelled' ? (
        <div className="flex flex-wrap gap-2">
          <Button loading={approval.asking} onClick={onAsk}>
            {t('sales.pos.approval.ask')}
          </Button>
          <Button variant="secondary" onClick={approval.drop}>
            {t('sales.pos.approval.change')}
          </Button>
        </div>
      ) : status === 'pending' ? (
        <>
          <p role="status" className="type-body">
            {t('sales.pos.approval.waiting')}
          </p>
          <Button variant="secondary" onClick={approval.drop}>
            {t('sales.pos.approval.cancel')}
          </Button>
        </>
      ) : status === 'approved' ? (
        <p role="status" className="type-body">
          {t('sales.pos.approval.approved', { name: decided?.decided_by_name ?? '' })}
        </p>
      ) : (
        <>
          <p role="status" className="type-body">
            {t('sales.pos.approval.rejected', { name: decided?.decided_by_name ?? '' })}
          </p>
          {decided?.decision_note && (
            <p className="type-body" dir="auto">
              {decided.decision_note}
            </p>
          )}
          <Button variant="secondary" onClick={approval.drop}>
            {t('sales.pos.approval.change')}
          </Button>
        </>
      )}
      <FormError message={error} />
    </section>
  );
}
