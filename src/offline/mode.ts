import { OFFLINE_HEALTH_OK_TO_RETURN, OFFLINE_PIN } from '@ziadkhaled-wb/contracts';

/**
 * S08 (D1): online or offline. The POS goes offline when a sale request fails on the network or
 * times out (8 s), when the health check fails, or while unsynced offline sales wait in the
 * outbox. It comes back only when the outbox is empty AND the health check has passed twice in a
 * row (checked every 15 s). A pure reducer: the controller feeds it events.
 */
export type Mode = 'online' | 'offline';

export interface ModeState {
  mode: Mode;
  /** Good health checks in a row since the last failure. */
  healthy: number;
  /** Unsynced offline sales in the outbox. */
  unsynced: number;
}

export type ModeEvent =
  { type: 'sale-failed' } | { type: 'health'; ok: boolean } | { type: 'outbox'; unsynced: number };

export const initialMode = (unsynced = 0): ModeState => ({
  mode: unsynced > 0 ? 'offline' : 'online',
  healthy: 0,
  unsynced,
});

export function nextMode(state: ModeState, event: ModeEvent): ModeState {
  switch (event.type) {
    case 'sale-failed':
      return { ...state, mode: 'offline', healthy: 0 };
    case 'health': {
      if (!event.ok) return { ...state, mode: 'offline', healthy: 0 };
      const healthy = state.healthy + 1;
      const back = state.unsynced === 0 && healthy >= OFFLINE_HEALTH_OK_TO_RETURN;
      return { ...state, healthy, mode: back ? 'online' : state.mode };
    }
    case 'outbox':
      return {
        ...state,
        unsynced: event.unsynced,
        mode: event.unsynced > 0 ? 'offline' : state.mode,
      };
  }
}

/** D15.2: a waiting app version is taken after this long without a key or a click. */
export const UPDATE_IDLE_MS = 60_000;

/**
 * What an idle POS does (checked every 15 s): offline, it locks after 5 minutes without a key or
 * a click (D14.2); online, with nothing waiting to sync, it takes a waiting app version (D15.2).
 */
export function idleActions(
  state: { mode: Mode; unlocked: boolean; unsynced: number; updateWaiting: boolean },
  idleMs: number,
): { lock: boolean; update: boolean } {
  return {
    lock: state.mode === 'offline' && state.unlocked && idleMs >= OFFLINE_PIN.idleLockMs,
    update:
      state.updateWaiting &&
      state.mode === 'online' &&
      state.unsynced === 0 &&
      idleMs >= UPDATE_IDLE_MS,
  };
}
