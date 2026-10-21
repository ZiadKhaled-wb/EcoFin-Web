import { formatEgp } from '@ziadkhaled-wb/contracts';
import { getLanguage, type Language } from '@/i18n';

// Latin digits (0-9) in both languages (design.md section 4), with the locale's separators.
const LOCALE: Record<Language, string> = { ar: 'ar-EG-u-nu-latn', en: 'en-US' };

/** The shop's default time zone until `me.org.timezone` is passed in. */
const DEFAULT_TIME_ZONE = 'Africa/Cairo';

type Decimal = string | number;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Intl formats a decimal string exactly (no float round trip). Anything else is rejected. */
function toIntlInput(value: Decimal): string | number {
  if (typeof value === 'number') return value;
  if (!DECIMAL_PATTERN.test(value)) throw new RangeError(`Not a decimal: ${value}`);
  return value;
}

/** "1250.5" -> "1,250.5". Pass strings for money and quantities. */
export function formatNumber(
  value: Decimal,
  lang: Language = getLanguage(),
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    maximumFractionDigits: 20,
    ...options,
  }).format(toIntlInput(value) as Intl.StringNumericLiteral);
}

/**
 * Money from the contract's decimal string: "1250" -> "1,250.00 ج.م" (currency after, design.md).
 * The shared F12 rule (contracts `formatEgp`, D31): rounded half-up to 2 decimals, never via a float.
 */
export function formatMoney(value: string, lang: Language = getLanguage()): string {
  return formatEgp(value, lang);
}

function toDate(value: string | Date): Date {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Not a date: ${String(value)}`);
  return d;
}

/** ISO timestamp -> a date in the shop's time zone, e.g. "3 Oct 2026". */
export function formatDate(
  value: string | Date,
  lang: Language = getLanguage(),
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'medium', timeZone }).format(
    toDate(value),
  );
}

/** ISO timestamp -> date and time in the shop's time zone. */
export function formatDateTime(
  value: string | Date,
  lang: Language = getLanguage(),
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(toDate(value));
}

/** A business date (`YYYY-MM-DD`, no time zone) formatted without any day shift. */
export function formatBusinessDate(value: string, lang: Language = getLanguage()): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'medium', timeZone: 'UTC' }).format(
    toDate(`${value}T00:00:00Z`),
  );
}

/** Today in the shop's time zone (the business date the server uses), never the browser's. */
export function shopToday(zone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
