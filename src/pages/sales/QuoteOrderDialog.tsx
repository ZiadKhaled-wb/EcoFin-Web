import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FulfilmentMode,
  type OrderFromQuotationBody,
  type Product,
  type Quotation,
} from '@ziadkhaled-wb/contracts';
import Dialog from '@/components/ui/Dialog';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { productsApi } from '@/services/productsApi';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { ProductPicker, SerialPicker } from './orderPickers';
import { needsSerials, salesOrderErrorMessage, serialsReady } from './salesOrderRules';

interface LineChoice {
  /** The product picked for a custom (product-less) quote line. */
  product: Product | null;
  fulfilment: FulfilmentMode;
  unit_ids: string[];
}

/**
 * S10 decision 2: an accepted quote becomes an order. Each line chooses how it is filled; a custom
 * line must be mapped to a catalog product. The prices stay the quote's.
 */
export default function QuoteOrderDialog({
  quote,
  onClose,
}: {
  quote: Quotation;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [address, setAddress] = useState(''),
    [choices, setChoices] = useState<Record<number, LineChoice>>(() =>
      Object.fromEntries(
        quote.lines.map((l) => [
          l.line_no,
          { product: null, fulfilment: 'from_stock', unit_ids: [] },
        ]),
      ),
    ),
    [products, setProducts] = useState<Record<string, Product> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    // Whether a quote line's product is serialized decides if it needs serials.
    const ids = [...new Set(quote.lines.flatMap((l) => (l.product_id ? [l.product_id] : [])))];
    void Promise.all(ids.map((id) => productsApi.get(id)))
      .then((list) => {
        if (alive) setProducts(Object.fromEntries(list.map((p) => [p.id, p])));
      })
      .catch(() => {
        if (alive) setError(t('salesOrders.convert.loadFailed'));
      });
    return () => {
      alive = false;
    };
  }, [quote]);

  const choose = (lineNo: number, patch: Partial<LineChoice>) =>
    setChoices({ ...choices, [lineNo]: { ...choices[lineNo]!, ...patch } });
  const productOf = (lineNo: number, productId: string | null) =>
    productId ? (products?.[productId] ?? null) : choices[lineNo]!.product;
  const ready =
    !!products &&
    quote.lines.every((l) => {
      const product = productOf(l.line_no, l.product_id);
      return (
        !!product &&
        serialsReady({ ...choices[l.line_no]!, quantity: l.quantity }, product.is_serialized)
      );
    });

  async function submit() {
    const line_options: OrderFromQuotationBody['line_options'] = {};
    for (const l of quote.lines) {
      const c = choices[l.line_no]!,
        product = productOf(l.line_no, l.product_id);
      line_options[String(l.line_no)] = {
        fulfilment: c.fulfilment,
        ...(l.product_id || !c.product ? {} : { product_id: c.product.id }),
        ...(product && needsSerials(product.is_serialized, c.fulfilment)
          ? { unit_ids: c.unit_ids }
          : {}),
      };
    }
    setBusy(true);
    setError('');
    try {
      const order = await salesOrdersApi.fromQuote(
        quote.id,
        { delivery_address: address.trim() || null, line_options },
        key,
      );
      navigate(`/sales/orders/${order.id}`);
    } catch (e) {
      setError(salesOrderErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('salesOrders.convert.title')}
      description={t('salesOrders.convert.help')}
    >
      <div className="sales-order-page sales-order-form">
        {error && <p role="alert">{error}</p>}
        {!products && !error && <p>{t('salesOrders.convert.loading')}</p>}
        <label>
          {t('salesOrders.header.deliveryAddress')}
          <textarea maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        {quote.lines.map((l) => {
          const c = choices[l.line_no]!,
            product = productOf(l.line_no, l.product_id);
          const taken = new Set(
            Object.entries(choices).flatMap(([no, o]) =>
              Number(no) === l.line_no ? [] : o.unit_ids,
            ),
          );
          return (
            <fieldset className="sales-order-line" key={l.id}>
              <legend>
                {t('salesOrders.convert.line', { no: l.line_no, description: l.description ?? '' })}
              </legend>
              <p>
                {l.quantity} × {formatMoney(l.unit_price)}
              </p>
              {!l.product_id && (
                <ProductPicker
                  label={t('salesOrders.convert.product')}
                  value={c.product}
                  onPick={(p) => choose(l.line_no, { product: p, unit_ids: [] })}
                />
              )}
              <label>
                {t('salesOrders.lines.fulfilment')}
                <select
                  value={c.fulfilment}
                  onChange={(e) =>
                    choose(l.line_no, { fulfilment: FulfilmentMode.parse(e.target.value) })
                  }
                >
                  {FulfilmentMode.options.map((f) => (
                    <option key={f} value={f}>
                      {t(`salesOrders.fulfilment.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
              {product && needsSerials(product.is_serialized, c.fulfilment) && (
                <SerialPicker
                  productId={product.id}
                  branchId={quote.branch_id}
                  quantity={l.quantity}
                  value={c.unit_ids}
                  taken={taken}
                  onChange={(unit_ids) => choose(l.line_no, { unit_ids })}
                />
              )}
            </fieldset>
          );
        })}
        <div className="sales-order-actions">
          <button type="button" disabled={busy || !ready} onClick={() => void submit()}>
            {t('salesOrders.convert.submit')}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            {t('salesOrders.convert.close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
