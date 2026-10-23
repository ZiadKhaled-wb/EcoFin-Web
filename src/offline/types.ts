import type { OfflineLeaseResponse, OfflineSnapshotData } from '@ziadkhaled-wb/contracts';
import type { ReceiptShop } from '@/features/receipts/receiptRules';

/** The last lease of this device (D2), with what offline work needs next to it. */
export interface LeaseRecord {
  lease: OfflineLeaseResponse['lease'];
  offline_code: string;
  eta: OfflineLeaseResponse['eta'];
  /** server_time - local time when the lease arrived (D6.4). */
  offsetMs: number;
  /** navigator.storage.persist() was granted (D14.4): offline is off without it. */
  persisted: boolean;
  /** The shop's receipt settings, kept for printing offline (S04). */
  shop: ReceiptShop | null;
}

export interface SnapshotRecord {
  hash: string;
  data: OfflineSnapshotData;
}

/** The device's offline counters (D6.3, D8, D3.4), reset with each new lease where noted. */
export interface CountersRecord {
  leaseId: string;
  /** The last sequence used (never reset). */
  seq: number;
  /** The previousUUID of the next receipt (the last receipt of this device). */
  head: string;
  /** issued_at of the last offline sale (never reset): issue times never go back. */
  lastIssuedAt: string | null;
  /** Per lease: quantity sold offline per product, serials sold, number and total of sales. */
  sold: Record<string, number>;
  serials: string[];
  salesCount: number;
  salesTotal: string;
}

/** One line as the offline receipt prints it. */
export interface OfflineReceiptLine {
  id: string;
  product_id: string;
  name_ar: string;
  name_en: string | null;
  sku: string;
  is_serialized: boolean;
  unit_id: string | null;
  serial: string | null;
  quantity: number;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  line_total: string;
}

/** An offline sale waiting to sync (outbox, key 'off:<seq>'). */
export interface OfflineEntry {
  kind: 'offline';
  seq: number;
  number: string;
  idempotencyKey: string;
  content: string;
  signature: string;
  issuedAt: string;
  total: string;
  subtotal: string;
  taxTotal: string;
  tendered: string;
  change: string;
  uuid: string | null;
  qr: string | null;
  branchId: string;
  shiftId: string;
  pricesIncludeVat: boolean;
  lines: OfflineReceiptLine[];
  /** The receipt went to the printer once: later prints are copies (D6.6). */
  printed: boolean;
  createdAt: string;
}

/** An online sale being sent (outbox, key 'on:<idempotency key>'), dropped once answered (D1.4). */
export interface OnlineEntry {
  kind: 'online';
  idempotencyKey: string;
  createdAt: string;
}

export type OutboxEntry = OfflineEntry | OnlineEntry;

/** A sale the server refused (D9.5): kept for the manager, counted as synced. */
export interface RejectedEntry {
  seq: number;
  number: string;
  total: string;
  code: string | null;
  rejectedAt: string;
  content: string;
  signature: string;
}

export const offlineKey = (seq: number) => `off:${String(seq).padStart(9, '0')}`;
export const onlineKey = (idempotencyKey: string) => `on:${idempotencyKey}`;
