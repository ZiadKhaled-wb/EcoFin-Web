import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  type Quotation,
  type QuotationLineInput,
  type Product,
  type Customer,
  QuotationStatus,
  computeDocumentTax,
  type ShopSettings,
  type SalesOrder,
} from '@ziadkhaled-wb/contracts';
import { t, getLanguage, directionOf } from '@/i18n';
import { useOfflineStore } from '@/offline/store';
import { quotationsApi } from '@/services/quotationsApi';
import { settingsApi } from '@/services/settingsApi';
import { customersApi } from '@/services/customersApi';
import { productsApi } from '@/services/productsApi';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { useBranches } from '@/features/me/useBranches';
import { useMe } from '@/features/me/useMe';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { quotationActions, priceLocked, duplicateQuotation } from './quotationRules';
import { salesOrderErrorMessage } from './salesOrderRules';
import QuoteOrderDialog from './QuoteOrderDialog';
import './Quotations.css';
const blank = (): QuotationLineInput => ({
  product_id: null,
  description: '',
  quantity: 1,
  unit_price: '0.00',
  discount_amount: '0.00',
  custom_notes: '',
});
function shopDate(timezone: string, days = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const d = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function errorMessage(e: unknown) {
  return e instanceof ApiError && e.code === 'QUOTATION_STALE'
    ? t('quotations.stale')
    : t('quotations.failed');
}
export default function QuotationsPage() {
  const [items, setItems] = useState<Quotation[]>([]),
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
  useEffect(() => {
    let alive = true;
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    void quotationsApi
      .list(params)
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [filters]);
  return (
    <main className="quotation-page">
      <h1>{t('quotations.title')}</h1>
      <Link to="new">{t('quotations.new')}</Link>
      <div className="quotation-filters">
        <label>
          {t('quotations.status')}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">{t('quotations.all')}</option>
            {QuotationStatus.options.map((s) => (
              <option key={s} value={s}>
                {t(`quotations.states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('quotations.branch')}
          <select
            value={filters.branch_id}
            onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
          >
            <option value="">{t('quotations.all')}</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <CustomerPicker
          value={filters.customer_id}
          onChange={(customer_id) => setFilters({ ...filters, customer_id })}
        />
        {(['from', 'to', 'search'] as const).map((k) => (
          <label key={k}>
            {t(`quotations.${k}`)}
            <input
              type={k === 'search' ? 'search' : 'date'}
              value={filters[k]}
              onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
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
                ['number', 'customer', 'branch', 'date', 'validUntil', 'total', 'status'] as const
              ).map((k) => (
                <th key={k}>{t(`quotations.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link to={q.id}>{q.number}</Link>
                </td>
                <td>{q.customer?.name}</td>
                <td>{q.branch.name}</td>
                <td>{q.created_at.slice(0, 10)}</td>
                <td>{q.valid_until}</td>
                <td>{q.total}</td>
                <td>
                  <span className="rounded bg-muted px-2">
                    {t(`quotations.states.${q.effective_status}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
export function CustomerPicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (id: string) => void;
  name?: string;
}) {
  const [search, setSearch] = useState(''),
    [items, setItems] = useState<Customer[]>([]);
  useEffect(() => {
    let alive = true;
    void customersApi
      .list({ search, pageSize: 20 })
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [search]);
  return (
    <div>
      <label>
        {t('quotations.customerSearch')}
        <input
          aria-label={t('quotations.customerSearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        {t('quotations.customer')}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('quotations.none')}</option>
          {value && !items.some((c) => c.id === value) && (
            <option value={value}>{name ?? value}</option>
          )}
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} {c.phones[0]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function QuotationEditor() {
  const { id } = useParams(),
    location = useLocation(),
    navigate = useNavigate(),
    branches = useBranches(),
    me = useMe(),
    override = useCan('price.override'),
    canOrder = useCan('order.manage');
  const initial = location.state as ReturnType<typeof duplicateQuotation> | null;
  const [quote, setQuote] = useState<Quotation | null>(null),
    [branch, setBranch] = useState(initial?.branch_id ?? ''),
    [customer, setCustomer] = useState(initial?.customer_id ?? ''),
    [valid, setValid] = useState(''),
    [notes, setNotes] = useState(initial?.notes ?? ''),
    [lines, setLines] = useState<QuotationLineInput[]>(initial?.lines ?? [blank()]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState(''),
    [products, setProducts] = useState<Product[]>([]),
    [reason, setReason] = useState(''),
    [pending, setPending] = useState<'reject' | 'cancel' | null>(null);
  const validity = valid || (me.data ? shopDate(me.data.org.timezone, 14) : '');
  const [settings, setSettings] = useState<ShopSettings | null>(null),
    [productClasses, setProductClasses] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void settingsApi
      .get()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  // S10: an accepted quote has an order when one of its customer's orders points back to it.
  const [order, setOrder] = useState<SalesOrder | null | undefined>(undefined),
    [converting, setConverting] = useState(false);
  useEffect(() => {
    let alive = true;
    if (canOrder && quote?.effective_status === 'accepted' && quote.customer_id)
      void salesOrdersApi
        .list({ customer_id: quote.customer_id, page_size: 100 })
        .then((r) => {
          if (alive) setOrder(r.items.find((o) => o.quotation?.id === quote.id) ?? null);
        })
        .catch((e) => {
          if (alive) setError(salesOrderErrorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [canOrder, quote]);
  // S10: orders are online-only, so the offline POS (S08) offers no "Create order".
  const offline = useOfflineStore((s) => s.mode.mode === 'offline');
  const showCreateOrder =
    canOrder && !offline && quote?.effective_status === 'accepted' && order === null;
  const editable = !quote || quote.effective_status === 'draft';
  function fill(q: Quotation) {
    setQuote(q);
    setBranch(q.branch_id);
    setCustomer(q.customer_id ?? '');
    setValid(q.valid_until);
    setNotes(q.notes ?? '');
    setLines(q.lines);
    setDirty(false);
  }
  useEffect(() => {
    let alive = true;
    if (id)
      void quotationsApi
        .get(id)
        .then((q) => {
          if (alive) fill(q);
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    let alive = true;
    if (search)
      void productsApi
        .list({ search, status: 'active', pageSize: 20 })
        .then((r) => {
          if (alive) setProducts(r.items);
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [search]);
  function editLine(index: number, patch: Partial<QuotationLineInput>) {
    setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setDirty(true);
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = {
        customer_id: customer || null,
        valid_until: validity || null,
        notes: notes || null,
        lines,
      };
      if (id && quote)
        fill(await quotationsApi.update(id, { ...body, expected_updated_at: quote.updated_at }));
      else {
        const result = await quotationsApi.create({ ...body, branch_id: branch }, key);
        navigate('/sales/quotations/' + result.id, { replace: true });
      }
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'QUOTATION_STALE' && id)
        fill(await quotationsApi.get(id));
    } finally {
      setBusy(false);
    }
  }
  async function move(action: 'send' | 'accept' | 'reject' | 'cancel') {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      fill(await quotationsApi.move(id, action, reason));
      setPending(null);
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  let preview: ReturnType<typeof computeDocumentTax> | null = null;
  try {
    if (settings)
      preview = computeDocumentTax({
        prices_include_vat: quote?.prices_include_vat ?? settings.prices_include_vat,
        document_discount: '0',
        lines: lines.map((l) => ({
          unit_price: l.unit_price,
          quantity: l.quantity,
          line_discount: l.discount_amount,
          tax_rate:
            quote?.lines.find((q) => q.product_id === l.product_id)?.tax_rate ??
            settings.tax_class_options.find(
              (c) =>
                c.id ===
                (l.product_id ? productClasses[l.product_id] : settings.default_tax_class_id),
            )?.rate ??
            '0',
        })),
      });
  } catch {
    /* Incomplete fields have no preview. */
  }

  if (id && !quote) return <p role="status">{error || t('quotations.loading')}</p>;
  return (
    <main className="quotation-page">
      <h1>{quote?.number ?? t('quotations.new')}</h1>
      {error && <p role="alert">{error}</p>}
      {quote && <p>{t(`quotations.states.${quote.effective_status}`)}</p>}
      <fieldset disabled={!editable || busy}>
        <div className="quotation-filters">
          <label>
            {t('quotations.branch')}
            <select disabled={!!id} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">{t('quotations.choose')}</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <CustomerPicker
            value={customer}
            name={quote?.customer?.name}
            onChange={(v) => {
              setCustomer(v);
              setDirty(true);
            }}
          />
          <label>
            {t('quotations.validUntil')}
            <input
              type="date"
              value={validity}
              onChange={(e) => {
                setValid(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            {t('quotations.notes')}
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
            />
          </label>
        </div>
        {editable && (
          <div>
            <label>
              {t('quotations.productSearch')}
              <input value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <button
              onClick={() => {
                void productsApi
                  .lookup(search)
                  .then((p) => {
                    setProductClasses((prev) => ({ ...prev, [p.id]: p.tax_class_id }));
                    setLines([
                      ...lines,
                      {
                        ...blank(),
                        product_id: p.id,
                        description: getLanguage() === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar),
                        unit_price: p.cash_price,
                      },
                    ]);
                    setDirty(true);
                    setSearch('');
                  })
                  .catch((e) => setError(errorMessage(e)));
              }}
            >
              {t('quotations.barcode')}
            </button>
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setLines([
                    ...lines,
                    {
                      ...blank(),
                      product_id: p.id,
                      description: getLanguage() === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar),
                      unit_price: p.cash_price,
                    },
                  ]);
                  setDirty(true);
                  setSearch('');
                  setProducts([]);
                }}
              >
                {getLanguage() === 'ar' ? p.name_ar : (p.name_en ?? p.name_ar)}
              </button>
            ))}
            <button
              onClick={() => {
                setLines([...lines, blank()]);
                setDirty(true);
              }}
            >
              {t('quotations.addCustom')}
            </button>
          </div>
        )}
        {lines.map((l, i) => (
          <div className="quotation-line" key={i}>
            <label>
              {t('quotations.description')}
              <input
                value={l.description ?? ''}
                maxLength={200}
                onChange={(e) => editLine(i, { description: e.target.value })}
              />
            </label>
            <label>
              {t('quotations.quantity')}
              <input
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) => editLine(i, { quantity: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('quotations.price')}
              <input
                inputMode="decimal"
                readOnly={priceLocked(l, override)}
                value={l.unit_price}
                onChange={(e) => editLine(i, { unit_price: e.target.value })}
              />
            </label>
            <label>
              {t('quotations.discount')}
              <input
                inputMode="decimal"
                value={l.discount_amount}
                onChange={(e) => editLine(i, { discount_amount: e.target.value })}
              />
            </label>
            <label>
              {t('quotations.notes')}
              <input
                maxLength={500}
                value={l.custom_notes ?? ''}
                onChange={(e) => editLine(i, { custom_notes: e.target.value })}
              />
            </label>
            {editable && (
              <button
                onClick={() => {
                  setLines(lines.filter((_, n) => n !== i));
                  setDirty(true);
                }}
              >
                {t('quotations.remove')}
              </button>
            )}
          </div>
        ))}
      </fieldset>
      {(!quote || dirty) && (
        <p>
          {t('quotations.preview')}: {preview?.total}
        </p>
      )}
      {quote && <QuotationTotals quote={quote} />}
      <div className="quotation-actions">
        {editable && (
          <button disabled={busy} onClick={() => void save()}>
            {t('quotations.save')}
          </button>
        )}
        {quote &&
          quotationActions(quote.effective_status).map((action) => (
            <button
              disabled={busy || (action === 'send' && dirty)}
              key={action}
              onClick={() => {
                if (action === 'reject' || action === 'cancel') setPending(action);
                else void move(action);
              }}
            >
              {t(`quotations.${action}`)}
            </button>
          ))}
        {quote && (
          <>
            <Link to={`/sales/quotations/${quote.id}/print`}>{t('quotations.print')}</Link>
            {order && (
              <Link to={`/sales/orders/${order.id}`}>
                {t('salesOrders.convert.openOrder', { number: order.number })}
              </Link>
            )}
            {showCreateOrder && (
              <button disabled={busy} onClick={() => setConverting(true)}>
                {t('salesOrders.convert.button')}
              </button>
            )}
            <button
              onClick={() =>
                navigate('/sales/quotations/new', { state: duplicateQuotation(quote) })
              }
            >
              {t('quotations.duplicate')}
            </button>
          </>
        )}
      </div>
      {converting && quote && (
        <QuoteOrderDialog quote={quote} onClose={() => setConverting(false)} />
      )}
      {pending && (
        <div role="dialog" aria-label={t(`quotations.${pending}`)}>
          <label>
            {t('quotations.reason')}
            <textarea
              value={reason}
              minLength={3}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={busy || reason.trim().length < 3 || reason.trim().length > 500}
            onClick={() => void move(pending)}
          >
            {t('quotations.confirm')}
          </button>
          <button onClick={() => setPending(null)}>{t('quotations.close')}</button>
        </div>
      )}
    </main>
  );
}
export function QuotationTotals({ quote }: { quote: Quotation }) {
  return (
    <dl>
      {(['subtotal', 'discount_total', 'tax_total', 'total'] as const).map((k) => (
        <div key={k}>
          <dt>{t(`quotations.${k}`)}</dt>
          <dd>{quote[k]}</dd>
        </div>
      ))}
    </dl>
  );
}
export function QuotationPrint({ quote }: { quote: Quotation }) {
  return (
    <article className="quotation-print" dir={directionOf(getLanguage())}>
      <h1>{t('quotations.title')}</h1>
      <h2>{quote.shop.legal_name}</h2>
      <p>
        {quote.branch.name} {quote.branch.address}
      </p>
      <p>
        {quote.number} · {quote.created_at.slice(0, 10)}
      </p>
      <p>
        {t('quotations.validUntil')}: {quote.valid_until}
      </p>
      <p>
        {quote.customer?.name} {quote.customer?.phone}
      </p>
      <table>
        <thead>
          <tr>
            {(['description', 'quantity', 'price', 'discount', 'tax', 'total'] as const).map(
              (k) => (
                <th key={k}>{t(`quotations.${k}`)}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.description}
                <p>{l.custom_notes}</p>
              </td>
              <td>{l.quantity}</td>
              <td>{l.unit_price}</td>
              <td>{l.discount_amount}</td>
              <td>{l.tax_amount}</td>
              <td>{l.line_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <QuotationTotals quote={quote} />
      <p>{quote.notes}</p>
      <p>{t('quotations.validText', { date: quote.valid_until })}</p>
    </article>
  );
}
export function QuotationPrintPage() {
  const { id } = useParams();
  const [quote, setQuote] = useState<Quotation | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (id)
      void quotationsApi
        .get(id)
        .then((q) => {
          if (alive) setQuote(q);
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <main className="quotation-page">
      <button disabled={!quote} onClick={() => window.print()}>
        {t('quotations.print')}
      </button>
      {error && <p role="alert">{error}</p>}
      {quote && (
        <>
          <QuotationPrint quote={quote} />
          {createPortal(
            <div className="print-root quotation-print-root">
              <style>{'@page { size: A4; margin: 10mm; }'}</style>
              <QuotationPrint quote={quote} />
            </div>,
            document.body,
          )}
        </>
      )}
    </main>
  );
}
