import type { ReactNode } from 'react';
import type { Collection } from '@ziadkhaled-wb/contracts';
import { directionOf, t, type Language, type TranslationKey } from '@/i18n';
import { formatBusinessDate, formatDateTime, formatMoney } from '@/lib/format';
import '@/features/receipts/receipt.css';

type Tr = (key: TranslationKey, params?: Record<string, string | number>) => string;

function Ltr({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="r-ltr">
      {children}
    </span>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="r-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * N03 (D78): the customer's receipt for an installment payment, on the shop's thermal roll. Every
 * amount is a field of the server's answer, only formatted: nothing is added up here. Words follow
 * Islamic finance rule 3 (installment, profit; never interest); no late fees exist (rule 4).
 */
export default function CollectionReceipt({
  collection,
  shopName,
  timezone,
  widthMm,
  lang,
  copy,
}: {
  collection: Collection;
  shopName: string;
  timezone: string;
  widthMm: number;
  lang: Language;
  copy: boolean;
}) {
  const tr: Tr = (key, params) => t(key, params, lang);
  const money = (v: string) => formatMoney(v, lang);
  return (
    <div
      className={`receipt receipt-thermal ${widthMm <= 58 ? 'receipt-58' : ''}`}
      dir={directionOf(lang)}
      lang={lang}
      data-receipt="collection"
    >
      <div className="r-center">
        <div className="r-shop" dir="auto">
          {shopName}
        </div>
        <div dir="auto">
          {tr('collections.receipt.doc.branch')}: {collection.branch_name}
        </div>
        <div className="r-bold">{tr('collections.receipt.doc.heading')}</div>
      </div>
      {copy && <div className="r-mark">{tr('collections.receipt.doc.copy')}</div>}
      {collection.reversal && (
        <div className="r-mark">{tr('collections.receipt.doc.reversed')}</div>
      )}
      <div className="r-rule" />
      <Row label={tr('collections.receipt.doc.number')}>
        <Ltr>{collection.number}</Ltr>
      </Row>
      <Row label={tr('collections.receipt.doc.date')}>
        {formatDateTime(collection.paid_at, lang, timezone)}
      </Row>
      {collection.received_by_name && (
        <Row
          label={tr(
            collection.shift_id === null
              ? 'collections.receipt.doc.fieldCollector'
              : 'collections.receipt.doc.cashier',
          )}
        >
          <span dir="auto">{collection.received_by_name}</span>
        </Row>
      )}
      <Row label={tr('collections.receipt.doc.customer')}>
        <span dir="auto">{collection.customer.name}</span>
      </Row>
      {collection.customer.phone && (
        <Row label={tr('collections.receipt.doc.phone')}>
          <Ltr>{collection.customer.phone}</Ltr>
        </Row>
      )}
      {collection.contracts.map((c) => (
        <div key={c.id} data-contract={c.number}>
          <div className="r-rule" />
          <div className="r-bold">
            {tr('collections.receipt.doc.contract', { number: c.number })}
          </div>
          {c.allocation.lines.map((l) => (
            <Row
              key={l.seq}
              label={tr('collections.receipt.doc.installment', {
                seq: l.seq,
                date: formatBusinessDate(l.due_date, lang),
              })}
            >
              {money(l.amount)}{' '}
              <span className="r-small">
                (
                {tr(
                  l.pays_off ? 'collections.receipt.doc.paysOff' : 'collections.receipt.doc.partly',
                )}
                )
              </span>
            </Row>
          ))}
          {c.allocation.completes_contract ? (
            <div className="r-bold">{tr('collections.receipt.doc.completed')}</div>
          ) : (
            <>
              <Row label={tr('collections.receipt.doc.left')}>{money(c.after.remaining)}</Row>
              {c.after.next_due_date && (
                <Row label={tr('collections.receipt.doc.nextDue')}>
                  {tr('collections.receipt.doc.nextDueValue', {
                    amount: money(c.after.next_due_amount),
                    date: formatBusinessDate(c.after.next_due_date, lang),
                  })}
                </Row>
              )}
            </>
          )}
        </div>
      ))}
      <div className="r-rule" />
      {collection.payments.map((p) => (
        <div key={p.id}>
          <Row label={tr(`collections.receipt.doc.method.${p.method}`)}>{money(p.amount)}</Row>
          {p.tendered && (
            <Row label={tr('collections.receipt.doc.tendered')}>{money(p.tendered)}</Row>
          )}
          {p.change && p.change !== '0.00' && (
            <Row label={tr('collections.receipt.doc.change')}>{money(p.change)}</Row>
          )}
          {p.reference && (
            <Row label={tr('collections.receipt.doc.reference')}>
              <Ltr>{p.reference}</Ltr>
            </Row>
          )}
        </div>
      ))}
      <div className="r-total">
        <Row label={tr('collections.receipt.doc.total')}>{money(collection.amount)}</Row>
      </div>
      {collection.reversal && (
        <p className="r-small" dir="auto">
          {tr('collections.receipt.doc.reversedBy', {
            number: collection.reversal.number,
            reason: collection.reversal.reason,
          })}
        </p>
      )}
      <div className="r-rule" />
      <div className="r-center">{tr('collections.receipt.doc.thanks')}</div>
    </div>
  );
}
