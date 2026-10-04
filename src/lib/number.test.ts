import { describe, expect, it } from 'vitest';
import { normalizeDigits, padDecimals, sanitizeDecimal } from './number';

describe('number helpers', () => {
  it('converts Arabic-Indic digits and decimal mark to Latin', () => {
    expect(normalizeDigits('١٢٫٥')).toBe('12.5');
  });

  it('keeps a valid partial decimal and trims extra fraction digits', () => {
    expect(sanitizeDecimal('12.345abc', { decimals: 2, allowNegative: false })).toBe('12.34');
  });

  it('only allows a leading minus when negatives are allowed', () => {
    expect(sanitizeDecimal('-5', { decimals: 2, allowNegative: true })).toBe('-5');
    expect(sanitizeDecimal('-5', { decimals: 2, allowNegative: false })).toBe('5');
  });

  it('pads decimals as strings', () => {
    expect(padDecimals('12.5', 2)).toBe('12.50');
  });
});
