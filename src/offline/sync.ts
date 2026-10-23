import {
  OFFLINE_SYNC_MAX_ITEMS,
  offlineItemDone,
  type OfflineItem,
  type OfflineSyncResponse,
} from '@ziadkhaled-wb/contracts';
import type { OfflineDb } from './db';
import { offlineKey, type OfflineEntry, type OutboxEntry, type RejectedEntry } from './types';

/** The offline sales waiting to sync, oldest sequence first. */
export async function unsyncedSales(db: OfflineDb): Promise<OfflineEntry[]> {
  const all = await db.transaction(['outbox'], 'readonly', (tx) => tx.all<OutboxEntry>('outbox'));
  return all.filter((e): e is OfflineEntry => e.kind === 'offline').sort((a, b) => a.seq - b.seq);
}

export interface SyncDeps {
  db: OfflineDb;
  send: (items: OfflineItem[]) => Promise<OfflineSyncResponse>;
  /** Web Locks (navigator.locks): only one tab of this device syncs. */
  locks?: Pick<LockManager, 'request'>;
  lockName: string;
}

export interface SyncOutcome {
  /** false: another tab holds the lock; nothing was sent from here. */
  ran: boolean;
  synced: number;
  waiting: number;
}

/**
 * D9.5: sends the outbox in sequence order, 50 sales a request. A sale leaves the outbox when the
 * server answers received, duplicate or rejected (a rejected one is kept in `rejected` for the
 * manager); retry_later keeps it. A network error stops the loop (the caller backs off).
 */
export async function syncOutbox(deps: SyncDeps): Promise<SyncOutcome> {
  const work = async (): Promise<SyncOutcome> => {
    let synced = 0;
    for (;;) {
      const waiting = await unsyncedSales(deps.db);
      if (waiting.length === 0) return { ran: true, synced, waiting: 0 };
      const batch = waiting.slice(0, OFFLINE_SYNC_MAX_ITEMS);
      const answer = await deps.send(
        batch.map((e) => ({ content: e.content, signature: e.signature })),
      );
      let done = 0;
      await deps.db.transaction(['outbox', 'rejected'], 'readwrite', (tx) => {
        for (const result of answer.results) {
          const entry = batch[result.index];
          if (!entry || !offlineItemDone(result.result)) continue;
          tx.delete('outbox', offlineKey(entry.seq));
          if (result.result === 'rejected') {
            const rejected: RejectedEntry = {
              seq: entry.seq,
              number: entry.number,
              total: entry.total,
              code: result.code,
              rejectedAt: new Date().toISOString(),
              content: entry.content,
              signature: entry.signature,
            };
            tx.put('rejected', offlineKey(entry.seq), rejected);
          }
          done += 1;
        }
        return Promise.resolve();
      });
      synced += done;
      // Only retry_later answers left: they wait for a newer server.
      if (done === 0) return { ran: true, synced, waiting: waiting.length };
    }
  };
  if (!deps.locks) return work();
  const result = await deps.locks.request(deps.lockName, { ifAvailable: true }, async (lock) =>
    lock ? work() : { ran: false, synced: 0, waiting: (await unsyncedSales(deps.db)).length },
  );
  return result as SyncOutcome;
}

/** D13: the device's unsynced sales as a file a manager imports: [{content, signature}]. */
export async function exportUnsynced(db: OfflineDb): Promise<OfflineItem[]> {
  return (await unsyncedSales(db)).map((e) => ({ content: e.content, signature: e.signature }));
}

export const exportFileName = (offlineCode: string, date: Date) =>
  `offline-${offlineCode}-${date.toISOString().slice(0, 10)}.json`;
