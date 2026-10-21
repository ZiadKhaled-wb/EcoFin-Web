import { describe, expect, it } from 'vitest';
import { dateParam, enumParam, uuidParam } from './urlFilters';

const ID = '44444444-4444-4444-8444-444444444444';
const q = (text: string) => new URLSearchParams(text);

describe('URL filters', () => {
  it('takes a well-formed UUID and drops anything else', () => {
    expect(uuidParam(q(`branch_id=${ID}`), 'branch_id')).toBe(ID);
    expect(uuidParam(q('branch_id=main'), 'branch_id')).toBe('');
    expect(uuidParam(q('branch_id=1; drop table'), 'branch_id')).toBe('');
    expect(uuidParam(q(''), 'branch_id')).toBe('');
  });

  it('takes a business date and drops anything else', () => {
    expect(dateParam(q('from=2026-10-21'), 'from')).toBe('2026-10-21');
    expect(dateParam(q('from=21/10/2026'), 'from')).toBe('');
    expect(dateParam(q('from=2026-13-40'), 'from')).toBe('');
    expect(dateParam(q(''), 'from')).toBe('');
  });

  it('takes one of the allowed values and drops anything else', () => {
    expect(enumParam(q('status=open'), 'status', ['open', 'closed'] as const)).toBe('open');
    expect(enumParam(q('status=all'), 'status', ['open', 'closed'] as const)).toBe('');
    expect(enumParam(q(''), 'status', ['open', 'closed'] as const)).toBe('');
  });
});
