import { OFFLINE_PIN } from '@ziadkhaled-wb/contracts';
import type { OfflineDb } from './db';

/**
 * S08 (D5, D14): this browser as an offline POS. Its ECDSA P-256 key pair is made once with
 * WebCrypto, the private key not extractable, and kept in IndexedDB (a CryptoKeyPair is stored
 * as it is). The PIN of the shift is only a PBKDF2-SHA256 hash here, never sent anywhere.
 */

const toBase64 = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = '';
  for (const b of view) text += String.fromCharCode(b);
  return btoa(text);
};

/** The device's key pair, made on first use. */
export async function deviceKeys(db: OfflineDb): Promise<CryptoKeyPair> {
  const stored = await db.transaction(['keys'], 'readonly', (tx) =>
    tx.get<CryptoKeyPair>('keys', 'device'),
  );
  if (stored) return stored;
  const made = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  return db.transaction(['keys'], 'readwrite', async (tx) => {
    const raced = await tx.get<CryptoKeyPair>('keys', 'device');
    if (raced) return raced;
    tx.put('keys', 'device', made);
    return made;
  });
}

/** The public key as the lease request sends it: SPKI, base64. */
export async function publicKeyBase64(db: OfflineDb): Promise<string> {
  const keys = await deviceKeys(db);
  return toBase64(await crypto.subtle.exportKey('spki', keys.publicKey));
}

/** D5.3: ECDSA SHA-256 over the content's UTF-8 bytes, IEEE P1363, base64. */
export async function signContent(db: OfflineDb, content: string): Promise<string> {
  const keys = await deviceKeys(db);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new TextEncoder().encode(content),
  );
  return toBase64(signature);
}

interface PinRecord {
  shiftId: string;
  salt: string;
  hash: string;
  /** Wrong PINs in a row. */
  wrong: number;
  /** 5 wrong in a row: locked until an online login (D14.3). */
  locked: boolean;
}

async function pinHash(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: OFFLINE_PIN.iterations },
    material,
    256,
  );
  return toBase64(bits);
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The shift whose PIN is set, or null (a new shift sets its own, D14.1). */
export async function pinShift(db: OfflineDb): Promise<string | null> {
  const pin = await db.transaction(['pin'], 'readonly', (tx) => tx.get<PinRecord>('pin', 'pin'));
  return pin?.shiftId ?? null;
}

export const isPinLocked = async (db: OfflineDb) =>
  (await db.transaction(['pin'], 'readonly', (tx) => tx.get<PinRecord>('pin', 'pin')))?.locked ??
  false;

export async function setPin(db: OfflineDb, shiftId: string, pin: string): Promise<void> {
  if (!OFFLINE_PIN.pattern.test(pin)) throw new RangeError('A PIN is 4 to 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const record: PinRecord = {
    shiftId,
    salt: toBase64(salt),
    hash: await pinHash(pin, salt),
    wrong: 0,
    locked: false,
  };
  await db.transaction(['pin'], 'readwrite', (tx) => {
    tx.put('pin', 'pin', record);
    return Promise.resolve();
  });
}

export type UnlockResult = 'ok' | 'wrong' | 'locked' | 'no-pin';

/** Checks a PIN: the fifth wrong one in a row locks the POS until an online login. */
export async function unlockWithPin(db: OfflineDb, pin: string): Promise<UnlockResult> {
  const stored = await db.transaction(['pin'], 'readonly', (tx) => tx.get<PinRecord>('pin', 'pin'));
  if (!stored) return 'no-pin';
  if (stored.locked) return 'locked';
  const ok = (await pinHash(pin, fromBase64(stored.salt))) === stored.hash;
  const wrong = ok ? 0 : stored.wrong + 1;
  const locked = wrong >= OFFLINE_PIN.maxTries;
  await db.transaction(['pin'], 'readwrite', (tx) => {
    tx.put('pin', 'pin', { ...stored, wrong, locked });
    return Promise.resolve();
  });
  return ok ? 'ok' : locked ? 'locked' : 'wrong';
}

/** An online login opens a locked POS again (D14.3). */
export async function clearPinLock(db: OfflineDb): Promise<void> {
  await db.transaction(['pin'], 'readwrite', async (tx) => {
    const stored = await tx.get<PinRecord>('pin', 'pin');
    if (stored) tx.put('pin', 'pin', { ...stored, wrong: 0, locked: false });
  });
}

/** D14.4: the browser keeps this site's data under pressure; offline is off without it. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
