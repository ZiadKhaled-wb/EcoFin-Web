import { describe, expect, it } from 'vitest';
import {
  AUDIT_PAGE_SIZE,
  hasAnyFilter,
  readFilters,
  toSearchParams,
  writeFilters,
} from './filters';

const P = (s: string) => new URLSearchParams(s);

describe('audit filters', () => {
  it('reads the URL, defaulting to page 1 and empty filters', () => {
    expect(readFilters(P(''))).toEqual({
      page: 1,
      from: '',
      to: '',
      action: '',
      entityType: '',
      branchId: '',
      actorEmployeeId: '',
      actorName: '',
    });
    expect(readFilters(P('page=3&action=auth.login')).page).toBe(3);
    expect(readFilters(P('page=-2')).page).toBe(1);
    expect(readFilters(P('page=abc')).page).toBe(1);
  });

  it('a filter change goes back to page 1; empty values leave the URL', () => {
    const current = readFilters(P('page=4&action=auth.login'));
    expect(writeFilters(current, { branchId: 'b1' }).toString()).toBe(
      'action=auth.login&branchId=b1',
    );
    expect(writeFilters(current, { page: 5 }).toString()).toBe('page=5&action=auth.login');
    expect(writeFilters(current, { action: '' }).toString()).toBe('');
  });

  it('turns calendar days into the start and end of the day; only set filters are sent', () => {
    const q = toSearchParams(
      readFilters(P('from=2026-10-01&to=2026-10-02&actorEmployeeId=e1&actorName=X')),
    );
    expect(q).toEqual({
      page: 1,
      pageSize: AUDIT_PAGE_SIZE,
      from: new Date('2026-10-01T00:00:00').toISOString(),
      to: new Date('2026-10-02T23:59:59.999').toISOString(),
      actorEmployeeId: 'e1',
    });
    expect(q).not.toHaveProperty('actorName'); // display only, never sent
  });

  it('knows whether any filter is set', () => {
    expect(hasAnyFilter(readFilters(P('page=2')))).toBe(false);
    expect(hasAnyFilter(readFilters(P('entityType=employee')))).toBe(true);
  });
});
