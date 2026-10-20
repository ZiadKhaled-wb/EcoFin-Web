import { amountInWordsAr, type ContractDocuments } from '@ziadkhaled-wb/contracts';
import { DOC, day, money } from './documentText';
import './contractDocuments.css';

type Props = {
  docs: ContractDocuments;
  copy: boolean;
  logoUrl?: string | null;
};

/**
 * N07 (D82): the promissory notes (كمبيالات), three to an A4 page with cut lines, each one
 * self-contained: its number, the drawer (the customer), the beneficiary (the shop), the amount in
 * figures and words, the due date, the place and date of issue, and the joint guarantors. The
 * amounts and dates are the server's; the words come from the shared helper.
 */
export default function PromissoryNotes({ docs, copy }: Props) {
  const { customer, guarantors, shop, contract } = docs;
  const beneficiary = shop.legal_name ?? shop.name;
  return (
    <div className="cd-doc cd-notes" dir="rtl" lang="ar" data-testid="promissory-notes">
      {copy && (
        <div className="cd-copy-mark" data-testid="copy-mark">
          {DOC.copy}
        </div>
      )}
      {docs.replaces && (
        <p className="cd-replaces" data-testid="replaces">
          {DOC.notesReplace(day(docs.replaces.date))}
        </p>
      )}
      {docs.notes.map((note) => (
        <section className="cd-note" key={note.number} data-testid="promissory-note">
          <div className="cd-note-head">
            <h2>{DOC.noteTitle}</h2>
            <p>
              {DOC.noteNo}: <span className="cd-ltr">{note.number}</span>
            </p>
            <p className="cd-note-amount" data-testid="note-amount">
              {money(note.amount)}
            </p>
          </div>
          <p>
            {DOC.noteDue}: <strong>{day(note.due_date)}</strong>
          </p>
          <p className="cd-note-body">
            {DOC.noteBody({
              drawer: customer.name,
              id: customer.national_id ?? '',
              address: customer.address ?? '',
              beneficiary,
              amount: money(note.amount),
              words: amountInWordsAr(note.amount),
              due: day(note.due_date),
              contract: contract.number,
            })}
          </p>
          <p>{DOC.issued(note.place, day(note.issue_date))}</p>
          <div className="cd-sign-row">
            <div className="cd-sign">
              <p>{DOC.drawer}</p>
              <p className="cd-strong">{customer.name}</p>
            </div>
            {guarantors.map((g) => (
              <div className="cd-sign" key={g.id}>
                <p>{DOC.guarantor}</p>
                <p className="cd-strong">{g.name}</p>
                {g.national_id && (
                  <p>
                    {DOC.nationalId}: <span className="cd-ltr">{g.national_id}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="cd-cut" aria-hidden="true">
            {DOC.cut}
          </p>
        </section>
      ))}
    </div>
  );
}
