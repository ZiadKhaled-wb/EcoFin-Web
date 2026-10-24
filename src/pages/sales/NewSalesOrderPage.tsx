import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateSalesOrderBody, FulfilmentMode, type Product } from '@ziadkhaled-wb/contracts';
import { t } from '@/i18n';
import { sanitizeDecimal } from '@/lib/number';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { useOfflineStore } from '@/offline/store';
import { CustomerPicker } from './QuotationsPage';
import { ProductPicker, SerialPicker } from './orderPickers';
import { productName } from './usePosCart';
import { needsSerials, salesOrderErrorMessage, serialsReady } from './salesOrderRules';
import './SalesOrders.css';

interface DraftLine {
  product: Product;
  custom_notes: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  fulfilment: FulfilmentMode;
  unit_ids: string[];
}

const money = (raw: string) => sanitizeDecimal(raw, { decimals: 2, allowNegative: false });

/** S10 `/sales/orders/new`. The totals are the server's: the page opens the created order. */
export default function NewSalesOrderPage() {
  const navigate = useNavigate(),
    branches = useBranches(),
    // S09 price rule: a catalog product's price is editable only with price.override.
    override = useCan('price.override'),
    // Orders are online-only: the offline POS (S08) can't create one.
    offline = useOfflineStore((s) => s.mode.mode === 'offline');
  const [branch, setBranch] = useState(''),
    [customer, setCustomer] = useState(''),
    [address, setAddress] = useState(''),
    [notes, setNotes] = useState(''),
    [lines, setLines] = useState<DraftLine[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());

  const edit = (index: number, patch: Partial<DraftLine>) =>
    setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const body = {
    branch_id: branch,
    customer_id: customer,
    delivery_address: address.trim() || null,
    notes: notes.trim() || null,
    lines: lines.map((l) => ({
      product_id: l.product.id,
      custom_notes: l.custom_notes.trim() || null,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      fulfilment: l.fulfilment,
      ...(needsSerials(l.product.is_serialized, l.fulfilment) ? { unit_ids: l.unit_ids } : {}),
    })),
  } satisfies CreateSalesOrderBody;
  const ready =
    CreateSalesOrderBody.safeParse(body).success &&
    lines.every((l) => serialsReady(l, l.product.is_serialized));

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const order = await salesOrdersApi.create(body, key);
      navigate(`/sales/orders/${order.id}`, { replace: true });
    } catch (e) {
      setError(salesOrderErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sales-order-page">
      <Link to="/sales/orders">{t('salesOrders.back')}</Link>
      <h1>{t('salesOrders.new.title')}</h1>
      {error && <p role="alert">{error}</p>}
      <fieldset className="sales-order-form" disabled={busy}>
        <div className="sales-order-filters">
          <label>
            {t('salesOrders.branch')}
            <select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                // Units are held at one branch: a new branch needs new units.
                setLines(lines.map((l) => ({ ...l, unit_ids: [] })));
              }}
            >
              <option value="">{t('salesOrders.new.choose')}</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <CustomerPicker value={customer} onChange={setCustomer} />
          <label>
            {t('salesOrders.header.deliveryAddress')}
            <textarea
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            {t('salesOrders.header.notes')}
            <textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <ProductPicker
          label={t('salesOrders.new.addProduct')}
          onPick={(p) =>
            setLines([
              ...lines,
              {
                product: p,
                custom_notes: '',
                quantity: 1,
                unit_price: p.cash_price,
                discount_amount: '0.00',
                fulfilment: 'from_stock',
                unit_ids: [],
              },
            ])
          }
        />
        {lines.length === 0 && <p className="sales-order-muted">{t('salesOrders.new.noLines')}</p>}
        {lines.map((l, i) => {
          const taken = new Set(lines.flatMap((o, n) => (n === i ? [] : o.unit_ids)));
          return (
            <fieldset className="sales-order-line" key={i}>
              <legend>
                {productName(l.product)} <bdi>{l.product.sku}</bdi>
              </legend>
              <label>
                {t('salesOrders.lines.quantity')}
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => {
                    const quantity = Number(e.target.value);
                    edit(i, { quantity, unit_ids: l.unit_ids.slice(0, Math.max(0, quantity)) });
                  }}
                />
              </label>
              <label>
                {t('salesOrders.lines.unitPrice')}
                <input
                  inputMode="decimal"
                  readOnly={!override}
                  value={l.unit_price}
                  onChange={(e) => edit(i, { unit_price: money(e.target.value) })}
                />
              </label>
              <label>
                {t('salesOrders.lines.discount')}
                <input
                  inputMode="decimal"
                  value={l.discount_amount}
                  onChange={(e) => edit(i, { discount_amount: money(e.target.value) })}
                />
              </label>
              <label>
                {t('salesOrders.lines.customNotes')}
                <input
                  maxLength={500}
                  value={l.custom_notes}
                  onChange={(e) => edit(i, { custom_notes: e.target.value })}
                />
              </label>
              <label>
                {t('salesOrders.lines.fulfilment')}
                <select
                  value={l.fulfilment}
                  onChange={(e) => edit(i, { fulfilment: FulfilmentMode.parse(e.target.value) })}
                >
                  {FulfilmentMode.options.map((f) => (
                    <option key={f} value={f}>
                      {t(`salesOrders.fulfilment.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
              {needsSerials(l.product.is_serialized, l.fulfilment) && (
                <SerialPicker
                  productId={l.product.id}
                  branchId={branch}
                  quantity={l.quantity}
                  value={l.unit_ids}
                  taken={taken}
                  onChange={(unit_ids) => edit(i, { unit_ids })}
                />
              )}
              <button type="button" onClick={() => setLines(lines.filter((_, n) => n !== i))}>
                {t('salesOrders.new.remove')}
              </button>
            </fieldset>
          );
        })}
      </fieldset>
      {!offline && (
        <div className="sales-order-actions">
          <button type="button" disabled={busy || !ready} onClick={() => void submit()}>
            {t('salesOrders.new.submit')}
          </button>
        </div>
      )}
    </main>
  );
}
