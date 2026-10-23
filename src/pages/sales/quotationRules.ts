import type { Quotation, QuotationLineInput, QuotationStatus } from '@ziadkhaled-wb/contracts';
export function quotationActions(status: QuotationStatus) {
  return status === 'draft'
    ? (['send', 'cancel'] as const)
    : status === 'sent'
      ? (['accept', 'reject', 'cancel'] as const)
      : [];
}
export const priceLocked = (line: QuotationLineInput, canOverride: boolean) =>
  !!line.product_id && !canOverride;
export function duplicateQuotation(q: Quotation) {
  return {
    branch_id: q.branch_id,
    customer_id: q.customer_id,
    notes: q.notes,
    lines: q.lines.map((l) => ({
      product_id: l.product_id,
      description: l.description,
      custom_notes: l.custom_notes,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
    })),
  };
}
