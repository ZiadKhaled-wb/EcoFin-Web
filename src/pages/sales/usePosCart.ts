import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Discount,
  OFFLINE_SALE_TIMEOUT_MS,
  SaleQuoteBody,
  compareMoney,
  type Contract,
  type Product,
  type Sale,
  type InstallmentFrequency,
  type SaleLineInput,
  type SalePaymentInput,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { getLanguage } from '@/i18n';
import { cashKeys } from '@/services/cashApi';
import { customerKeys } from '@/services/customersApi';
import { installmentsApi } from '@/services/installmentsApi';
import { saleKeys, salesApi } from '@/services/salesApi';
import { shiftKeys } from '@/services/shiftsApi';
import { stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { sellThroughOutbox } from '@/offline/onlineSale';
import {
  readActiveCart,
  writeActiveCart,
  type CartContent,
  type CartLine,
  type DiscountDraft,
  type PosCustomer,
} from './pos/posStorage';

/**
 * One line of the cart as the cashier edits it; the server prices it through the quote.
 * `quantity` is typed text (a whole number above 0 once valid); `price` is an override typed by
 * someone with price.override (empty = the list price); `discount` is typed text too.
 */
export type { CartLine, DiscountDraft, PosCustomer };

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const QUOTE_DELAY_MS = 250;
const NO_DISCOUNT: DiscountDraft = { type: 'percent', value: '' };

export const productName = (p: { name_ar: string; name_en: string | null }) =>
  getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;

/** What the cart needs to know of a product (a `Product`, or the product of a scanned unit). */
type CartProduct = Pick<Product, 'id' | 'name_ar' | 'name_en' | 'sku'>;

/** A typed discount as the server takes it: undefined = none (empty or zero), null = not valid. */
export function discountOf(draft: DiscountDraft): Discount | undefined | null {
  if (draft.value === '') return undefined;
  const parsed = Discount.safeParse(draft);
  if (!parsed.success) return null;
  return compareMoney(parsed.data.value, '0') === 0 ? undefined : parsed.data;
}

/** What the server is asked to price or sell; null while a quantity, price or discount is not valid yet. */
export function cartLines(lines: readonly CartLine[]): SaleLineInput[] | null {
  const out: SaleLineInput[] = [];
  for (const l of lines) {
    const quantity = l.unit_id ? 1 : Number(l.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return null;
    if (l.price !== '' && !MONEY.test(l.price)) return null;
    const discount = discountOf(l.discount);
    if (discount === null) return null;
    out.push({
      product_id: l.product_id,
      quantity,
      ...(l.unit_id ? { unit_id: l.unit_id } : {}),
      ...(l.price !== '' ? { unit_price: l.price } : {}),
      ...(discount ? { discount } : {}),
    });
  }
  return out;
}

/**
 * S01: the cart of the sale screen. It holds what the cashier chose, asks the server for the
 * prices after every change (the quote) and sells the cart at the quoted total.
 *
 * The idempotency key belongs to the cart's content: the same cart sent twice (a double click, a
 * retry after a lost answer) is one sale; a changed cart is a new sale with a new key.
 *
 * S02: confirming sells with the payment lines the cashier chose in the payment dialog. The sale's
 * customer is sent with the quote and the sale, so store credit can be offered.
 *
 * S06 (D66): the hook also holds the customer the cashier picked, the discounts (S03) and their
 * reason, and keeps the cart in `sessionStorage` **with its key** (`scope` = shop and employee), so
 * a refresh in the middle of a sale and a second Pay is still one sale.
 */
export function usePosCart(enabled: boolean, scope: string) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [stored] = useState(() => readActiveCart(scope));
  const [lines, setLines] = useState<CartLine[]>(stored?.lines ?? []);
  const [key, setKey] = useState(() => stored?.key ?? crypto.randomUUID());
  const [customer, setCustomerState] = useState<PosCustomer | null>(stored?.customer ?? null);
  const [saleDiscount, setSaleDiscountState] = useState<DiscountDraft>(
    stored?.saleDiscount ?? NO_DISCOUNT,
  );
  const [reason, setReasonState] = useState(stored?.reason ?? '');
  const [done, setDone] = useState<Sale | null>(null);
  /** N02: the contract of a completed installment sale. */
  const [doneContract, setDoneContract] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);
  /** N02: one key per installment sale as sent; other terms or payments are another attempt. */
  const installmentKey = useRef<{ text: string; key: string } | null>(null);

  const change = (update: (list: CartLine[]) => CartLine[]) => {
    setLines(update);
    setKey(crypto.randomUUID());
  };
  const patch = (lineKey: string, fields: Partial<CartLine>) =>
    change((list) => list.map((l) => (l.key === lineKey ? { ...l, ...fields } : l)));
  /** A product that is already in the cart gets one more (a second scan of the same barcode). */
  const addProduct = (product: CartProduct) =>
    change((list) => {
      const found = list.find((l) => !l.unit_id && l.product_id === product.id);
      if (found) {
        const quantity = Number(found.quantity);
        const next = Number.isInteger(quantity) && quantity >= 1 ? quantity + 1 : 1;
        return list.map((l) => (l === found ? { ...l, quantity: String(next) } : l));
      }
      return [
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
          discount: NO_DISCOUNT,
        },
      ];
    });
  const addUnits = (product: CartProduct, units: readonly { id: string; serial: string }[]) =>
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
          discount: NO_DISCOUNT,
        })),
    ]);
  // A field that only lost the focus changed nothing: the cart keeps its key (and its approval).
  const lineOf = (lineKey: string) => lines.find((l) => l.key === lineKey);
  const setQuantity = (lineKey: string, quantity: string) => {
    if (lineOf(lineKey)?.quantity !== quantity) patch(lineKey, { quantity });
  };
  /** The `-` and `+` buttons: never below 1. */
  const stepQuantity = (lineKey: string, by: number) =>
    change((list) =>
      list.map((l) => {
        if (l.key !== lineKey || l.unit_id) return l;
        const quantity = Number(l.quantity);
        const next = Number.isInteger(quantity) ? Math.max(1, quantity + by) : 1;
        return { ...l, quantity: String(next) };
      }),
    );
  const setPrice = (lineKey: string, price: string) => {
    if (lineOf(lineKey)?.price !== price) patch(lineKey, { price });
  };
  const sameDiscount = (a: DiscountDraft | undefined, b: DiscountDraft) =>
    a?.type === b.type && a.value === b.value;
  const setLineDiscount = (lineKey: string, discount: DiscountDraft) => {
    if (!sameDiscount(lineOf(lineKey)?.discount, discount)) patch(lineKey, { discount });
  };
  const remove = (lineKey: string) => change((list) => list.filter((l) => l.key !== lineKey));
  const setCustomer = (next: PosCustomer | null) => {
    setCustomerState(next);
    setKey(crypto.randomUUID());
  };
  const setSaleDiscount = (next: DiscountDraft) => {
    if (sameDiscount(saleDiscount, next)) return;
    setSaleDiscountState(next);
    setKey(crypto.randomUUID());
  };
  const setReason = (next: string) => {
    if (next === reason) return;
    setReasonState(next);
    setKey(crypto.randomUUID());
  };

  const customerId = customer?.id ?? null;
  const saleDiscountInput = discountOf(saleDiscount);
  const lineDiscounts = lines.map((l) => discountOf(l.discount));
  const hasDiscount = !!saleDiscountInput || lineDiscounts.some((d) => !!d);
  const discountInvalid = saleDiscountInput === null || lineDiscounts.some((d) => d === null);
  const reasonText = reason.trim();
  /** Any discount needs a reason of 3 to 200 characters. */
  const reasonOk = !hasDiscount || (reasonText.length >= 3 && reasonText.length <= 200);

  // The quote follows the cart a moment after the last change.
  const wanted = cartLines(lines);
  const wantedText =
    wanted && wanted.length > 0 && saleDiscountInput !== null
      ? JSON.stringify({
          lines: wanted,
          ...(customerId ? { customer_id: customerId } : {}),
          ...(saleDiscountInput ? { sale_discount: saleDiscountInput } : {}),
        })
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

  // Decision 4: the cart on screen survives a refresh, with its key. A completed sale removes it.
  const empty =
    lines.length === 0 && customer === null && saleDiscount.value === '' && reason === '';
  useEffect(() => {
    writeActiveCart(scope, done || empty ? null : { lines, customer, saleDiscount, reason, key });
  }, [scope, done, empty, lines, customer, saleDiscount, reason, key]);

  /**
   * Sells the cart at the quoted total, paid by `payments`. `approvalId` is a manager's approval
   * of exactly this cart (S03). Returns the error of a refused sale, or null.
   */
  async function confirm(payments: SalePaymentInput[], approvalId?: string): Promise<unknown> {
    if (posting.current || !current || !wanted || !quote.data || !reasonOk) return null;
    posting.current = true;
    setBusy(true);
    try {
      const body = {
        lines: wanted,
        expected_total: quote.data.total,
        payments,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(saleDiscountInput ? { sale_discount: saleDiscountInput } : {}),
        ...(hasDiscount ? { discount_reason: reasonText } : {}),
        ...(approvalId ? { discount_approval_id: approvalId } : {}),
      };
      // S08 (D1): through the outbox; no answer in 8 s and the cart is an offline sale.
      const outcome = await sellThroughOutbox(body, key, () =>
        salesApi.create(body, key, OFFLINE_SALE_TIMEOUT_MS),
      );
      if ('offline' in outcome) {
        load(null);
        return null;
      }
      const sale = outcome.sale;
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

  /**
   * N02 (D77): sells the cart on installments to its customer, with the terms the cashier agreed
   * on and the down payment lines (none for a down payment of 0.00). The cash price is the quoted
   * total. Returns the error of a refused sale, or null.
   */
  async function confirmInstallment(
    plan: {
      down_payment: string;
      installments_count: number;
      frequency: InstallmentFrequency;
      first_due_date?: string;
      policy_version: number;
      guarantor_ids: string[];
      credit_approval_id?: string;
    },
    payments: SalePaymentInput[] | undefined,
  ): Promise<unknown> {
    if (posting.current || !current || !wanted || !quote.data || !reasonOk || !customerId) {
      return null;
    }
    const body = {
      lines: wanted,
      expected_total: quote.data.total,
      customer_id: customerId,
      terms: {
        down_payment: plan.down_payment,
        installments_count: plan.installments_count,
        frequency: plan.frequency,
        ...(plan.first_due_date ? { first_due_date: plan.first_due_date } : {}),
        policy_version: plan.policy_version,
      },
      guarantor_ids: plan.guarantor_ids,
      ...(plan.credit_approval_id ? { credit_approval_id: plan.credit_approval_id } : {}),
      ...(payments && payments.length > 0 ? { payments } : {}),
      ...(saleDiscountInput ? { sale_discount: saleDiscountInput } : {}),
      ...(hasDiscount ? { discount_reason: reasonText } : {}),
    };
    const text = JSON.stringify(body);
    if (installmentKey.current?.text !== text) {
      installmentKey.current = { text, key: crypto.randomUUID() };
    }
    posting.current = true;
    setBusy(true);
    try {
      const answer = await installmentsApi.sell(body, installmentKey.current.key);
      setDoneContract(answer.contract);
      setDone(answer.sale);
      await Promise.all([
        cache.invalidateQueries({ queryKey: shiftKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: customerKeys.all(orgId) }),
      ]);
      return null;
    } catch (err) {
      // A refused sale wrote nothing: the cashier can change the terms and confirm again.
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

  /** Puts `content` on screen as a new cart with a new key (empty by default). */
  function load(content: CartContent | null) {
    setLines(content?.lines ?? []);
    setCustomerState(content?.customer ?? null);
    setSaleDiscountState(content?.saleDiscount ?? NO_DISCOUNT);
    setReasonState(content?.reason ?? '');
    setKey(crypto.randomUUID());
    setDone(null);
    setDoneContract(null);
    installmentKey.current = null;
    setBusy(false);
    posting.current = false;
  }

  return {
    lines,
    key,
    customer,
    customerId,
    setCustomer,
    addProduct,
    addUnits,
    setQuantity,
    stepQuantity,
    setPrice,
    setLineDiscount,
    remove,
    saleDiscount,
    setSaleDiscount,
    reason,
    setReason,
    hasDiscount,
    discountInvalid,
    reasonOk,
    /** What a held cart keeps, and what an approval is asked for. */
    content: { lines, customer, saleDiscount, reason } satisfies CartContent,
    request: wanted
      ? { lines: wanted, ...(saleDiscountInput ? { sale_discount: saleDiscountInput } : {}) }
      : null,
    quote: wantedText !== '' ? quote.data : undefined,
    quoteError: wantedText !== '' && quotedText === wantedText ? quote.error : null,
    quoting: wantedText !== '' && (quotedText !== wantedText || quote.isFetching),
    current,
    busy,
    done,
    doneContract,
    confirm,
    confirmInstallment,
    /** After a completed sale, New sale or Hold: an empty cart and a new key. */
    reset: () => load(null),
    load,
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
