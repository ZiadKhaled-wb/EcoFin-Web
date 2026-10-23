import {
  addMoney,
  buildOfflineReceiptBody,
  compareMoney,
  computeOfflineTotals,
  offlineSaleNumber,
  qrPayload,
  receiptUuidInput,
  subtractMoney,
  toJson,
  withReceiptUuid,
  writeOfflineContent,
  type OfflineContentLine,
  type OfflineSnapshotProduct,
} from '@ziadkhaled-wb/contracts';
import type { OfflineDb } from './db';
import { signContent } from './device';
import {
  offlineKey,
  onlineKey,
  type CountersRecord,
  type LeaseRecord,
  type OfflineEntry,
  type SnapshotRecord,
} from './types';

/** One line of an offline cart: a snapshot product, a quantity, a unit for a serialized one. */
export interface OfflineCartLine {
  product: OfflineSnapshotProduct;
  quantity: number;
  unit: { unit_id: string; serial: string } | null;
}

export type OfflineRefusal =
  | 'NO_LEASE'
  | 'LEASE_EXPIRED'
  | 'NOT_SELLABLE'
  | 'OUT_OF_STOCK'
  | 'SERIAL_TAKEN'
  | 'MAX_SALE'
  | 'MAX_SALES'
  | 'MAX_LEASE_TOTAL'
  | 'TENDERED_SHORT'
  | 'EMPTY';

export const emptyCounters = (leaseId: string, previous?: CountersRecord): CountersRecord => ({
  leaseId,
  seq: previous?.seq ?? 0,
  head: previous?.head ?? '',
  lastIssuedAt: previous?.lastIssuedAt ?? null,
  sold: {},
  serials: [],
  salesCount: 0,
  salesTotal: '0.00',
});

/** The line totals and the sale total, by T01 (the same engine as the server). */
export function offlineTotals(lines: readonly OfflineCartLine[], pricesIncludeVat: boolean) {
  return computeOfflineTotals(
    lines.map((l) => ({
      unit_price: l.product.price ?? '0.00',
      quantity: l.quantity,
      tax_rate: l.product.tax_rate,
    })),
    pricesIncludeVat,
  );
}

/**
 * D2.5, D3.4, D4: what forbids this cart offline, or null. Only the lease, the snapshot and the
 * counters are read: everything the POS may do offline is decided on the device.
 */
export function offlineRefusal(
  lines: readonly OfflineCartLine[],
  lease: LeaseRecord | undefined,
  counters: CountersRecord | undefined,
  now: number,
  pricesIncludeVat: boolean,
  tendered?: string,
): OfflineRefusal | null {
  if (!lease || !lease.persisted) return 'NO_LEASE';
  if (now + lease.offsetMs >= Date.parse(lease.lease.expires_at)) return 'LEASE_EXPIRED';
  if (lines.length === 0) return 'EMPTY';
  const sold = counters?.leaseId === lease.lease.id ? counters : emptyCounters(lease.lease.id);
  const asked = new Map<string, number>();
  for (const line of lines) {
    if (!line.product.offline_sellable || line.product.price === null) return 'NOT_SELLABLE';
    if (line.product.is_serialized) {
      if (!line.unit || !line.product.units.some((u) => u.unit_id === line.unit!.unit_id)) {
        return 'SERIAL_TAKEN';
      }
      if (sold.serials.includes(line.unit.unit_id)) return 'SERIAL_TAKEN';
      if (lines.filter((l) => l.unit?.unit_id === line.unit!.unit_id).length > 1)
        return 'SERIAL_TAKEN';
    } else {
      asked.set(line.product.id, (asked.get(line.product.id) ?? 0) + line.quantity);
    }
  }
  for (const [productId, quantity] of asked) {
    const product = lines.find((l) => l.product.id === productId)!.product;
    if (quantity > (product.on_hand ?? 0) - (sold.sold[productId] ?? 0)) return 'OUT_OF_STOCK';
  }
  const total = offlineTotals(lines, pricesIncludeVat).total;
  const limits = lease.lease.limits;
  if (compareMoney(total, limits.max_sale_total) > 0) return 'MAX_SALE';
  if (sold.salesCount + 1 > limits.max_sales) return 'MAX_SALES';
  if (compareMoney(addMoney(sold.salesTotal, total), limits.max_lease_total) > 0) {
    return 'MAX_LEASE_TOTAL';
  }
  if (tendered !== undefined && compareMoney(tendered, total) < 0) return 'TENDERED_SHORT';
  return null;
}

const isoSeconds = (ms: number) =>
  new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

/** D6.4: the device clock corrected by the lease's offset, never before the previous sale. */
export function offlineIssuedAt(
  now: number,
  offsetMs: number,
  lastIssuedAt: string | null,
): string {
  const corrected = now + offsetMs;
  const floor = lastIssuedAt ? Date.parse(lastIssuedAt) : 0;
  return isoSeconds(Math.max(corrected, floor));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface OfflineSaleInput {
  db: OfflineDb;
  lease: LeaseRecord;
  snapshot: SnapshotRecord;
  lines: readonly OfflineCartLine[];
  tendered: string;
  /** The cart's key: a fresh one, or the key of an online attempt with no answer (D1.4). */
  idempotencyKey: string;
  now?: number;
}

/**
 * D6: builds, signs and saves one offline sale. The content (and its receipt, UUID and QR when
 * ETA is on) is built with the contracts' T01 totals and T02 builder, the UUID hashed with
 * crypto.subtle, the content signed with the device key; then ONE transaction stores the sale,
 * the new sequence, the new chain head, the issue time and the local stock, and drops the online
 * attempt with the same key. Nothing is printed before that commits.
 */
export async function recordOfflineSale(input: OfflineSaleInput): Promise<OfflineEntry> {
  const { db, lease, snapshot } = input;
  const now = input.now ?? Date.now();
  const before = await db.transaction(['counters'], 'readonly', (tx) =>
    tx.get<CountersRecord>('counters', 'device'),
  );
  const refusal = offlineRefusal(
    input.lines,
    lease,
    before,
    now,
    snapshot.data.prices_include_vat,
    input.tendered,
  );
  if (refusal) throw new OfflineSaleRefused(refusal);
  const counters =
    before?.leaseId === lease.lease.id ? before : emptyCounters(lease.lease.id, before);
  const seq = Math.max(counters.seq + 1, lease.lease.next_seq);
  const prices = snapshot.data.prices_include_vat;
  const totals = offlineTotals(input.lines, prices);
  const lines: OfflineContentLine[] = input.lines.map((l, i) => ({
    product_id: l.product.id,
    unit_id: l.unit?.unit_id ?? null,
    quantity: l.quantity,
    unit_price: l.product.price ?? '0.00',
    tax_rate: l.product.tax_rate,
    tax_amount: totals.lines[i]!.tax_amount,
    line_total: totals.lines[i]!.line_total,
  }));
  const number = offlineSaleNumber(lease.offline_code, seq);
  const issuedAt = offlineIssuedAt(now, lease.offsetMs, counters.lastIssuedAt);
  const change = subtractMoney(input.tendered, totals.total);

  let receiptJson: string | null = null;
  let uuid: string | null = null;
  let qr: string | null = null;
  if (lease.eta.enabled && lease.eta.seller) {
    const body = buildOfflineReceiptBody(
      {
        number,
        issued_at: issuedAt,
        prices_include_vat: prices,
        total: totals.total,
        lines: lines.map((line, i) => ({ ...line, product: input.lines[i]!.product })),
        seller: lease.eta.seller,
        device_serial: lease.eta.device_serial,
      },
      counters.head,
    );
    uuid = await sha256Hex(receiptUuidInput(body));
    const receipt = withReceiptUuid(body, uuid);
    receiptJson = toJson(receipt);
    if (lease.eta.portal_url) {
      qr = qrPayload({
        portalUrl: lease.eta.portal_url,
        uuid,
        dateTimeIssued: receipt.header.dateTimeIssued,
        totalAmount: receipt.totalAmount.text,
        rin: receipt.seller.rin,
      });
    }
  }
  const content = writeOfflineContent(
    {
      lease_id: lease.lease.id,
      device_id: lease.lease.device_id,
      seq,
      number,
      idempotency_key: input.idempotencyKey,
      issued_at: issuedAt,
      cashier_id: lease.lease.cashier_id,
      lines,
      subtotal: totals.subtotal,
      tax_total: totals.tax_total,
      total: totals.total,
      payments: [{ method: 'cash', amount: totals.total, tendered: input.tendered, change }],
    },
    receiptJson,
  );
  const signature = await signContent(db, content);

  const entry: OfflineEntry = {
    kind: 'offline',
    seq,
    number,
    idempotencyKey: input.idempotencyKey,
    content,
    signature,
    issuedAt,
    total: totals.total,
    subtotal: totals.subtotal,
    taxTotal: totals.tax_total,
    tendered: input.tendered,
    change,
    uuid,
    qr,
    branchId: lease.lease.branch_id,
    shiftId: lease.lease.shift_id,
    pricesIncludeVat: prices,
    lines: input.lines.map((l, i) => ({
      id: crypto.randomUUID(),
      product_id: l.product.id,
      name_ar: l.product.name_ar,
      name_en: l.product.name_en,
      sku: l.product.sku,
      is_serialized: l.product.is_serialized,
      unit_id: l.unit?.unit_id ?? null,
      serial: l.unit?.serial ?? null,
      quantity: l.quantity,
      unit_price: lines[i]!.unit_price,
      tax_rate: lines[i]!.tax_rate,
      tax_amount: lines[i]!.tax_amount,
      line_total: lines[i]!.line_total,
    })),
    printed: false,
    createdAt: new Date(now).toISOString(),
  };
  const sold = { ...counters.sold };
  for (const line of input.lines) {
    if (!line.product.is_serialized)
      sold[line.product.id] = (sold[line.product.id] ?? 0) + line.quantity;
  }
  const next: CountersRecord = {
    ...counters,
    seq,
    head: uuid ?? counters.head,
    lastIssuedAt: issuedAt,
    sold,
    serials: [...counters.serials, ...input.lines.flatMap((l) => (l.unit ? [l.unit.unit_id] : []))],
    salesCount: counters.salesCount + 1,
    salesTotal: addMoney(counters.salesTotal, totals.total),
  };
  await db.transaction(['outbox', 'counters'], 'readwrite', async (tx) => {
    const current = await tx.get<CountersRecord>('counters', 'device');
    if ((current?.seq ?? 0) !== (before?.seq ?? 0))
      throw new Error('Another sale was saved meanwhile');
    tx.put('outbox', offlineKey(seq), entry);
    tx.delete('outbox', onlineKey(input.idempotencyKey));
    tx.put('counters', 'device', next);
  });
  return entry;
}

export class OfflineSaleRefused extends Error {
  readonly code: OfflineRefusal;

  constructor(code: OfflineRefusal) {
    super(code);
    this.name = 'OfflineSaleRefused';
    this.code = code;
  }
}

/** D6.6: the receipt was printed; a later print is a copy. */
export async function markPrinted(db: OfflineDb, seq: number): Promise<void> {
  await db.transaction(['outbox'], 'readwrite', async (tx) => {
    const entry = await tx.get<OfflineEntry>('outbox', offlineKey(seq));
    if (entry) tx.put('outbox', offlineKey(seq), { ...entry, printed: true });
  });
}
