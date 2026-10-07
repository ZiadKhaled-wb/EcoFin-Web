import { describe, expect, it } from 'vitest';
import {
  code128Values,
  ean13CheckDigit,
  ean13Modules,
  encodeBarcode,
  isValidEan13,
  totalModules,
} from './barcode';

describe('EAN-13', () => {
  it('computes the check digit like the SQL helper', () => {
    expect(ean13CheckDigit('400638133393')).toBe('1');
    expect(ean13CheckDigit('590123412345')).toBe('7');
    expect(ean13CheckDigit('622300000001')).toBe('4');
    expect(ean13CheckDigit('000000000000')).toBe('0');
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
  });

  it('builds 95 modules with the guard bars and the parity of the first digit', () => {
    const bits = ean13Modules('4006381333931');
    expect(bits).toHaveLength(95);
    expect(bits.slice(0, 3)).toBe('101');
    expect(bits.slice(45, 50)).toBe('01010');
    expect(bits.slice(92)).toBe('101');
    // First digit 4 → parity LGLLGG: the second digit (0) is L, the third (0) is G.
    expect(bits.slice(3, 10)).toBe('0001101');
    expect(bits.slice(10, 17)).toBe('0100111');
    // Right half uses the R codes: the last digit 1 → 1100110.
    expect(bits.slice(85, 92)).toBe('1100110');
  });

  it('is picked for a valid 13-digit code', () => {
    const b = encodeBarcode('2000000000015'.slice(0, 12) + ean13CheckDigit('200000000001'));
    expect(b.symbology).toBe('ean13');
    expect(b.widths.reduce((s, w) => s + w, 0)).toBe(95);
    expect(totalModules(b)).toBe(95 + 11 + 7);
  });
});

describe('Code 128', () => {
  it('uses subset B with the weighted check value', () => {
    // 104 + 33·1 + 34·2 = 205 → 205 mod 103 = 102
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });

  it('packs digit pairs in subset C', () => {
    // 105 + 12·1 + 34·2 + 56·3 = 353 → 44
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44, 106]);
  });

  it('ends an odd digit run in subset B', () => {
    // 105 + 12 + 34·2 + 100·3 + 21·4 = 569 → 54
    expect(code128Values('12345')).toEqual([105, 12, 34, 100, 21, 54, 106]);
  });

  it('encodes SKUs, invalid EANs and IMEIs as Code 128 with 11-module symbols', () => {
    for (const value of ['TV-55', '6223000000017', '356938035643809']) {
      const b = encodeBarcode(value);
      expect(b.symbology).toBe('code128');
      const symbols = code128Values(value).length;
      // Every symbol is 11 modules, the stop 13; bars and spaces alternate from a bar.
      expect(b.widths.reduce((s, w) => s + w, 0)).toBe(11 * (symbols - 1) + 13);
      expect(b.widths.length % 2).toBe(1);
    }
  });

  it('refuses text it cannot encode', () => {
    expect(() => code128Values('')).toThrow();
    expect(() => code128Values('تلفزيون')).toThrow();
  });
});
