import type { ReceiptSale } from '@/features/receipts/receiptRules';
import type { OfflineEntry } from './types';

/**
 * S08 (D6, S04): an offline sale as S04's receipt prints it. Every figure is the sale's own
 * (nothing is added up here); the ETA block carries the UUID and QR the device computed, so the
 * printed receipt is the one the server will submit.
 */
export function offlineReceiptSale(entry: OfflineEntry): ReceiptSale {
  return {
    id: entry.idempotencyKey,
    number: entry.number,
    branch_id: entry.branchId,
    shift_id: entry.shiftId,
    shift_number: null,
    customer_id: null,
    customer_name: null,
    prices_include_vat: entry.pricesIncludeVat,
    subtotal: entry.subtotal,
    discount_total: '0.00',
    discount_reason: null,
    tax_total: entry.taxTotal,
    total: entry.total,
    business_date: entry.issuedAt.slice(0, 10),
    issued_at: entry.issuedAt,
    created_by_name: null,
    lines: entry.lines.map((line, i) => ({
      id: line.id,
      line_no: i + 1,
      product_id: line.product_id,
      name_ar: line.name_ar,
      name_en: line.name_en,
      sku: line.sku,
      is_serialized: line.is_serialized,
      unit_id: line.unit_id,
      serial: line.serial,
      quantity: line.quantity,
      unit_price: line.unit_price,
      tax_rate: line.tax_rate,
      tax_amount: line.tax_amount,
      line_total: line.line_total,
      discount_amount: '0.00',
      warranty_until: null,
    })),
    payments: [
      {
        id: entry.idempotencyKey,
        number: entry.number,
        method: 'cash',
        amount: entry.total,
        cash_account_id: null,
        cash_account_name: null,
        reference: null,
        tendered: entry.tendered,
        change: entry.change,
      },
    ],
    paid_total: entry.total,
    change_total: entry.change,
    eta: entry.uuid
      ? { status: 'pending', uuid: entry.uuid, qr_payload: entry.qr, last_error_code: null }
      : null,
  };
}
