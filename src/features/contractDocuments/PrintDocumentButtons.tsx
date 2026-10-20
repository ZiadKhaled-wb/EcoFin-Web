import { Link } from 'react-router-dom';
import { useCan } from '@/features/me/useCan';
import { t } from '@/i18n';

/**
 * N07 (D82): "Print contract" and "Print promissory notes", on the contract page and on the POS
 * done card. They open the print view; the server decides who may read (installment.create or
 * customer.view_pii), so these buttons are only a convenience.
 */
export default function PrintDocumentButtons({
  contractId,
  notes = true,
}: {
  contractId: string;
  /** False for a closed contract: nothing is left to write a note for. */
  notes?: boolean;
}) {
  const canCreate = useCan('installment.create');
  const canSeePii = useCan('customer.view_pii');
  if (!canCreate && !canSeePii) return null;
  return (
    <>
      <Link
        to={`/contracts/${contractId}/print?doc=contract`}
        className="btn btn-secondary"
        data-testid="print-contract"
      >
        {t('contractDocuments.actions.printContract')}
      </Link>
      {notes && (
        <Link
          to={`/contracts/${contractId}/print?doc=notes`}
          className="btn btn-secondary"
          data-testid="print-notes"
        >
          {t('contractDocuments.actions.printNotes')}
        </Link>
      )}
    </>
  );
}
