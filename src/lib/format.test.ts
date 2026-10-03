import { describe, expect, it } from 'vitest';
import {
  formatBusinessDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/lib/format';

describe('formatNumber', () => {
  it('uses Latin digits and grouping in both languages', () => {
    expect(formatNumber('1234567.5', 'en')).toBe('1,234,567.5');
    expect(formatNumber('1234567.5', 'ar')).toBe('1,234,567.5');
    expect(formatNumber('1234567.5', 'ar')).toMatch(/^[0-9,.]+$/);
  });
  it('rejects text that is not a decimal', () => {
    expect(() => formatNumber('12abc', 'en')).toThrow(RangeError);
  });
});

describe('formatMoney (decimal string in, string out)', () => {
  it('pads to 2 decimals and puts the currency after', () => {
    expect(formatMoney('1250', 'ar')).toBe('1,250.00 ج.م');
    expect(formatMoney('1250.5', 'en')).toBe('1,250.50 EGP');
  });
  it('keeps precision a float would lose', () => {
    expect(formatMoney('9007199254740993.10', 'en')).toBe('9,007,199,254,740,993.10 EGP');
  });
  it('handles negatives and zero', () => {
    expect(formatMoney('-0.5', 'en')).toBe('-0.50 EGP');
    expect(formatMoney('0', 'ar')).toBe('0.00 ج.م');
  });
});

describe('dates', () => {
  it('formats a timestamp in the shop time zone, per language', () => {
    expect(formatDate('2026-10-03T22:30:00.000Z', 'en')).toBe('Oct 4, 2026'); // Cairo is UTC+3 in October
    expect(formatDate('2026-10-03T08:00:00.000Z', 'ar')).toMatch(/^[0-9]/);
  });
  it('formats date and time', () => {
    expect(formatDateTime('2026-10-03T08:00:00.000Z', 'en')).toContain('2026');
  });
  it('does not shift a business date', () => {
    expect(formatBusinessDate('2026-10-03', 'en')).toBe('Oct 3, 2026');
    expect(formatBusinessDate('2026-10-03', 'ar')).toContain('2026');
  });
  it('rejects an invalid date', () => {
    expect(() => formatDate('nope', 'en')).toThrow(RangeError);
  });
});
