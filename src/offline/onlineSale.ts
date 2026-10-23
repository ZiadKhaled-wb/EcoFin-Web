import { addMoney, type SaleCreateInput } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import type { OfflineDb } from './db';
import { OfflineSaleRefused, recordOfflineSale, type OfflineCartLine } from './sale';
import { useOfflineStore } from './store';
import { onlineKey, type OfflineEntry, type OnlineEntry, type SnapshotRecord } from './types';

/** No answer: a network error or the 8 s timeout (D1.3). The server may or may not have the sale. */
export const isUnknownOutcome = (err: unknown) => err instanceof ApiError && err.status === 0;

async function putOnline(db: OfflineDb, key: string) {
  const entry: OnlineEntry = {
    kind: 'online',
    idempotencyKey: key,
    createdAt: new Date().toISOString(),
  };
  await db.transaction(['outbox'], 'readwrite', (tx) => {
    tx.put('outbox', onlineKey(key), entry);
    return Promise.resolve();
  });
}

async function dropOnline(db: OfflineDb, key: string) {
  await db.transaction(['outbox'], 'readwrite', (tx) => {
    tx.delete('outbox', onlineKey(key));
    return Promise.resolve();
  });
}

/**
 * The cart of an online sale as an offline sale (D4), or null when it can't be one: a customer,
 * a discount, a price override, a non-cash payment, or a product or unit the snapshot can't sell.
 */
export function offlineCartOf(
  body: SaleCreateInput,
  snapshot: SnapshotRecord,
): { lines: OfflineCartLine[]; tendered: string } | null {
  const payments = body.payments ?? [];
  if (body.customer_id || body.sale_discount) return null;
  if (payments.length === 0 || payments.some((p) => p.method !== 'cash')) return null;
  const lines: OfflineCartLine[] = [];
  for (const l of body.lines) {
    if (l.unit_price !== undefined || l.discount !== undefined) return null;
    const product = snapshot.data.products.find((p) => p.id === l.product_id);
    if (!product || !product.offline_sellable) return null;
    const unit = l.unit_id ? product.units.find((u) => u.unit_id === l.unit_id) : undefined;
    if (l.unit_id && !unit) return null;
    lines.push({ product, quantity: l.quantity, unit: unit ?? null });
  }
  const tendered = payments.reduce(
    (sum, p) => addMoney(sum, p.method === 'cash' ? (p.tendered ?? p.amount) : '0.00'),
    '0.00',
  );
  return { lines, tendered };
}

/**
 * D1: an online sale goes through the outbox. The entry is written first, then the sale is sent
 * with its key; an answer (a sale or a refusal) removes the entry. With no answer the device goes
 * offline and the same cart, with the same key, becomes an offline sale when it can be one
 * (D1.4); the online attempt is dropped either way and never retried.
 */
export async function sellThroughOutbox<T>(
  body: SaleCreateInput,
  key: string,
  send: () => Promise<T>,
): Promise<{ sale: T } | { offline: OfflineEntry }> {
  const db = useOfflineStore.getState().db;
  if (!db) return { sale: await send() };
  await putOnline(db, key);
  try {
    const sale = await send();
    await dropOnline(db, key);
    return { sale };
  } catch (err) {
    if (!isUnknownOutcome(err)) {
      await dropOnline(db, key);
      throw err;
    }
    const store = useOfflineStore.getState();
    store.dispatch({ type: 'sale-failed' });
    const cart = store.snapshot ? offlineCartOf(body, store.snapshot) : null;
    if (!cart || !store.lease || !store.snapshot) {
      await dropOnline(db, key);
      throw err;
    }
    try {
      const entry = await recordOfflineSale({
        db,
        lease: store.lease,
        snapshot: store.snapshot,
        lines: cart.lines,
        tendered: cart.tendered,
        idempotencyKey: key,
      });
      await store.reload();
      store.set({ fallback: entry, unlocked: true });
      return { offline: entry };
    } catch (refused) {
      await dropOnline(db, key);
      if (refused instanceof OfflineSaleRefused) throw err;
      throw refused;
    }
  }
}
