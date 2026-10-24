import { useState } from 'react';
import {
  MAX_HELD_CARTS,
  readHeldCarts,
  writeHeldCarts,
  type HeldContent,
  type HeldCart,
} from './posStorage';

/**
 * S06 (D66): carts parked on this device (`localStorage`), per shop and employee. A held cart
 * reserves no stock and keeps no prices: it is quoted again when it is taken back.
 */
export function useHeldCarts(scope: string) {
  const [carts, setCarts] = useState<HeldCart[]>(() => readHeldCarts(scope));

  const save = (next: HeldCart[]) => {
    setCarts(next);
    writeHeldCarts(scope, next);
  };

  return {
    carts,
    full: carts.length >= MAX_HELD_CARTS,
    /** False when the list is full: the cart stays on screen. */
    hold(cart: HeldContent, note: string): boolean {
      if (carts.length >= MAX_HELD_CARTS) return false;
      save([
        { ...cart, id: crypto.randomUUID(), at: new Date().toISOString(), note: note.trim() },
        ...carts,
      ]);
      return true;
    },
    /** Takes a cart out of the list and answers it. */
    take(id: string): HeldCart | null {
      const found = carts.find((c) => c.id === id) ?? null;
      if (found) save(carts.filter((c) => c.id !== id));
      return found;
    },
    remove(id: string) {
      save(carts.filter((c) => c.id !== id));
    },
  };
}
