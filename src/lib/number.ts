// Numeric input helpers. Values stay STRINGS end to end: never round-trip money through floats.

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Arabic-Indic and Persian digits -> Latin. Arabic decimal mark -> ".", thousands marks removed. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC_INDIC.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬,]/g, '');
}

/** Keep only a valid partial decimal: digits, one ".", at most `decimals` fraction digits, optional leading "-". */
export function sanitizeDecimal(
  raw: string,
  { decimals, allowNegative }: { decimals: number; allowNegative: boolean },
): string {
  let s = normalizeDigits(raw);
  const negative = allowNegative && s.trim().startsWith('-');
  s = s.replace(/[^0-9.]/g, '');
  const [int, ...rest] = s.split('.');
  let out = int;
  if (decimals > 0 && rest.length > 0) out += '.' + rest.join('').slice(0, decimals);
  return (negative ? '-' : '') + out;
}

/** "12.5" -> "12.50". String-based, so no floating-point rounding surprises. */
export function padDecimals(value: string, decimals: number): string {
  if (value === '' || value === '-') return '';
  const negative = value.startsWith('-');
  const [i = '', f = ''] = value.replace('-', '').split('.');
  const int = i === '' ? '0' : i;
  const out = decimals > 0 ? `${int}.${f.padEnd(decimals, '0')}` : int;
  return (negative ? '-' : '') + out;
}
