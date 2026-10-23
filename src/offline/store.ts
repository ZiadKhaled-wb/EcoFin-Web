import { create } from 'zustand';
import type { OfflineDb } from './db';
import { isPinLocked, pinShift } from './device';
import { offlineState } from './lease';
import { initialMode, nextMode, type ModeEvent, type ModeState } from './mode';
import { unsyncedSales } from './sync';
import type {
  CountersRecord,
  LeaseRecord,
  OfflineEntry,
  RejectedEntry,
  SnapshotRecord,
} from './types';

/**
 * S08: what the screens need to know about offline selling, kept in step with IndexedDB by the
 * OfflineController (src/offline/OfflineController.tsx). The screens never write IndexedDB
 * through here except by the functions in sale.ts, device.ts and sync.ts.
 */
export interface OfflineStore {
  db: OfflineDb | null;
  orgId: string | null;
  mode: ModeState;
  lease: LeaseRecord | null;
  snapshot: SnapshotRecord | null;
  counters: CountersRecord | null;
  unsynced: number;
  /** issued_at of the oldest unsynced sale (the 18-hour warning, D14.6). */
  oldestUnsyncedAt: string | null;
  rejected: number;
  /** The shift whose PIN is set on this device; null = none yet. */
  pinShift: string | null;
  /** Five wrong PINs: locked until an online login. */
  pinLocked: boolean;
  /** The PIN was typed since the app started or the last idle lock. */
  unlocked: boolean;
  /** The last lease refusal (OFFLINE_DISABLED, OFFLINE_ETA_NOT_READY...), shown in the device panel. */
  leaseError: string | null;
  /** A new app version waits (D15.2). */
  updateWaiting: boolean;
  /** An online sale with no answer, saved offline with its key (D1.4): the POS shows it to print. */
  fallback: OfflineEntry | null;
  attach(orgId: string, db: OfflineDb): Promise<void>;
  reload(): Promise<void>;
  dispatch(event: ModeEvent): void;
  set(
    patch: Partial<Pick<OfflineStore, 'unlocked' | 'leaseError' | 'updateWaiting' | 'fallback'>>,
  ): void;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  db: null,
  orgId: null,
  mode: initialMode(),
  lease: null,
  snapshot: null,
  counters: null,
  unsynced: 0,
  oldestUnsyncedAt: null,
  rejected: 0,
  pinShift: null,
  pinLocked: false,
  unlocked: false,
  leaseError: null,
  updateWaiting: false,
  fallback: null,
  async attach(orgId, db) {
    set({ orgId, db, unlocked: false });
    await get().reload();
    set((s) => ({ mode: initialMode(s.unsynced) }));
  },
  async reload() {
    const db = get().db;
    if (!db) return;
    const [state, waiting, rejected, shift, locked] = await Promise.all([
      offlineState(db),
      unsyncedSales(db),
      db.transaction(['rejected'], 'readonly', (tx) => tx.all<RejectedEntry>('rejected')),
      pinShift(db),
      isPinLocked(db),
    ]);
    set((s) => ({
      lease: state.lease ?? null,
      snapshot: state.snapshot ?? null,
      counters: state.counters ?? null,
      unsynced: waiting.length,
      oldestUnsyncedAt: waiting[0]?.issuedAt ?? null,
      rejected: rejected.length,
      pinShift: shift,
      pinLocked: locked,
      mode: nextMode(s.mode, { type: 'outbox', unsynced: waiting.length }),
    }));
  },
  dispatch(event) {
    set((s) => ({ mode: nextMode(s.mode, event) }));
  },
  set(patch) {
    set(patch);
  },
}));

/** Offline selling is possible now: offline, a lease of this device, storage kept. */
export const canSellOffline = (s: OfflineStore, now = Date.now()) =>
  !!s.lease &&
  !!s.snapshot &&
  s.lease.persisted &&
  now + s.lease.offsetMs < Date.parse(s.lease.lease.expires_at);
