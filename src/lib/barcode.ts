/**
 * C03 (D45): barcode encoders for labels, no dependency. `encodeBarcode` picks the symbology:
 * a 13-digit code with a valid EAN-13 check digit prints as EAN-13 (C02's generated in-store
 * codes and most supplier codes); anything else, serials and IMEIs included, as Code 128.
 * The result is a list of bar/space widths in modules, starting with a bar, without quiet zones.
 */

export type Symbology = 'ean13' | 'code128';
export interface EncodedBarcode {
  symbology: Symbology;
  /** Alternating bar, space, bar, ... widths in modules. */
  widths: number[];
  /** Quiet zone each side, in modules. */
  quiet: { left: number; right: number };
}

// ---------------------------------------------------------------------------------------- EAN-13
const EAN_L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const EAN_G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const EAN_R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
/** Parity of the left six digits, chosen by the first digit. */
const EAN_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLG',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** EAN-13 check digit of 12 digits (weights 1, 3 from the left); same rule as the SQL helper. */
export function ean13CheckDigit(first12: string): string {
  if (!/^\d{12}$/.test(first12)) throw new Error('EAN-13 needs 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
}

/** The 95 modules of an EAN-13 as '0'/'1' (1 = bar). */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error('Not a valid EAN-13');
  const parity = EAN_PARITY[Number(code[0])]!;
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += parity[i - 1] === 'L' ? EAN_L[d] : EAN_G[d];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
  return bits + '101';
}

/** Run lengths of a module string that starts with a bar. */
function runs(bits: string): number[] {
  const out: number[] = [];
  let count = 1;
  for (let i = 1; i <= bits.length; i++) {
    if (bits[i] === bits[i - 1]) count++;
    else {
      out.push(count);
      count = 1;
    }
  }
  return out;
}

// -------------------------------------------------------------------------------------- Code 128
/** Bar/space widths of Code 128 values 0..106 (106 = stop, 7 elements). */
const C128 = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const STOP = 106;

/**
 * Code 128 values for `text` (printable ASCII only), check value and stop included. A run of
 * digits uses subset C (two digits per symbol); an odd digit count ends in subset B.
 */
export function code128Values(text: string): number[] {
  if (text.length === 0 || !/^[\x20-\x7e]+$/.test(text)) {
    throw new Error('Code 128 labels take printable ASCII only');
  }
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length >= 2) {
    values.push(START_C);
    const even = text.length - (text.length % 2);
    for (let i = 0; i < even; i += 2) values.push(Number(text.slice(i, i + 2)));
    if (even < text.length) values.push(CODE_B, text.charCodeAt(even) - 32);
  } else {
    values.push(START_B);
    for (const ch of text) values.push(ch.charCodeAt(0) - 32);
  }
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, check, STOP];
}

export function encodeBarcode(value: string): EncodedBarcode {
  if (isValidEan13(value)) {
    return { symbology: 'ean13', widths: runs(ean13Modules(value)), quiet: { left: 11, right: 7 } };
  }
  const widths = code128Values(value).flatMap((v) => C128[v]!.split('').map(Number));
  return { symbology: 'code128', widths, quiet: { left: 10, right: 10 } };
}

/** Total width in modules, quiet zones included. */
export function totalModules(b: EncodedBarcode): number {
  return b.quiet.left + b.widths.reduce((s, w) => s + w, 0) + b.quiet.right;
}
