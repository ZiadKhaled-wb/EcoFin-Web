import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OFFLINE_HEALTH_EVERY_MS, OFFLINE_LEASE_REFRESH_MS } from '@ziadkhaled-wb/contracts';
import { useDeviceToken } from '@/features/devices/deviceToken';
import { useSettings } from '@/features/settings/useSettings';
import { ApiError } from '@/lib/api';
import { offlineApi } from '@/services/offlineApi';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { openIndexedDb } from './db';
import { clearPinLock } from './device';
import { refreshLease } from './lease';
import { idleActions } from './mode';
import { useOfflineStore } from './store';
import { syncOutbox } from './sync';

const MAX_BACKOFF_MS = 60_000;

/**
 * S08 (D1, D2, D9, D14, D15): runs offline selling in the background for the signed-in shop:
 * the IndexedDB of the shop, the health check every 15 s (the mode machine), the sync of the
 * outbox in one tab (Web Locks) with backoff, the lease (on a new shift, every 15 minutes, after
 * a sync), the idle lock, and a waiting app version taken when nothing is going on. Renders
 * nothing.
 */
export default function OfflineController() {
  const orgId = useAuthStore((s) => s.orgId);
  const token = useAuthStore((s) => s.accessToken);
  const deviceToken = useDeviceToken(orgId);
  const shop = useSettings().data ?? null;
  const db = useOfflineStore((s) => s.db);
  const healthy = useOfflineStore((s) => s.mode.healthy);
  const mode = useOfflineStore((s) => s.mode.mode);
  const unsynced = useOfflineStore((s) => s.unsynced);
  const lease = useOfflineStore((s) => s.lease);
  const pinLocked = useOfflineStore((s) => s.pinLocked);
  const online = healthy > 0;
  const shift = useQuery({
    queryKey: shiftKeys.current(orgId),
    queryFn: shiftsApi.current,
    enabled: !!token && !!orgId && online,
    retry: false,
  });
  /** 0 until the first key or click: the idle clock starts with the page. */
  const lastActivity = useRef(0);
  const backoff = useRef(0);
  const syncing = useRef(false);
  const leasing = useRef(false);
  const leaseRef = useRef(lease);
  useEffect(() => {
    leaseRef.current = lease;
  }, [lease]);

  // The shop's offline database (none without IndexedDB: offline selling is then unavailable).
  useEffect(() => {
    if (!orgId || typeof indexedDB === 'undefined') return;
    let alive = true;
    void openIndexedDb(`ecofin-offline-${orgId}`).then((opened) => {
      if (alive) void useOfflineStore.getState().attach(orgId, opened);
    });
    return () => {
      alive = false;
    };
  }, [orgId]);

  // D1: the health check, every 15 s.
  useEffect(() => {
    if (!db) return;
    let alive = true;
    const check = () => {
      void offlineApi
        .health()
        .then(
          (ok) => ok,
          () => false,
        )
        .then((ok) => {
          if (alive) useOfflineStore.getState().dispatch({ type: 'health', ok });
        });
    };
    check();
    const id = setInterval(check, OFFLINE_HEALTH_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [db]);

  // D14.3: an online login opens a POS locked by wrong PINs.
  const seenToken = useRef(token);
  useEffect(() => {
    if (!db || !token || !online) return;
    if (pinLocked && seenToken.current !== token) {
      void clearPinLock(db).then(() => useOfflineStore.getState().reload());
    }
    seenToken.current = token;
  }, [db, token, online, pinLocked]);

  // D2: the lease, for the caller's open shift on this device.
  const shiftId = shift.data?.id ?? null;
  useEffect(() => {
    if (!db || !token || !deviceToken || !online || !shiftId) return;
    const take = () => {
      if (leasing.current) return;
      leasing.current = true;
      void refreshLease(db, offlineApi.lease, shop)
        .then(() => useOfflineStore.getState().set({ leaseError: null }))
        .catch((err: unknown) =>
          useOfflineStore
            .getState()
            .set({ leaseError: err instanceof ApiError ? err.code : 'UNKNOWN' }),
        )
        .finally(() => {
          leasing.current = false;
          void useOfflineStore.getState().reload();
        });
    };
    // A lease of this shift is taken once; the interval renews it.
    const current = leaseRef.current;
    if (!current || current.lease.shift_id !== shiftId) take();
    const id = setInterval(take, OFFLINE_LEASE_REFRESH_MS);
    return () => clearInterval(id);
  }, [db, token, deviceToken, online, shiftId, shop]);

  // D9: the outbox, synced from one tab while the server answers.
  useEffect(() => {
    if (!db || !online || unsynced === 0 || syncing.current || !lease) return;
    syncing.current = true;
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const run = syncOutbox({
      db,
      send: offlineApi.sync,
      ...(locks ? { locks } : {}),
      lockName: `ecofin-offline-sync-${lease.lease.device_id}`,
    });
    void run
      .then(async (outcome) => {
        backoff.current = 0;
        await useOfflineStore.getState().reload();
        // After a sync the lease is renewed (D2.1): the next sales start from the server's state.
        if (outcome.synced > 0 && deviceToken && shiftId) {
          await refreshLease(db, offlineApi.lease, shop).catch(() => undefined);
          await useOfflineStore.getState().reload();
        }
      })
      .catch(() => {
        backoff.current = Math.min(Math.max(backoff.current * 2, 2000), MAX_BACKOFF_MS);
        useOfflineStore.getState().dispatch({ type: 'health', ok: false });
      })
      .finally(() => {
        setTimeout(() => {
          syncing.current = false;
        }, backoff.current);
      });
  }, [db, online, unsynced, lease, deviceToken, shiftId, shop]);

  // D14.2: offline, the POS locks after 5 minutes without a key or a click.
  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    touch();
    window.addEventListener('keydown', touch);
    window.addEventListener('pointerdown', touch);
    const id = setInterval(() => {
      const state = useOfflineStore.getState();
      const act = idleActions(
        { ...state, mode: state.mode.mode },
        Date.now() - lastActivity.current,
      );
      if (act.lock) state.set({ unlocked: false });
      if (act.update) window.dispatchEvent(new Event('ecofin:apply-update'));
    }, 15_000);
    return () => {
      window.removeEventListener('keydown', touch);
      window.removeEventListener('pointerdown', touch);
      clearInterval(id);
    };
  }, []);

  // Online again with an empty outbox: the screens read fresh data.
  useEffect(() => {
    if (mode === 'online') void useOfflineStore.getState().reload();
  }, [mode]);

  return null;
}
