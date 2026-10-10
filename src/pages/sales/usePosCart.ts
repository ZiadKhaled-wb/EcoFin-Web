import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SaleQuoteBody,
  type Product,
  type ProductUnit,
  type Sale,
  type SaleLineInput,
  type SalePaymentInput,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { getLanguage } from '@/i18n';
import { cashKeys } from '@/services/cashApi';
import { saleKeys, salesApi } from '@/services/salesApi';
import { shiftKeys } from '@/services/shiftsApi';
import { stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';

/** One line of the cart as the cashier edits it; the server prices it through the quote. */
export interface CartLine {
  key: string;
  product_id: string;
  name: string;
  sku: string;
  unit_id: string | null;
  serial: string | null;
  /** Typed text; a whole number above 0 once valid. */
  quantity: string;
  /** An override typed by someone with price.override; empty = the list price. */
  price: string;
}

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const QUOTE_DELAY_MS = 250;

export const productName = (p: { name_ar: string; name_en: string | null }) =>
  getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;

/** What the server is asked to price or sell; null while a quantity or price is not valid yet. */
export function cartLines(lines: readonly CartLine[]): SaleLineInput[] | null {
  const out: SaleLineInput[] = [];
  for (const l of lines) {
    const quantity = l.unit_id ? 1 : Number(l.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return null;
    if (l.price !== '' && !MONEY.test(l.price)) return null;
    out.push({
      product_id: l.product_id,
      quantity,
      ...(l.unit_id ? { unit_id: l.unit_id } : {}),
      ...(l.price !== '' ? { unit_price: l.price } : {}),
    });
  }
  return out;
}

/**
 * S01: the cart of the sale screen. It holds what the cashier chose, asks the server for the
 * prices after every change (the quote) and sells the cart at the quoted total. S06 builds the
 * full POS on this hook.
 *
 * The idempotency key belongs to the cart's content: the same cart sent twice (a double click, a
 * retry after a lost answer) is one sale; a changed cart is a new sale with a new key.
 *
 * S02: confirming sells with the payment lines the cashier chose in the payment dialog. The sale's
 * customer (set by whoever opens the screen; S06 will pick it) is sent with the quote and the
 * sale, so store credit can be offered.
 */
export function usePosCart(enabled: boolean) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [done, setDone] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);

  const change = (update: (list: CartLine[]) => CartLine[]) => {
    setLines(update);
    setKey(crypto.randomUUID());
  };
  const addProduct = (product: Product) =>
    change((list) =>
      list.some((l) => !l.unit_id && l.product_id === product.id)
        ? list
        : [
            ...list,
            {
              key: product.id,
              product_id: product.id,
              name: productName(product),
              sku: product.sku,
              unit_id: null,
              serial: null,
              quantity: '1',
              price: '',
            },
          ],
    );
  const addUnits = (product: Product, units: readonly ProductUnit[]) =>
    change((list) => [
      ...list,
      ...units
        .filter((u) => !list.some((l) => l.unit_id === u.id))
        .map((u) => ({
          key: u.id,
          product_id: product.id,
          name: productName(product),
          sku: product.sku,
          unit_id: u.id,
          serial: u.serial,
          quantity: '1',
          price: '',
        })),
    ]);
  const setQuantity = (lineKey: string, quantity: string) =>
    change((list) => list.map((l) => (l.key === lineKey ? { ...l, quantity } : l)));
  const setPrice = (lineKey: string, price: string) =>
    change((list) => list.map((l) => (l.key === lineKey ? { ...l, price } : l)));
  const setCustomer = (id: string | null) => {
    setCustomerId(id);
    setKey(crypto.randomUUID());
  };
  const remove = (lineKey: string) => change((list) => list.filter((l) => l.key !== lineKey));

  // The quote follows the cart a moment after the last change.
  const wanted = cartLines(lines);
  const wantedText =
    wanted && wanted.length > 0
      ? JSON.stringify({ lines: wanted, ...(customerId ? { customer_id: customerId } : {}) })
      : '';
  const [quotedText, setQuotedText] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuotedText(wantedText), wantedText ? QUOTE_DELAY_MS : 0);
    return () => clearTimeout(id);
  }, [wantedText]);
  const quote = useQuery({
    queryKey: saleKeys.quote(orgId, quotedText),
    queryFn: () => salesApi.quote(SaleQuoteBody.parse(JSON.parse(quotedText))),
    enabled: enabled && quotedText !== '',
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  /** The quote answers exactly the cart on screen (not an older cart, not still loading). */
  const current =
    wantedText !== '' && quotedText === wantedText && quote.isSuccess && !quote.isFetching;

  /** Sells the cart at the quoted total, paid by `payments`. Returns the error of a refused sale, or null. */
  async function confirm(payments: SalePaymentInput[]): Promise<unknown> {
    if (posting.current || !current || !wanted || !quote.data) return null;
    posting.current = true;
    setBusy(true);
    try {
      const sale = await salesApi.create(
        {
          lines: wanted,
          expected_total: quote.data.total,
          payments,
          ...(customerId ? { customer_id: customerId } : {}),
        },
        key,
      );
      setDone(sale);
      await Promise.all([
        cache.invalidateQueries({ queryKey: shiftKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
      ]);
      return null;
    } catch (err) {
      // A refused sale wrote nothing: the cashier can fix the cart and confirm again.
      posting.current = false;
      setBusy(false);
      if (
        err instanceof ApiError &&
        (err.code === 'PRICE_CHANGED' || err.code === 'OUT_OF_STOCK')
      ) {
        await quote.refetch();
      }
      return err;
    }
  }

  /** After a completed sale: an empty cart and a new key. */
  function reset() {
    setLines([]);
    setKey(crypto.randomUUID());
    setDone(null);
    setBusy(false);
    posting.current = false;
  }

  return {
    lines,
    customerId,
    setCustomer,
    addProduct,
    addUnits,
    setQuantity,
    setPrice,
    remove,
    quote: wantedText !== '' ? quote.data : undefined,
    quoteError: wantedText !== '' && quotedText === wantedText ? quote.error : null,
    quoting: wantedText !== '' && (quotedText !== wantedText || quote.isFetching),
    current,
    busy,
    done,
    confirm,
    reset,
  };
}
