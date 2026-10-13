import type { CSSProperties, ReactNode } from 'react';
import { compareMoney, type Sale } from '@ziadkhaled-wb/contracts';
import { directionOf, t, type Language, type TranslationKey } from '@/i18n';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import QrCode from './QrCode';
import { contentWidthMm, type ReceiptPaper } from './receiptPrefs';
import { etaOnReceipt, type ReceiptSale, type ReceiptShop } from './receiptRules';
import './receipt.css';

export type SaleReceiptProps = {
  sale: ReceiptSale;
  shop: ReceiptShop;
  /** null: the name could not be read, the receipt prints without it. */
  branchName: string | null;
  logoUrl: string | null;
  /** The receipt's own language, not the screen's. */
  lang: Language;
  paper: ReceiptPaper;
  copy: boolean;
  onLogoSettled?: () => void;
};

type Tr = (key: TranslationKey, params?: Record<string, string | number>) => string;

const above0 = (amount: string) => compareMoney(amount, '0.00') > 0;
function Ltr({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span dir="ltr" className={mono ? 'r-ltr r-mono' : 'r-ltr'}>
      {children}
    </span>
  );
}

/**
 * S04 (D68): the customer's receipt for a sale, on a thermal roll or A4. Every amount is a field
 * of the sale answer, only formatted: nothing is added up or rounded here.
 */
export default function SaleReceipt(props: SaleReceiptProps) {
  const { sale, shop, branchName, logoUrl, lang, paper, copy, onLogoSettled } = props;
  const tr: Tr = (key, params) => t(key, params, lang);
  const money = (v: string) => formatMoney(v, lang);
  const show = shop.receipt_fields;
  const lines = [...sale.lines].sort((a, b) => a.line_no - b.line_no);
  const eta = etaOnReceipt(sale);
  const voided = sale.status === 'voided';
  const nameOf = (l: Sale['lines'][number]) => (lang === 'en' && l.name_en ? l.name_en : l.name_ar);

  const logo = show.logo && logoUrl && (
    <img
      className="r-logo"
      src={logoUrl}
      alt={tr('receipts.doc.logo')}
      onLoad={onLogoSettled}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        onLogoSettled?.();
      }}
    />
  );
  const shopBlock = (
    <>
      {logo}
      <div className="r-shop" dir="auto">
        {shop.name}
      </div>
      {shop.receipt_header && (
        <div className="r-pre" dir="auto" data-part="header">
          {shop.receipt_header}
        </div>
      )}
      {show.address && shop.address && (
        <div dir="auto" data-part="address">
          {shop.address}
        </div>
      )}
      {show.phone && shop.phone && (
        <div data-part="phone">
          {tr('receipts.doc.phone')}: <Ltr>{shop.phone}</Ltr>
        </div>
      )}
      {show.tax_registration_no && shop.tax_registration_no && (
        <div data-part="tax_registration_no">
          {tr('receipts.doc.taxNo')}: <Ltr>{shop.tax_registration_no}</Ltr>
        </div>
      )}
      {show.branch && branchName && (
        <div dir="auto" data-part="branch">
          {tr('receipts.doc.branch')}: {branchName}
        </div>
      )}
    </>
  );
  const marks = (
    <>
      {copy && (
        <div className="r-mark" data-mark="copy">
          {tr('receipts.doc.copy')}
        </div>
      )}
      {voided && (
        <div className="r-mark" data-mark="voided">
          {tr('receipts.doc.voided')}
        </div>
      )}
    </>
  );
  const facts: [string, ReactNode][] = [
    [tr('receipts.doc.number'), <Ltr key="n">{sale.number}</Ltr>],
    [tr('receipts.doc.date'), formatDateTime(sale.issued_at, lang, shop.timezone)],
  ];
  if (sale.shift_number)
    facts.push([tr('receipts.doc.shift'), <Ltr key="s">{sale.shift_number}</Ltr>]);
  if (show.cashier && sale.created_by_name)
    facts.push([tr('receipts.doc.cashier'), <span dir="auto">{sale.created_by_name}</span>]);
  if (show.customer)
    facts.push([
      tr('receipts.doc.customer'),
      <span dir="auto">{sale.customer_name ?? tr('receipts.doc.walkIn')}</span>,
    ]);
  const factRows = facts.map(([label, value]) => (
    <div className="r-row" key={label}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ));
  const totals = (
    <>
      <div className="r-row">
        <span>{tr('receipts.doc.subtotal')}</span>
        <span data-amount="subtotal">{money(sale.subtotal)}</span>
      </div>
      {above0(sale.discount_total) && (
        <div className="r-row">
          <span>{tr('receipts.doc.discountTotal')}</span>
          <span data-amount="discount_total">{money(sale.discount_total)}</span>
        </div>
      )}
      <div className="r-row">
        <span>{tr('receipts.doc.vatTotal')}</span>
        <span data-amount="tax_total">{money(sale.tax_total)}</span>
      </div>
      <div className="r-row r-total">
        <span>{tr('receipts.doc.total')}</span>
        <span data-amount="total">{money(sale.total)}</span>
      </div>
      <div className="r-small">
        {tr(sale.prices_include_vat ? 'receipts.doc.vatIncluded' : 'receipts.doc.vatAdded')}
      </div>
    </>
  );
  const changeRow = above0(sale.change_total) && (
    <div className="r-row r-bold">
      <span>{tr('receipts.doc.change')}</span>
      <span data-amount="change_total">{money(sale.change_total)}</span>
    </div>
  );
  const etaBlock = (eta.uuid || eta.qr || eta.pending) && (
    <div className="r-eta r-center" data-part="eta">
      <div className="r-bold">{tr('receipts.doc.eta')}</div>
      {eta.uuid && (
        <div className="r-small" data-part="eta-uuid">
          <Ltr mono>{eta.uuid}</Ltr>
        </div>
      )}
      {eta.pending && (
        <div className="r-small" data-part="eta-pending">
          {tr('receipts.doc.etaPending')}
        </div>
      )}
      {eta.qr && (
        <div className="r-qr">
          <QrCode
            value={eta.qr}
            label={tr('receipts.doc.qr')}
            sizeMm={paper === 'a4' ? 35 : shop.receipt_width_mm === 80 ? 38 : 32}
          />
        </div>
      )}
    </div>
  );
  const footer = shop.receipt_footer && (
    <div className="r-pre r-center" dir="auto" data-part="footer">
      {shop.receipt_footer}
    </div>
  );
  const itemSub = (l: Sale['lines'][number]) => (
    <>
      <div className="r-small">
        <Ltr mono>{l.serial ?? l.sku}</Ltr>
      </div>
      {l.warranty_until !== null && (
        <div className="r-small">
          {tr('receipts.doc.warranty', { date: formatBusinessDate(l.warranty_until, lang) })}
        </div>
      )}
    </>
  );

  if (paper === 'a4') {
    return (
      <article className="receipt receipt-a4" dir={directionOf(lang)} lang={lang}>
        <div className="r-head">
          <div>{shopBlock}</div>
          <div>
            <div className="r-shop">{tr('receipts.doc.title')}</div>
            {marks}
            {factRows}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>{tr('receipts.doc.lineNo')}</th>
              <th>{tr('receipts.doc.product')}</th>
              <th className="r-num">{tr('receipts.doc.quantity')}</th>
              <th className="r-num">{tr('receipts.doc.unitPrice')}</th>
              <th className="r-num">{tr('receipts.doc.discount')}</th>
              <th className="r-num">{tr('receipts.doc.vat')}</th>
              <th className="r-num">{tr('receipts.doc.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} data-line={l.line_no}>
                <td>{l.line_no}</td>
                <td>
                  <div dir="auto">{nameOf(l)}</div>
                  {itemSub(l)}
                </td>
                <td className="r-num">{formatNumber(l.quantity, lang)}</td>
                <td className="r-num">{money(l.unit_price)}</td>
                <td className="r-num">{above0(l.discount_amount) && money(l.discount_amount)}</td>
                <td className="r-num">{money(l.tax_amount)}</td>
                <td className="r-num">{money(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="r-totals">{totals}</div>
        <table>
          <thead>
            <tr>
              <th>{tr('receipts.doc.paymentNumber')}</th>
              <th>{tr('receipts.doc.method')}</th>
              <th>{tr('receipts.doc.account')}</th>
              <th>{tr('receipts.doc.reference')}</th>
              <th className="r-num">{tr('receipts.doc.amount')}</th>
              <th className="r-num">{tr('receipts.doc.received')}</th>
              <th className="r-num">{tr('receipts.doc.change')}</th>
            </tr>
          </thead>
          <tbody>
            {sale.payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <Ltr>{p.number}</Ltr>
                </td>
                <td>{tr(`receipts.doc.methods.${p.method}`)}</td>
                <td dir="auto">{p.cash_account_name ?? ''}</td>
                <td>{p.reference && <Ltr>{p.reference}</Ltr>}</td>
                <td className="r-num">{money(p.amount)}</td>
                <td className="r-num">{p.tendered !== null && money(p.tendered)}</td>
                <td className="r-num">{p.change !== null && money(p.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="r-totals">{changeRow}</div>
        {etaBlock}
        {footer}
      </article>
    );
  }

  const roll = shop.receipt_width_mm;
  return (
    <article
      className={`receipt receipt-thermal receipt-${roll}`}
      style={{ '--receipt-width': `${contentWidthMm(roll)}mm` } as CSSProperties}
      dir={directionOf(lang)}
      lang={lang}
    >
      <div className="r-center">{shopBlock}</div>
      {marks}
      <div className="r-rule" />
      <div className="r-center r-bold">{tr('receipts.doc.title')}</div>
      {factRows}
      <div className="r-rule" />
      {lines.map((l) => (
        <div className="r-line" key={l.id} data-line={l.line_no}>
          <div dir="auto">{nameOf(l)}</div>
          {itemSub(l)}
          <div className="r-row">
            <span>
              <Ltr>
                {formatNumber(l.quantity, lang)} × {money(l.unit_price)}
              </Ltr>
            </span>
            <span>{money(l.line_total)}</span>
          </div>
          {above0(l.discount_amount) && (
            <div className="r-row r-small">
              <span>{tr('receipts.doc.discount')}</span>
              <span>{money(l.discount_amount)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="r-rule" />
      {totals}
      <div className="r-rule" />
      {sale.payments.map((p) => (
        <div className="r-line" key={p.id}>
          <div className="r-row">
            <span>{tr(`receipts.doc.methods.${p.method}`)}</span>
            <span>{money(p.amount)}</span>
          </div>
          {p.reference && (
            <div className="r-row r-small">
              <span>{tr('receipts.doc.reference')}</span>
              <Ltr>{p.reference}</Ltr>
            </div>
          )}
          {p.tendered !== null && (
            <div className="r-row r-small">
              <span>{tr('receipts.doc.received')}</span>
              <span>{money(p.tendered)}</span>
            </div>
          )}
        </div>
      ))}
      {changeRow}
      {etaBlock && <div className="r-rule" />}
      {etaBlock}
      {footer && <div className="r-rule" />}
      {footer}
    </article>
  );
}
