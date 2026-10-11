import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The keys of the POS (D66). F1, F3, F5, F6, F11 and F12 stay with the browser. */
export const POS_SHORTCUTS = {
  search: 'F2',
  customer: 'F4',
  discount: 'F7',
  hold: 'F8',
  held: 'F9',
  pay: 'F10',
} as const;

export type PosShortcut = (typeof POS_SHORTCUTS)[keyof typeof POS_SHORTCUTS];

/** A function that never changes but always runs the latest `fn` (for memoised children). */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}

/** The input inside the element (our field components take no ref of their own). */
export const inputIn = (ref: RefObject<HTMLElement | null>) =>
  ref.current?.querySelector('input') ?? null;

/** A ref for a dialog's body: its first field or button takes the focus as the dialog opens. */
export const focusFirst = (el: HTMLElement | null) => {
  el?.querySelector<HTMLElement>('input, button')?.focus();
};

const dialogOpen = () => document.querySelector('[role="dialog"]') !== null;
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);

/**
 * One `keydown` listener for the whole screen. While a dialog is open only Esc and that dialog's
 * own keys work: a function key is swallowed, never run behind the dialog. A character typed while
 * nothing has the focus goes to the search box (a scanner that starts typing anywhere).
 */
export function usePosShortcuts(
  keys: Partial<Record<PosShortcut, () => void>>,
  options: { onEscape?: () => void; onType?: () => void } = {},
) {
  const run = useEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = keys[e.key as PosShortcut];
    if (action) {
      e.preventDefault();
      if (!dialogOpen()) action();
      return;
    }
    if (dialogOpen()) return;
    if (e.key === 'Escape') {
      options.onEscape?.();
      return;
    }
    const target = document.activeElement;
    if (e.key.length === 1 && e.key !== ' ' && !(target && TYPING.has(target.tagName))) {
      options.onType?.();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', run);
    return () => window.removeEventListener('keydown', run);
  }, [run]);
}
