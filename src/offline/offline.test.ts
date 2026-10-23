import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFLINE_PIN,
  OFFLINE_SALE_TIMEOUT_MS,
  readOfflineContent,
  type OfflineSyncResponse,
} from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { memoryDb, type OfflineDb } from './db';
import { clearPinLock, isPinLocked, setPin, unlockWithPin } from './device';
import { refreshLease } from './lease';
import { idleActions, initialMode, nextMode } from './mode';
import { isUnknownOutcome, offlineCartOf, sellThroughOutbox } from './onlineSale';
import {
  OfflineSaleRefused,
  markPrinted,
  offlineIssuedAt,
  offlineRefusal,
  recordOfflineSale,
  type OfflineCartLine,
} from './sale';
import { canSellOffline, useOfflineStore } from './store';
import { exportUnsynced, syncOutbox, unsyncedSales } from './sync';
import {
  IDS,
  NO_CODE,
  NOW,
  PHONE,
  leaseRecord,
  product,
  seed,
  snapshotRecord,
} from './testFixtures';
import { offlineKey, onlineKey, type CountersRecord, type OfflineEntry } from './types';

const chair = (quantity = 1): OfflineCartLine => ({ product: product(), quantity, unit: null });
const phone = (unit: 0 | 1 = 0): OfflineCartLine => ({
  product: PHONE,
  quantity: 1,
  unit: PHONE.units[unit]!,
});

async function stateOf(db: OfflineDb) {
  return db.transaction(['lease', 'snapshot'], 'readonly', async (tx) => ({
    lease: (await tx.get<ReturnType<typeof leaseRecord>>('lease', 'current'))!,
    snapshot: (await tx.get<ReturnType<typeof snapshotRecord>>('snapshot', 'current'))!,
  }));
}

async function sell(db: OfflineDb, lines: OfflineCartLine[], now = NOW) {
  const { lease, snapshot } = await stateOf(db);
  return recordOfflineSale({
    db,
    lease,
    snapshot,
    lines,
    tendered: '5000.00',
    idempotencyKey: crypto.randomUUID(),
    now,
  });
}

const counters = (db: OfflineDb) =>
  db.transaction(['counters'], 'readonly', (tx) => tx.get<CountersRecord>('counters', 'device'));

const soldCounters = (over: Partial<CountersRecord>): CountersRecord => ({
  leaseId: IDS.lease,
  seq: 1,
  head: '',
  lastIssuedAt: null,
  sold: {},
  serials: [],
  salesCount: 0,
  salesTotal: '0.00',
  ...over,
});

describe('W1 mode machine (D1)', () => {
  it('goes offline on a failed sale or a failed health check', () => {
    expect(nextMode(initialMode(), { type: 'sale-failed' }).mode).toBe('offline');
    expect(nextMode(initialMode(), { type: 'health', ok: false }).mode).toBe('offline');
  });

  it('comes back online after two good health checks with an empty outbox', () => {
    let state = nextMode(initialMode(), { type: 'sale-failed' });
    state = nextMode(state, { type: 'health', ok: true });
    expect(state.mode).toBe('offline');
    state = nextMode(state, { type: 'health', ok: true });
    expect(state.mode).toBe('online');
  });

  it('a bad check in between starts the count again', () => {
    let state = nextMode(initialMode(), { type: 'sale-failed' });
    state = nextMode(state, { type: 'health', ok: true });
    state = nextMode(state, { type: 'health', ok: false });
    state = nextMode(state, { type: 'health', ok: true });
    expect(state.mode).toBe('offline');
  });

  it('an outbox that is not empty keeps the POS offline', () => {
    let state = initialMode(1);
    expect(state.mode).toBe('offline');
    for (let i = 0; i < 5; i += 1) state = nextMode(state, { type: 'health', ok: true });
    expect(state.mode).toBe('offline');
    state = nextMode(state, { type: 'outbox', unsynced: 0 });
    state = nextMode(state, { type: 'health', ok: true });
    expect(state.mode).toBe('online');
  });

  it('the online sale waits 8 s; no answer (network or timeout) is an unknown outcome', () => {
    expect(OFFLINE_SALE_TIMEOUT_MS).toBe(8000);
    expect(isUnknownOutcome(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(true);
    expect(isUnknownOutcome(new ApiError(409, 'OUT_OF_STOCK', 'x'))).toBe(false);
  });

  describe('a sale with no answer', () => {
    let db: ReturnType<typeof memoryDb>;
    const body = {
      lines: [{ product_id: IDS.chair, quantity: 2 }],
      expected_total: '228.00',
      payments: [{ method: 'cash' as const, amount: '228.00', tendered: '300.00' }],
    };

    beforeEach(async () => {
      // The fallback sale is made now: the lease's clock.
      vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
      db = memoryDb();
      const { lease, snapshot } = await seed(db);
      useOfflineStore.setState({
        db,
        lease,
        snapshot,
        counters: null,
        mode: initialMode(),
        fallback: null,
        unlocked: false,
      });
    });
    afterEach(() => {
      vi.useRealTimers();
      useOfflineStore.setState({ db: null, lease: null, snapshot: null, fallback: null });
    });

    it('becomes an offline sale with the same key; the online attempt is dropped', async () => {
      const key = crypto.randomUUID();
      const send = vi.fn(async () => {
        // The attempt is in the outbox while it is sent.
        expect(db.dump().outbox.has(onlineKey(key))).toBe(true);
        throw new ApiError(0, 'NETWORK_ERROR', 'no answer');
      });
      const outcome = await sellThroughOutbox(body, key, send);
      expect(send).toHaveBeenCalledTimes(1);
      expect('offline' in outcome && outcome.offline.idempotencyKey).toBe(key);
      expect(db.dump().outbox.has(onlineKey(key))).toBe(false);
      const [entry] = await unsyncedSales(db);
      expect(entry?.idempotencyKey).toBe(key);
      expect(readOfflineContent(entry!.content)?.idempotency_key).toBe(key);
      expect(useOfflineStore.getState().mode.mode).toBe('offline');
      expect(useOfflineStore.getState().fallback?.idempotencyKey).toBe(key);
    });

    it('an answer removes the attempt; a refusal is not retried offline', async () => {
      const key = crypto.randomUUID();
      await expect(sellThroughOutbox(body, key, async () => ({ id: 'sale' }))).resolves.toEqual({
        sale: { id: 'sale' },
      });
      expect(db.dump().outbox.size).toBe(0);
      const refused = new ApiError(409, 'OUT_OF_STOCK', 'no');
      await expect(sellThroughOutbox(body, key, () => Promise.reject(refused))).rejects.toBe(
        refused,
      );
      expect(db.dump().outbox.size).toBe(0);
      expect(useOfflineStore.getState().mode.mode).toBe('online');
    });

    it('a cart that cannot be an offline sale drops the attempt and keeps the error', async () => {
      const lost = new ApiError(0, 'NETWORK_ERROR', 'no answer');
      const card = {
        ...body,
        payments: [
          {
            method: 'bank_transfer' as const,
            amount: '228.00',
            cash_account_id: IDS.key,
            reference: 'r',
          },
        ],
      };
      await expect(
        sellThroughOutbox(card, crypto.randomUUID(), () => Promise.reject(lost)),
      ).rejects.toBe(lost);
      expect(db.dump().outbox.size).toBe(0);
    });
  });
});

describe('W2 the sale is saved in one transaction before print (D6.6)', () => {
  it('content, seq, head and stock are written together', async () => {
    const db = memoryDb();
    await seed(db);
    const entry = await sell(db, [chair(2)]);
    const stored = db.dump().outbox.get(offlineKey(entry.seq)) as OfflineEntry;
    const after = await counters(db);
    expect(stored.content).toBe(entry.content);
    expect(stored.printed).toBe(false);
    expect(after?.seq).toBe(entry.seq);
    expect(entry.uuid).toMatch(/^[0-9a-f]{64}$/);
    expect(after?.head).toBe(entry.uuid);
    expect(after?.sold[IDS.chair]).toBe(2);
    expect(readOfflineContent(entry.content)?.seq).toBe(1);
  });

  it('a crash before the commit writes nothing', async () => {
    const db = memoryDb();
    await seed(db);
    const crashing: OfflineDb = {
      transaction: (stores, mode, work) =>
        mode === 'readwrite'
          ? db.transaction(stores, mode, async (tx) => {
              await work(tx);
              throw new Error('power cut');
            })
          : db.transaction(stores, mode, work),
    };
    const { lease, snapshot } = await stateOf(db);
    await expect(
      recordOfflineSale({
        db: crashing,
        lease,
        snapshot,
        lines: [chair()],
        tendered: '200.00',
        idempotencyKey: crypto.randomUUID(),
        now: NOW,
      }),
    ).rejects.toThrow('power cut');
    expect(db.dump().outbox.size).toBe(0);
    expect((await counters(db))?.seq).toBe(0);
  });

  it('a crash after saving and before printing prints the original, then copies', async () => {
    const db = memoryDb();
    await seed(db);
    const entry = await sell(db, [chair()]);
    // The app restarts: the stored sale was never printed, so the next print is the original.
    expect((await unsyncedSales(db))[0]?.printed).toBe(false);
    await markPrinted(db, entry.seq);
    expect((await unsyncedSales(db))[0]?.printed).toBe(true);
  });

  it('chains each receipt to the previous one and numbers them in order', async () => {
    const db = memoryDb();
    await seed(db);
    const first = await sell(db, [chair()]);
    const second = await sell(db, [chair()], NOW + 1000);
    expect([first.number, second.number]).toEqual(['OFF-D1-000001', 'OFF-D1-000002']);
    expect(second.content).toContain(`"previousUUID":"${first.uuid}"`);
    expect((await counters(db))?.head).toBe(second.uuid);
  });
});

describe('W3 issued_at (D6.4)', () => {
  it('uses the lease offset', () => {
    expect(offlineIssuedAt(NOW, 90_000, null)).toBe('2026-10-20T10:01:30Z');
  });

  it('never goes back when the local clock does', async () => {
    expect(offlineIssuedAt(NOW - 60_000, 0, '2026-10-20T10:00:00Z')).toBe('2026-10-20T10:00:00Z');
    const db = memoryDb();
    await seed(db);
    const a = await sell(db, [chair()], NOW);
    const b = await sell(db, [chair()], NOW - 3_600_000);
    expect(Date.parse(b.issuedAt)).toBeGreaterThanOrEqual(Date.parse(a.issuedAt));
  });
});

describe('W4 limits (D4.3)', () => {
  const lease = leaseRecord({
    limits: { max_sale_total: '500.00', max_sales: 2, max_lease_total: '300.00' },
  });

  it('refuses a sale over the max sale total', () => {
    expect(offlineRefusal([chair(5)], lease, undefined, NOW, true)).toBe('MAX_SALE');
  });

  it('refuses after N sales and over the lease total', () => {
    const sold = soldCounters({ seq: 2, salesCount: 2, salesTotal: '228.00' });
    expect(offlineRefusal([chair()], lease, sold, NOW, true)).toBe('MAX_SALES');
    expect(offlineRefusal([chair()], lease, { ...sold, salesCount: 1 }, NOW, true)).toBe(
      'MAX_LEASE_TOTAL',
    );
  });

  it('refuses after expires_at', async () => {
    const expired = leaseRecord({ expiresAt: new Date(NOW - 1).toISOString() });
    expect(offlineRefusal([chair()], expired, undefined, NOW, true)).toBe('LEASE_EXPIRED');
    // The device clock is behind the server's: the lease offset decides, not the local clock.
    const behind = leaseRecord({
      expiresAt: new Date(NOW + 60_000).toISOString(),
      offsetMs: 120_000,
    });
    expect(offlineRefusal([chair()], behind, undefined, NOW, true)).toBe('LEASE_EXPIRED');
    const db = memoryDb();
    await seed(db, expired);
    await expect(sell(db, [chair()])).rejects.toBeInstanceOf(OfflineSaleRefused);
  });
});

describe('W5 offline restrictions (D4)', () => {
  const snapshot = snapshotRecord();
  const cash = [{ method: 'cash' as const, amount: '114.00' }];
  const line = { product_id: IDS.chair, quantity: 1 };

  it('no customer, discount, price override or non-cash payment', () => {
    expect(
      offlineCartOf({ lines: [line], expected_total: '114.00', payments: cash }, snapshot),
    ).not.toBeNull();
    const refused = [
      { lines: [line], expected_total: '1', payments: cash, customer_id: IDS.cashier },
      {
        lines: [line],
        expected_total: '1',
        payments: cash,
        sale_discount: { type: 'percent' as const, value: '5' },
      },
      {
        lines: [{ ...line, discount: { type: 'amount' as const, value: '1.00' } }],
        expected_total: '1',
        payments: cash,
      },
      { lines: [{ ...line, unit_price: '1.00' }], expected_total: '1', payments: cash },
      {
        lines: [line],
        expected_total: '1',
        payments: [
          {
            method: 'bank_transfer' as const,
            amount: '114.00',
            cash_account_id: IDS.key,
            reference: 'x',
          },
        ],
      },
      { lines: [line], expected_total: '1' },
    ];
    for (const body of refused) expect(offlineCartOf(body, snapshot)).toBeNull();
  });

  it('non-sellable products are blocked; snapshot stock and serials are enforced', () => {
    const lease = leaseRecord();
    const noCode = { product: NO_CODE, quantity: 1, unit: null };
    expect(offlineRefusal([noCode], lease, undefined, NOW, true)).toBe('NOT_SELLABLE');
    expect(
      offlineCartOf(
        { lines: [{ product_id: IDS.noCode, quantity: 1 }], expected_total: '1', payments: cash },
        snapshot,
      ),
    ).toBeNull();
    expect(offlineRefusal([chair(6)], lease, undefined, NOW, true)).toBe('OUT_OF_STOCK');
    const sold = soldCounters({ sold: { [IDS.chair]: 4 }, serials: [IDS.unit1], salesCount: 1 });
    expect(offlineRefusal([chair(2)], lease, sold, NOW, true)).toBe('OUT_OF_STOCK');
    expect(offlineRefusal([chair(1)], lease, sold, NOW, true)).toBeNull();
    expect(offlineRefusal([phone(0)], lease, sold, NOW, true)).toBe('SERIAL_TAKEN');
    expect(offlineRefusal([phone(1), phone(1)], lease, undefined, NOW, true)).toBe('SERIAL_TAKEN');
    expect(offlineRefusal([phone(1)], lease, sold, NOW, true)).toBeNull();
  });

  it('a serial sold offline is not sold again', async () => {
    const db = memoryDb();
    await seed(db);
    await sell(db, [phone(0)]);
    await expect(sell(db, [phone(0)])).rejects.toMatchObject({ code: 'SERIAL_TAKEN' });
  });
});

describe('W6 PIN (D14)', () => {
  it('sets, unlocks, and locks after five wrong tries until an online login', async () => {
    const db = memoryDb();
    await expect(unlockWithPin(db, '1234')).resolves.toBe('no-pin');
    await expect(setPin(db, IDS.shift, '12')).rejects.toThrow();
    await setPin(db, IDS.shift, '1234');
    expect(JSON.stringify([...db.dump().pin.values()])).not.toContain('1234');
    await expect(unlockWithPin(db, '1234')).resolves.toBe('ok');
    for (let i = 1; i < OFFLINE_PIN.maxTries; i += 1) {
      await expect(unlockWithPin(db, '0000')).resolves.toBe('wrong');
    }
    await expect(unlockWithPin(db, '0000')).resolves.toBe('locked');
    await expect(unlockWithPin(db, '1234')).resolves.toBe('locked');
    expect(await isPinLocked(db)).toBe(true);
    await clearPinLock(db);
    await expect(unlockWithPin(db, '1234')).resolves.toBe('ok');
  }, 30_000);

  it('a right PIN resets the wrong count', async () => {
    const db = memoryDb();
    await setPin(db, IDS.shift, '123456');
    for (let i = 1; i < OFFLINE_PIN.maxTries; i += 1) await unlockWithPin(db, '000000');
    await expect(unlockWithPin(db, '123456')).resolves.toBe('ok');
    await expect(unlockWithPin(db, '000000')).resolves.toBe('wrong');
  }, 30_000);

  it('locks after 5 minutes idle, offline only', () => {
    const state = { mode: 'offline' as const, unlocked: true, unsynced: 1, updateWaiting: false };
    expect(idleActions(state, OFFLINE_PIN.idleLockMs - 1).lock).toBe(false);
    expect(idleActions(state, OFFLINE_PIN.idleLockMs).lock).toBe(true);
    expect(idleActions({ ...state, mode: 'online' }, OFFLINE_PIN.idleLockMs).lock).toBe(false);
  });

  it('a new app version waits for online, an empty outbox and an idle POS (D15.2)', () => {
    const state = { mode: 'online' as const, unlocked: true, unsynced: 0, updateWaiting: true };
    expect(idleActions(state, 60_000).update).toBe(true);
    expect(idleActions(state, 1000).update).toBe(false);
    expect(idleActions({ ...state, unsynced: 1 }, 60_000).update).toBe(false);
    expect(idleActions({ ...state, mode: 'offline' }, 60_000).update).toBe(false);
  });
});

describe('W7 persistent storage (D14.4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('denied: the lease says so and offline selling is off', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { persisted: async () => false, persist: async () => false },
    });
    const db = memoryDb();
    const base = leaseRecord();
    const lease = await refreshLease(
      db,
      async () => ({
        lease: base.lease,
        offline_code: 'D1',
        server_time: new Date(NOW).toISOString(),
        snapshot: snapshotRecord().data,
        eta: base.eta,
      }),
      null,
      () => NOW,
    );
    expect(lease.persisted).toBe(false);
    expect(offlineRefusal([chair()], lease, undefined, NOW, true)).toBe('NO_LEASE');
    const store = useOfflineStore.getState();
    const snapshot = snapshotRecord();
    expect(canSellOffline({ ...store, lease, snapshot }, NOW)).toBe(false);
    expect(canSellOffline({ ...store, lease: { ...lease, persisted: true }, snapshot }, NOW)).toBe(
      true,
    );
  });
});

describe('W8 sync loop (D9.5)', () => {
  async function outboxOf(n: number) {
    const db = memoryDb();
    await seed(db);
    for (let i = 0; i < n; i += 1) await sell(db, [chair()], NOW + i * 1000);
    return db;
  }
  const locks = (lock: Lock | null) =>
    ({
      request: (_name: string, _opts: unknown, cb: (held: Lock | null) => Promise<unknown>) =>
        cb(lock),
    }) as unknown as Pick<LockManager, 'request'>;

  it('one tab holds the lock; the others send nothing', async () => {
    const db = await outboxOf(1);
    const send = vi.fn();
    await expect(syncOutbox({ db, send, locks: locks(null), lockName: 'd' })).resolves.toEqual({
      ran: false,
      synced: 0,
      waiting: 1,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('received, duplicate and rejected leave the outbox; retry_later stays', async () => {
    const db = await outboxOf(4);
    // The server's answer for each sequence, whatever the batch.
    const bySeq: Record<number, OfflineSyncResponse['results'][number]['result']> = {
      1: 'received',
      2: 'duplicate',
      3: 'rejected',
      4: 'retry_later',
    };
    const send = vi.fn(async (items: { content: string }[]): Promise<OfflineSyncResponse> => ({
      results: items.map((item, index) => {
        const seq = readOfflineContent(item.content)!.seq;
        const result = bySeq[seq]!;
        return { index, seq, result, code: result === 'rejected' ? 'NOT_OURS' : null };
      }),
    }));
    const held = locks({ name: 'd', mode: 'exclusive' } as Lock);
    const outcome = await syncOutbox({ db, send, locks: held, lockName: 'd' });
    expect(outcome).toEqual({ ran: true, synced: 3, waiting: 1 });
    // The four, then the one left; a second retry_later ends the loop until a newer server.
    expect(send.mock.calls.map(([items]) => items.length)).toEqual([4, 1]);
    expect((await unsyncedSales(db)).map((e) => e.seq)).toEqual([4]);
    expect([...db.dump().rejected.keys()]).toEqual([offlineKey(3)]);
  });

  it('sends in sequence order', async () => {
    const db = await outboxOf(3);
    const sent: string[][] = [];
    await syncOutbox({
      db,
      lockName: 'd',
      send: async (items) => {
        sent.push(items.map((i) => readOfflineContent(i.content)!.number));
        return {
          results: items.map((_, index) => ({
            index,
            seq: null,
            result: 'received' as const,
            code: null,
          })),
        };
      },
    });
    expect(sent).toEqual([['OFF-D1-000001', 'OFF-D1-000002', 'OFF-D1-000003']]);
  });
});

describe('W9 export (D13.1)', () => {
  it('produces the exact stored content and signatures', async () => {
    const db = memoryDb();
    await seed(db);
    const a = await sell(db, [chair()]);
    const b = await sell(db, [chair()], NOW + 1000);
    expect(await exportUnsynced(db)).toEqual([
      { content: a.content, signature: a.signature },
      { content: b.content, signature: b.signature },
    ]);
  });
});
