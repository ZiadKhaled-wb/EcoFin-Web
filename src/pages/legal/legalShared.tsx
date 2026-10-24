import { Link } from 'react-router-dom';
import type { LegalCaseStatus } from '@ziadkhaled-wb/contracts';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import { useCan } from '@/features/me/useCan';
import { t } from '@/i18n';

/**
 * L01 + N09 (D92): shared pieces of the legal screens. The status colours follow the old screen
 * (open = orange, in court = blue, judged = green, closed = grey), mapped onto the five statuses
 * of the new case: preparing, filed, in court, judgment, closed. Nothing here ever shows a fee or
 * a cost: a case does not change what a customer owes (Islamic finance rule 4).
 */

const STATUS_TONE: Record<LegalCaseStatus, BadgeTone> = {
  preparing: 'warning',
  filed: 'brand',
  in_court: 'brand',
  judgment: 'success',
  closed: 'neutral',
};

export function LegalStatusBadge({ status }: { status: LegalCaseStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{t(`legal.status.${status}`)}</Badge>;
}

/**
 * N09: "Legal: {status}" on a contract, on the customer account's contract rows and on the overdue
 * list. It links to the case for whoever can read legal cases (the server shows a lawyer only the
 * cases assigned to them and answers "not found" for the others).
 */
export function LegalFlagBadge({
  legalCase,
}: {
  legalCase: { id: string; status: LegalCaseStatus } | null | undefined;
}) {
  const canView = useCan('legal.view');
  if (!legalCase) return null;
  const label = t('legal.flag.label', { status: t(`legal.status.${legalCase.status}`) });
  return canView ? (
    <Link to={`/legal/cases/${legalCase.id}`} className="inline-flex" title={t('legal.flag.open')}>
      <Badge tone="danger">{label}</Badge>
    </Link>
  ) : (
    <Badge tone="danger">{label}</Badge>
  );
}
