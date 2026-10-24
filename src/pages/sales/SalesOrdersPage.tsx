import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SalesOrderStatus, type SalesOrder } from '@ziadkhaled-wb/contracts';
import { t } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { useBranches } from '@/features/me/useBranches';
import { useOfflineStore } from '@/offline/store';
import { CustomerPicker } from './QuotationsPage';
import { productName } from './usePosCart';
import { fulfilmentText, salesOrderErrorMessage } from './salesOrderRules';
import SalesOrderActions from './SalesOrderActions';
import './SalesOrders.css';

const PAGE_SIZE = 20;

/** S10 `/sales/orders`: the shop's orders, filtered on the server. */
export default function SalesOrdersPage() {
  const [items, setItems] = useState<SalesOrder[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    branch_id: '',
    customer_id: '',
    from: '',
    to: '',
    search: '',
  });
  const branches = useBranches();
  // Orders are online-only: the offline POS (S08) offers no new order.
  const offline = useOfflineStore((st) => st.mode.mode === 'offline');
  const filter = (next: Partial<typeof filters>) => {
    setFilters({ ...filters, ...next });
    setPage(1);
  };
  useEffect(() => {
    let alive = true;
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    void salesOrdersApi
      .list({ ...params, page, page_size: PAGE_SIZE })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
        setError('');
      })
      .catch((e) => {
        if (alive) setError(salesOrderErrorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [filters, page]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <main className="sales-order-page">
      <h1>{t('salesOrders.title')}</h1>
      {!offline && <Link to="new">{t('salesOrders.new.link')}</Link>}
      <div className="sales-order-filters">
        <label>
          {t('salesOrders.status')}
          <select value={filters.status} onChange={(e) => filter({ status: e.target.value })}>
            <option value="">{t('salesOrders.all')}</option>
            {SalesOrderStatus.options.map((s) => (
              <option key={s} value={s}>
                {t(`salesOrders.states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('salesOrders.branch')}
          <select value={filters.branch_id} onChange={(e) => filter({ branch_id: e.target.value })}>
            <option value="">{t('salesOrders.all')}</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <CustomerPicker
          value={filters.customer_id}
          onChange={(customer_id) => filter({ customer_id })}
        />
        {(['from', 'to', 'search'] as const).map((k) => (
          <label key={k}>
            {t(`salesOrders.${k}`)}
            <input
              type={k === 'search' ? 'search' : 'date'}
              value={filters[k]}
              onChange={(e) => filter({ [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="overflow-auto">
        <table>
          <thead>
            <tr>
              {(
                [
                  'number',
                  'customer',
                  'branch',
                  'status',
                  'total',
                  'deposits_paid',
                  'unpaid',
                ] as const
              ).map((k) => (
                <th key={k}>{t(`salesOrders.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={o.id}>{o.number}</Link>
                </td>
                <td>
                  <div>{o.customer.name}</div>
                  {o.customer.phone && <bdi className="sales-order-muted">{o.customer.phone}</bdi>}
                </td>
                <td>{o.branch.name}</td>
                <td>
                  <span className="rounded bg-muted px-2">
                    {t(`salesOrders.states.${o.status}`)}
                  </span>
                </td>
                <td>{formatMoney(o.total)}</td>
                <td>{formatMoney(o.balances.deposits_paid)}</td>
                <td>{formatMoney(o.balances.unpaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!error && items.length === 0 && <p>{t('salesOrders.empty')}</p>}
      <div className="sales-order-pager">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t('salesOrders.previous')}
        </button>
        <span>{t('salesOrders.pageOf', { page, pages })}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          {t('salesOrders.next')}
        </button>
      </div>
    </main>
  );
}

/** S10 `/sales/orders/:id`: loads the order and shows it read-only. */
export function SalesOrderDetailPage() {
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
  if (error)
    return (
      <main className="sales-order-page">
        <p role="alert">{error}</p>
        <Link to="/sales/orders">{t('salesOrders.back')}</Link>
      </main>
    );
  if (!order)
    return (
      <main className="sales-order-page">
        <p>{t('salesOrders.loading')}</p>
      </main>
    );
  // The actions answer with the updated order for `setOrder`.
  return (
    <SalesOrderView
      order={order}
      actions={<SalesOrderActions order={order} onChange={setOrder} />}
    />
  );
}

/** The read-only order. `actions` fills the marked actions area above the lines. */
export function SalesOrderView({ order, actions }: { order: SalesOrder; actions?: ReactNode }) {
  const EMPTY = t('salesOrders.header.none');
  const header: [string, ReactNode][] = [
    [t('salesOrders.customer'), order.customer.name],
    [
      t('salesOrders.header.phone'),
      order.customer.phone ? <bdi>{order.customer.phone}</bdi> : EMPTY,
    ],
    [t('salesOrders.branch'), order.branch.name],
    [t('salesOrders.header.createdAt'), formatDate(order.created_at)],
    [t('salesOrders.header.deliveryAddress'), order.delivery_address || EMPTY],
    [t('salesOrders.header.notes'), order.notes || EMPTY],
    [
      t('salesOrders.header.quotation'),
      order.quotation ? (
        <Link to={`/sales/quotations/${order.quotation.id}`}>{order.quotation.number}</Link>
      ) : (
        EMPTY
      ),
    ],
  ];
  if (order.cancelled_reason)
    header.push([t('salesOrders.header.cancelledReason'), order.cancelled_reason]);
  return (
    <main className="sales-order-page">
      <Link to="/sales/orders">{t('salesOrders.back')}</Link>
      <div className="sales-order-heading">
        <h1>{order.number}</h1>
        <span className="rounded bg-muted px-2">{t(`salesOrders.states.${order.status}`)}</span>
      </div>
      <dl className="sales-order-facts">
        {header.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section
        className="sales-order-actions"
        aria-label={t('salesOrders.actions.title')}
        data-slot="sales-order-actions"
      >
        {actions}
      </section>
      <section aria-labelledby="sales-order-lines">
        <h2 id="sales-order-lines">{t('salesOrders.lines.title')}</h2>
        <div className="overflow-auto">
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
                    'fulfilment',
                    'progress',
                  ] as const
                ).map((k) => (
                  <th key={k}>{t(`salesOrders.lines.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div>{productName(l.product)}</div>
                    <bdi className="sales-order-muted">{l.product.sku}</bdi>
                  </td>
                  <td>{l.custom_notes || EMPTY}</td>
                  <td>{l.quantity}</td>
                  <td>{formatMoney(l.unit_price)}</td>
                  <td>{formatMoney(l.discount_amount)}</td>
                  <td>{formatMoney(l.tax_amount)}</td>
                  <td>{formatMoney(l.line_total)}</td>
                  <td>
                    <div>{t(`salesOrders.fulfilment.${l.fulfilment}`)}</div>
                    {fulfilmentText(l).map((text) => (
                      <div key={text} className="sales-order-muted">
                        {text}
                      </div>
                    ))}
                  </td>
                  <td>
                    <div>
                      {t('salesOrders.lines.delivered', {
                        delivered: l.delivered,
                        quantity: l.quantity,
                      })}
                    </div>
                    <div className="sales-order-muted">
                      {t('salesOrders.lines.remaining', { remaining: l.remaining })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="sales-order-facts">
          {(['subtotal', 'discount_total', 'tax_total', 'total'] as const).map((k) => (
            <div key={k}>
              <dt>{t(`salesOrders.totals.${k}`)}</dt>
              <dd>{formatMoney(order[k])}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="sales-order-payments">
        <h2 id="sales-order-payments">{t('salesOrders.payments.title')}</h2>
        {order.payments.length === 0 ? (
          <p>{t('salesOrders.payments.none')}</p>
        ) : (
          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  {(
                    ['number', 'direction', 'method', 'amount', 'reference', 'paidAt'] as const
                  ).map((k) => (
                    <th key={k}>{t(`salesOrders.payments.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.number}</td>
                    <td>{t(`salesOrders.payments.directions.${p.direction}`)}</td>
                    <td>{t(`salesOrders.payments.methods.${p.method}`)}</td>
                    <td>{formatMoney(p.amount)}</td>
                    <td>{p.reference || EMPTY}</td>
                    <td>{formatDate(p.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="sales-order-balances">
        <h2 id="sales-order-balances">{t('salesOrders.balances.title')}</h2>
        <dl className="sales-order-facts">
          {(['deposits_paid', 'delivered_value', 'unpaid'] as const).map((k) => (
            <div key={k}>
              <dt>{t(`salesOrders.balances.${k}`)}</dt>
              <dd>{formatMoney(order.balances[k])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
