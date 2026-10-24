import {
  DepositExceedsBalanceDetail,
  RefundMethodNotAllowedDetail,
  RefundMustEqualDepositsDetail,
  type FulfilmentMode,
  type SalesOrderLine,
} from '@ziadkhaled-wb/contracts';
import { t, type TranslationKey } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import messages from '@/i18n/locales/en/salesOrders.json';

/** The server's code as a message of the order pages (S10 codes and reused ones, then a fallback). */
export function salesOrderErrorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'DEPOSIT_EXCEEDS_BALANCE') {
    const d = DepositExceedsBalanceDetail.safeParse((error as ApiError).details);
    return d.success
      ? t('salesOrders.errors.DEPOSIT_EXCEEDS_BALANCE', { max: formatMoney(d.data.max) })
      : t('salesOrders.errors.DEPOSIT_EXCEEDS_BALANCE_NO_MAX');
  }
  if (code === 'REFUND_MUST_EQUAL_DEPOSITS') {
    const d = RefundMustEqualDepositsDetail.safeParse((error as ApiError).details);
    return d.success
      ? t('salesOrders.errors.REFUND_MUST_EQUAL_DEPOSITS', {
          deposits: formatMoney(d.data.deposits),
          refund: formatMoney(d.data.refund),
        })
      : t('salesOrders.errors.REFUND_MUST_EQUAL_DEPOSITS_NO_AMOUNTS');
  }
  if (code === 'REFUND_METHOD_NOT_ALLOWED') {
    const d = RefundMethodNotAllowedDetail.safeParse((error as ApiError).details);
    return d.success
      ? t('salesOrders.errors.REFUND_METHOD_NOT_ALLOWED', {
          max: formatMoney(d.data.cash_bank_max),
          refund: formatMoney(d.data.cash_bank_refund),
        })
      : t('salesOrders.errors.REFUND_METHOD_NOT_ALLOWED_NO_AMOUNTS');
  }
  // The AR and EN files hold the same keys, so the EN file says which codes have a message.
  return code && Object.hasOwn(messages.errors, code)
    ? t(`salesOrders.errors.${code}` as TranslationKey)
    : t('salesOrders.errors.fallback');
}

/** How a line is being filled, in words: its reservation (and serials) or its purchase order. */
export function fulfilmentText(line: SalesOrderLine) {
  if (line.fulfilment === 'from_stock') {
    const reserved = t('salesOrders.fulfilment.reserved', {
      reserved: line.reserved,
      quantity: line.quantity,
    });
    return line.reserved_units.length
      ? [
          reserved,
          t('salesOrders.fulfilment.serials', {
            serials: line.reserved_units.map((u) => u.serial).join(', '),
          }),
        ]
      : [reserved];
  }
  const po = line.purchase_order;
  if (!po) return [t('salesOrders.fulfilment.noPurchaseOrder')];
  return [
    t('salesOrders.fulfilment.purchaseOrder', {
      number: po.number,
      status: t(`purchases.orders.status.${po.status}`),
    }),
    t('salesOrders.fulfilment.poReceived', { received: po.received, ordered: po.ordered }),
  ];
}

/** Decision 3: a serialized product filled from stock names its units when the order is made. */
export const needsSerials = (serialized: boolean, fulfilment: FulfilmentMode) =>
  serialized && fulfilment === 'from_stock';

/** The line can be sent: no serials needed, or exactly `quantity` distinct units picked. */
export function serialsReady(
  line: { fulfilment: FulfilmentMode; quantity: number; unit_ids: readonly string[] },
  serialized: boolean,
) {
  if (!needsSerials(serialized, line.fulfilment)) return true;
  return line.unit_ids.length === line.quantity && new Set(line.unit_ids).size === line.quantity;
}
