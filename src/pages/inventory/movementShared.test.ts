import { describe, expect, it } from 'vitest';
import { documentHref } from './movementShared';

const ID = 'a0540000-0000-4000-8000-000000000050';

describe('movement source links', () => {
  it('a purchase return opens its page (U04)', () => {
    expect(
      documentHref({
        source_type: 'purchase_return',
        source_id: ID,
        source_number: 'MAIN-PR-26-000001',
        unit_id: null,
      }),
    ).toBe(`/purchasing/returns/${ID}`);
  });

  it('a purchase invoice opens its page; a sale has no page yet', () => {
    const ref = { source_id: ID, source_number: 'X', unit_id: null };
    expect(documentHref({ ...ref, source_type: 'purchase_invoice' })).toBe(
      `/purchasing/invoices/${ID}`,
    );
    expect(documentHref({ ...ref, source_type: 'sale' })).toBeNull();
  });
});
