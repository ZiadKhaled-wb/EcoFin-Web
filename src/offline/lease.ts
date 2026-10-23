import type { OfflineLeaseResponse } from '@ziadkhaled-wb/contracts';
import type { ReceiptShop } from '@/features/receipts/receiptRules';
import type { OfflineDb } from './db';
import { publicKeyBase64, requestPersistence } from './device';
import { emptyCounters } from './sale';
import type { CountersRecord, LeaseRecord, OutboxEntry, SnapshotRecord } from './types';

/**
 * S08 (D2, D3): asks the server for a lease (when the shift opens, every 15 minutes, after each
 * sync) and keeps it with the snapshot it points at. The snapshot travels only when the device's
 * copy is not the server's (its hash differs). A new lease starts its own sold counters; the
 * sequence and the chain head go on from the device's own while sales still wait to sync.
 */
export async function refreshLease(
  db: OfflineDb,
  request: (body: {
    public_key: string;
    snapshot_hash: string | null;
  }) => Promise<OfflineLeaseResponse>,
  shop: ReceiptShop | null,
  now: () => number = Date.now,
): Promise<LeaseRecord> {
  const persisted = await requestPersistence();
  const current = await db.transaction(['snapshot'], 'readonly', (tx) =>
    tx.get<SnapshotRecord>('snapshot', 'current'),
  );
  const sentAt = now();
  const answer = await request({
    public_key: await publicKeyBase64(db),
    snapshot_hash: current?.hash ?? null,
  });
  const receivedAt = now();
  const record: LeaseRecord = {
    lease: answer.lease,
    offline_code: answer.offline_code,
    eta: answer.eta,
    offsetMs: Date.parse(answer.server_time) - Math.round((sentAt + receivedAt) / 2),
    persisted,
    shop,
  };
  await db.transaction(['lease', 'snapshot', 'counters', 'outbox'], 'readwrite', async (tx) => {
    tx.put('lease', 'current', record);
    if (answer.snapshot) {
      tx.put('snapshot', 'current', { hash: answer.lease.snapshot_hash, data: answer.snapshot });
    }
    const counters = await tx.get<CountersRecord>('counters', 'device');
    const waiting = (await tx.all<OutboxEntry>('outbox')).some((e) => e.kind === 'offline');
    if (counters?.leaseId !== answer.lease.id) {
      const next = emptyCounters(answer.lease.id, counters);
      // Nothing waits: the server's chain head and sequence are the device's.
      if (!waiting) {
        next.head = answer.lease.chain_head;
        next.seq = Math.max(next.seq, answer.lease.next_seq - 1);
      }
      tx.put('counters', 'device', next);
    }
  });
  return record;
}

/** The lease, snapshot and counters as offline selling reads them. */
export async function offlineState(db: OfflineDb) {
  return db.transaction(['lease', 'snapshot', 'counters'], 'readonly', async (tx) => ({
    lease: await tx.get<LeaseRecord>('lease', 'current'),
    snapshot: await tx.get<SnapshotRecord>('snapshot', 'current'),
    counters: await tx.get<CountersRecord>('counters', 'device'),
  }));
}
