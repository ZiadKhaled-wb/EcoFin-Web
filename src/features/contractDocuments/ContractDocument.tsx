import type { ContractDocuments } from '@ziadkhaled-wb/contracts';
import { formatNumber } from '@/lib/format';
import { DOC, day, money, termsText } from './documentText';
import './contractDocuments.css';

type Props = {
  docs: ContractDocuments;
  /** True for every print after the first of this schedule version. */
  copy: boolean;
  logoUrl: string | null;
  onLogoSettled?: () => void;
};

const n = (v: number) => formatNumber(v, 'ar');

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cd-line">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One side of the contract: the shop or a person, with the details that are on the signed paper. */
function Person({
  title,
  name,
  details,
}: {
  title: string;
  name: string;
  details: [string, string | null][];
}) {
  return (
    <section className="cd-person">
      <h3>{title}</h3>
      <p className="cd-strong">{name}</p>
      <dl>
        {details
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <Line key={label} label={label}>
              <span className="cd-ltr">{v}</span>
            </Line>
          ))}
      </dl>
    </section>
  );
}

/**
 * N07 (D82): the installment sale contract on A4. Arabic only, RTL, black on white. Every amount
 * and date is the server's (the documents read); the browser only formats them. Only the installment
 * price is stated (rule 1), and the word is profit, never interest.
 */
export default function ContractDocument({ docs, copy, logoUrl, onLogoSettled }: Props) {
  const { contract: c, customer, guarantors, goods, shop } = docs;
  const legal = shop.legal_name ?? shop.name;
  return (
    <article className="cd-doc" dir="rtl" lang="ar" data-testid="contract-document">
      {copy && (
        <div className="cd-copy-mark" data-testid="copy-mark">
          {DOC.copy}
        </div>
      )}
      <header className="cd-header">
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="cd-logo"
            onLoad={onLogoSettled}
            onError={onLogoSettled}
          />
        )}
        <div>
          <h2 className="cd-shop">{legal}</h2>
          {legal !== shop.name && <p>{shop.name}</p>}
          <p>
            {[
              shop.commercial_register
                ? `${DOC.commercialRegister}: ${shop.commercial_register}`
                : '',
              shop.tax_registration_no ? `${DOC.taxNo}: ${shop.tax_registration_no}` : '',
            ]
              .filter(Boolean)
              .join(' — ')}
          </p>
          <p>{[shop.address, shop.phone].filter(Boolean).join(' — ')}</p>
          <p>
            {DOC.branch}: {shop.branch.name}
          </p>
        </div>
      </header>
      {docs.status_mark && (
        <p className="cd-status" data-testid="status-mark">
          {DOC.status[docs.status_mark]}
        </p>
      )}
      <h1 className="cd-title">{DOC.contractTitle}</h1>
      <p className="cd-meta">
        {DOC.contractNo}: <span className="cd-ltr">{c.number}</span> — {DOC.date}:{' '}
        {day(c.contract_date)}
      </p>
      {docs.replaces && (
        <p className="cd-replaces" data-testid="replaces">
          {DOC.replaces(day(docs.replaces.date))}
        </p>
      )}

      <div className="cd-parties">
        <Person
          title={DOC.firstParty}
          name={legal}
          details={[
            [DOC.commercialRegister, shop.commercial_register],
            [DOC.address, shop.branch.address ?? shop.address],
            [DOC.phone, shop.branch.phone ?? shop.phone],
          ]}
        />
        <Person
          title={DOC.secondParty}
          name={customer.name}
          details={[
            [DOC.nationalId, customer.national_id],
            [DOC.job, customer.job],
            [DOC.address, customer.address],
            [DOC.phone, customer.phone],
          ]}
        />
      </div>
      {guarantors.length > 0 && (
        <section className="cd-block">
          <h3>{DOC.guarantors}</h3>
          <div className="cd-parties">
            {guarantors.map((g) => (
              <Person
                key={g.id}
                title={g.relation ? `${DOC.guarantor} (${g.relation})` : DOC.guarantor}
                name={g.name}
                details={[
                  [DOC.nationalId, g.national_id],
                  [DOC.job, g.job],
                  [DOC.address, g.address],
                  [DOC.phone, g.phone],
                ]}
              />
            ))}
          </div>
        </section>
      )}

      {goods.length > 0 && (
        <section className="cd-block">
          <h3>{DOC.goods}</h3>
          <table className="cd-table">
            <thead>
              <tr>
                <th>{DOC.goodName}</th>
                <th className="cd-num">{DOC.quantity}</th>
              </tr>
            </thead>
            <tbody>
              {goods.map((g, i) => (
                <tr key={`${g.name}-${i}`}>
                  <td>{g.name}</td>
                  <td className="cd-num">{n(g.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="cd-block cd-price">
        <h3>{DOC.price}</h3>
        <dl>
          <Line label={DOC.downPayment}>{money(c.down_payment)}</Line>
          <Line label={DOC.financed}>{money(c.financed_amount)}</Line>
          <Line label={DOC.profit}>{money(c.markup_amount)}</Line>
          <Line label={DOC.installmentPrice}>
            <strong data-testid="installment-price">{money(c.total_payable)}</strong>
          </Line>
          <Line label={DOC.count}>{n(c.installments_count)}</Line>
          <Line label={DOC.frequency}>{DOC.frequencyName[c.frequency]}</Line>
          <Line label={DOC.firstDue}>{day(c.first_due_date)}</Line>
          <Line label={DOC.lastDue}>{day(c.last_due_date ?? c.first_due_date)}</Line>
        </dl>
      </section>

      <section className="cd-block">
        <h3>{DOC.schedule}</h3>
        <table className="cd-table" data-testid="contract-schedule">
          <thead>
            <tr>
              <th className="cd-num">{DOC.seq}</th>
              <th>{DOC.dueDate}</th>
              <th className="cd-num">{DOC.amount}</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l) => (
              <tr key={l.seq}>
                <td className="cd-num">{n(l.seq)}</td>
                <td>{day(l.due_date)}</td>
                <td className="cd-num">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="cd-block">
        <h3>{DOC.terms}</h3>
        <div className="cd-terms" data-testid="contract-terms">
          {termsText(docs)}
        </div>
      </section>

      <section className="cd-block cd-signatures">
        <h3>{DOC.signatures}</h3>
        <div className="cd-sign-row">
          <div className="cd-sign">
            <p>{DOC.signShop}</p>
            <p className="cd-strong">{legal}</p>
          </div>
          <div className="cd-sign">
            <p>{DOC.signCustomer}</p>
            <p className="cd-strong">{customer.name}</p>
          </div>
          {guarantors.map((g) => (
            <div className="cd-sign" key={g.id}>
              <p>{DOC.signGuarantor}</p>
              <p className="cd-strong">{g.name}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
