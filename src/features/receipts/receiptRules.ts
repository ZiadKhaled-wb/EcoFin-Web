import type { Sale, SaleStatus, ShopSettings } from '@ziadkhaled-wb/contracts';

/** A sale as the POS answers it, or as the sale page reads it (S07 adds the branch and the status). */
export type ReceiptSale = Sale & {
  branch?: { name: string };
  status?: SaleStatus;
  /** How many times the receipt was printed, when the server said so (the sale page). */
  receipt_prints?: number;
};

export type ReceiptShop = Pick<
  ShopSettings,
  | 'name'
  | 'address'
  | 'phone'
  | 'tax_registration_no'
  | 'timezone'
  | 'receipt_header'
  | 'receipt_footer'
  | 'receipt_width_mm'
  | 'receipt_fields'
>;

/** D68: a print is never held up longer than this by the print log. */
export const PRINT_LOG_WAIT_MS = 4000;

/** D68: how long the print dialog waits for an ETA receipt that is still being built. */
export const ETA_POLL = { everyMs: 2000, tries: 5 };

const QR_STATUSES = ['pending', 'submitted', 'accepted'];

/** D68: the UUID whenever there is one; the QR code only for a live receipt of a sale that stands. */
export function etaOnReceipt(sale: ReceiptSale) {
  const eta = sale.eta ?? null;
  if (!eta) return { uuid: null, qr: null, pending: false };
  const live = QR_STATUSES.includes(eta.status) && sale.status !== 'voided';
  const qr = live ? eta.qr_payload : null;
  // Still being issued: the paper says so instead of passing for a complete tax receipt.
  return {
    uuid: eta.uuid,
    qr,
    pending: eta.status === 'pending' && !qr && sale.status !== 'voided',
  };
}
