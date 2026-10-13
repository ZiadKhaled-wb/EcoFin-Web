import type { Sale, SaleStatus, ShopSettings } from '@ziadkhaled-wb/contracts';

/** A sale as the POS answers it, or as the sale page reads it (S07 adds the branch and the status). */
export type ReceiptSale = Sale & { branch?: { name: string }; status?: SaleStatus };

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

/** D68: how long the print dialog waits for an ETA receipt that is still being built. */
export const ETA_POLL = { everyMs: 2000, tries: 5 };

const QR_STATUSES = ['pending', 'submitted', 'accepted'];

/** D68: the UUID whenever there is one; the QR code only for a live receipt of a sale that stands. */
export function etaOnReceipt(sale: ReceiptSale) {
  const eta = sale.eta ?? null;
  if (!eta) return { uuid: null, qr: null };
  const live = QR_STATUSES.includes(eta.status) && sale.status !== 'voided';
  return { uuid: eta.uuid, qr: live ? eta.qr_payload : null };
}
