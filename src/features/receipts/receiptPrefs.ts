import { z } from 'zod';

export type ReceiptPaper = 'thermal' | 'a4';

const KEY = 'ecofin.receipt.prefs';
const Prefs = z.object({
  paper: z.enum(['thermal', 'a4']).optional(),
  lang: z.enum(['ar', 'en']).optional(),
});
export type ReceiptPrefs = z.infer<typeof Prefs>;

/** What this device printed with last time; anything unreadable is ignored. */
export function readReceiptPrefs(): ReceiptPrefs {
  try {
    const parsed = Prefs.safeParse(JSON.parse(window.localStorage.getItem(KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveReceiptPrefs(change: ReceiptPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readReceiptPrefs(), ...change }));
  } catch {
    /* storage blocked: the choice lasts for this dialog only */
  }
}

/** Thermal: the printable width is narrower than the roll (72 mm on 80, 48 mm on 58). */
export const contentWidthMm = (rollMm: 58 | 80) => (rollMm === 80 ? 72 : 48);

/**
 * The @page rule for the paper. A roll has no page length, and CSS has no "as long as the
 * content", so the page is as long as the receipt measured on screen (A4 length when unknown).
 */
export function receiptPageCss(paper: ReceiptPaper, rollMm: 58 | 80, heightMm: number | null) {
  return paper === 'a4'
    ? '@page { size: A4; margin: 12mm; }'
    : `@page { size: ${rollMm}mm ${heightMm ?? 297}mm; margin: 0; }`;
}
