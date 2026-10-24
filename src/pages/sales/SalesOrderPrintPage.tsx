import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import type { SalesOrder } from '@ziadkhaled-wb/contracts';
import { t, getLanguage, directionOf } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { productName } from './usePosCart';
import { salesOrderErrorMessage } from './salesOrderRules';
import './SalesOrders.css';
import './SalesOrderPrint.css';

/** S10 order confirmation (A4, in the app's language): lines, notes, deposits and the balance due. */
export function SalesOrderPrint({ order }: { order: SalesOrder }) {
  const EMPTY = t('salesOrders.header.none');
  const facts: [string, string][] = [
    [t('salesOrders.print.number'), order.number],
    [t('salesOrders.print.date'), formatDate(order.created_at)],
    [t('salesOrders.print.customer'), order.customer.name],
    [t('salesOrders.print.phone'), order.customer.phone || EMPTY],
    [t('salesOrders.print.deliveryAddress'), order.delivery_address || EMPTY],
  ];
  return (
    <article className="sales-order-print" dir={directionOf(getLanguage())}>
      <h1>{t('salesOrders.print.title')}</h1>
      <p dir="auto">
        {order.branch.name} {order.branch.address}
      </p>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
      </dl>
      <table>
        <thead>
          <tr>
            {(
              [
                'product',
                'customNotes',
                'quantity',
                'unitPrice',
                'discount',
                'tax',
                'lineTotal',
              ] as const
            ).map((k) => (
              <th key={k}>{t(`salesOrders.lines.${k}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id}>
              <td dir="auto">{productName(l.product)}</td>
              <td dir="auto">{l.custom_notes || EMPTY}</td>
              <td>{l.quantity}</td>
              <td>{formatMoney(l.unit_price)}</td>
              <td>{formatMoney(l.discount_amount)}</td>
              <td>{formatMoney(l.tax_amount)}</td>
              <td>{formatMoney(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl>
        {(['subtotal', 'discount_total', 'tax_total', 'total'] as const).map((k) => (
          <div key={k}>
            <dt>{t(`salesOrders.totals.${k}`)}</dt>
            <dd>{formatMoney(order[k])}</dd>
          </div>
        ))}
        <div>
          <dt>{t('salesOrders.print.depositsPaid')}</dt>
          <dd>{formatMoney(order.balances.deposits_paid)}</dd>
        </div>
        <div className="sales-order-print-due">
          <dt>{t('salesOrders.print.balanceDue')}</dt>
          <dd data-testid="print-balance-due">{formatMoney(order.balances.unpaid)}</dd>
        </div>
      </dl>
      <h2>{t('salesOrders.print.notes')}</h2>
      <p className="whitespace-pre-wrap" dir="auto">
        {order.notes || EMPTY}
      </p>
    </article>
  );
}

/** S10 `/sales/orders/:id/print` (`order.manage`), the S09 quote print's pattern. */
export default function SalesOrderPrintPage() {
  const { id = '' } = useParams();
  const [order, setOrder] = useState<SalesOrder | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void salesOrdersApi
      .get(id)
      .then((o) => {
        if (alive) setOrder(o);
      })
      .catch((e) => {
        if (alive) setError(salesOrderErrorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <main className="sales-order-page">
      <div className="print:hidden">
        <Link to={`/sales/orders/${id}`}>{t('salesOrders.back')}</Link>
        <button type="button" disabled={!order} onClick={() => window.print()}>
          {t('salesOrders.print.print')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!order && !error && <p role="status">{t('salesOrders.print.loading')}</p>}
      {order && (
        <>
          <SalesOrderPrint order={order} />
          {createPortal(
            <div className="print-root sales-order-print-root">
              <style>{'@page { size: A4; margin: 10mm; }'}</style>
              <SalesOrderPrint order={order} />
            </div>,
            document.body,
          )}
        </>
      )}
    </main>
  );
}
