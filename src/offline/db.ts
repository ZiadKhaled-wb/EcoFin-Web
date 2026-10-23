/**
 * S08 (D6, D14): the POS's durable offline storage. Raw IndexedDB behind a small typed wrapper
 * (no library): one database per shop, seven object stores with out-of-line keys.
 *
 *   lease     'current' -> the last lease (LeaseRecord)
 *   snapshot  'current' -> the snapshot the lease points at
 *   outbox    'off:<seq padded>' -> an offline sale waiting to sync; 'on:<key>' -> an online sale
 *             being sent (D1: every sale goes through the outbox first)
 *   rejected  'off:<seq padded>' -> a sale the server refused, kept for the manager
 *   keys      'device' -> the ECDSA key pair (private key not extractable)
 *   pin       'pin' -> the PIN of the shift (PBKDF2 hash, salt, wrong tries)
 *   counters  'device' -> sequence, chain head, last issue time, what was sold under the lease
 *
 * A transaction only reads and writes: anything asynchronous that is not IndexedDB (signing,
 * hashing) is done before it, so the transaction never closes early. One transaction commits
 * everything a sale writes, or nothing (D6.6).
 */

export const STORES = [
  'lease',
  'snapshot',
  'outbox',
  'rejected',
  'keys',
  'pin',
  'counters',
] as const;
export type StoreName = (typeof STORES)[number];

export interface OfflineTx {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  all<T>(store: StoreName): Promise<T[]>;
  put(store: StoreName, key: string, value: unknown): void;
  delete(store: StoreName, key: string): void;
}

export interface OfflineDb {
  /** Runs `work` in one transaction over `stores`: all its writes commit, or none. */
  transaction<R>(
    stores: readonly StoreName[],
    mode: 'readonly' | 'readwrite',
    work: (tx: OfflineTx) => Promise<R>,
  ): Promise<R>;
}

export const read = <T>(db: OfflineDb, store: StoreName, key: string) =>
  db.transaction([store], 'readonly', (tx) => tx.get<T>(store, key));
export const readAll = <T>(db: OfflineDb, store: StoreName) =>
  db.transaction([store], 'readonly', (tx) => tx.all<T>(store));
export const write = (db: OfflineDb, store: StoreName, key: string, value: unknown) =>
  db.transaction([store], 'readwrite', (tx) => {
    tx.put(store, key, value);
    return Promise.resolve();
  });

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/** The database of one shop. Stores are made on first open. */
export async function openIndexedDb(name: string): Promise<OfflineDb> {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    for (const store of STORES) {
      if (!opening.result.objectStoreNames.contains(store)) opening.result.createObjectStore(store);
    }
  };
  const idb = await request(opening);
  return {
    transaction(stores, mode, work) {
      const tx = idb.transaction([...stores], mode);
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      });
      const api: OfflineTx = {
        get: <T>(store: StoreName, key: string) =>
          request(tx.objectStore(store).get(key)) as Promise<T | undefined>,
        all: <T>(store: StoreName) => request(tx.objectStore(store).getAll()) as Promise<T[]>,
        put: (store, key, value) => {
          tx.objectStore(store).put(value, key);
        },
        delete: (store, key) => {
          tx.objectStore(store).delete(key);
        },
      };
      return work(api).then(
        async (result) => {
          await done;
          return result;
        },
        (error: unknown) => {
          try {
            tx.abort();
          } catch {
            /* already finished */
          }
          throw error;
        },
      );
    },
  };
}

/**
 * The same contract in memory, for unit tests (jsdom has no IndexedDB). Writes are staged and
 * applied when `work` resolves; a throw drops them all, like an aborted transaction.
 */
export function memoryDb(): OfflineDb & { dump(): Record<StoreName, Map<string, unknown>> } {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map<string, unknown>()])) as Record<
    StoreName,
    Map<string, unknown>
  >;
  const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
  return {
    dump: () => data,
    async transaction(_stores, _mode, work) {
      const staged: (() => void)[] = [];
      const pending = new Map<string, unknown>();
      const tx: OfflineTx = {
        get: <T>(store: StoreName, key: string) => {
          const id = `${store}\u0000${key}`;
          if (pending.has(id)) return Promise.resolve(clone(pending.get(id)) as T | undefined);
          return Promise.resolve(clone(data[store].get(key)) as T | undefined);
        },
        all: <T>(store: StoreName) =>
          Promise.resolve(
            [...data[store].entries()]
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([, v]) => clone(v)) as T[],
          ),
        put: (store, key, value) => {
          pending.set(`${store}\u0000${key}`, value);
          staged.push(() => data[store].set(key, clone(value)));
        },
        delete: (store, key) => {
          pending.set(`${store}\u0000${key}`, undefined);
          staged.push(() => data[store].delete(key));
        },
      };
      const result = await work(tx);
      for (const apply of staged) apply();
      return result;
    },
  };
}
