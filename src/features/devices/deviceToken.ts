import { create } from 'zustand';

/**
 * O03 (D68): the device token of this computer, one per shop, kept in localStorage under
 * `ecotech.deviceToken.<organization_id>`. It is what makes this browser a POS device: the API
 * client sends it as `x-device-token`, and forgets it when the server answers DEVICE_REVOKED.
 * It outlives a logout on purpose: the computer stays the same device for the next cashier.
 */
const PREFIX = 'ecotech.deviceToken.';

export const deviceTokenKey = (orgId: string) => `${PREFIX}${orgId}`;

/** Bumped on every change, so components re-read the token (localStorage is not reactive). */
const useVersion = create<{ version: number }>(() => ({ version: 0 }));
const changed = () => useVersion.setState((s) => ({ version: s.version + 1 }));

export function getDeviceToken(orgId: string | null): string | null {
  if (!orgId) return null;
  try {
    return window.localStorage.getItem(deviceTokenKey(orgId)) || null;
  } catch {
    return null; // storage blocked: this browser can't be a POS device
  }
}

export function setDeviceToken(orgId: string, token: string): void {
  try {
    window.localStorage.setItem(deviceTokenKey(orgId), token);
  } catch {
    /* storage blocked: the pairing is lost with the page */
  }
  changed();
}

export function clearDeviceToken(orgId: string): void {
  try {
    window.localStorage.removeItem(deviceTokenKey(orgId));
  } catch {
    /* nothing stored */
  }
  changed();
}

/** The stored token of a shop, re-read whenever it is set or cleared. */
export function useDeviceToken(orgId: string | null): string | null {
  useVersion((s) => s.version);
  return getDeviceToken(orgId);
}
