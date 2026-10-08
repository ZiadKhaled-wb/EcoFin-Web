/** C03 (D45): label sizes. Rolls print one label per page; the A4 sheet is a grid. */
export const LABEL_TEMPLATES = [
  { id: 'roll-38x25', widthMm: 38, heightMm: 25 },
  { id: 'roll-50x30', widthMm: 50, heightMm: 30 },
  { id: 'roll-58x40', widthMm: 58, heightMm: 40 },
  { id: 'a4-3x8', widthMm: 70, heightMm: 37, columns: 3 },
] as const;
export type LabelTemplate = (typeof LABEL_TEMPLATES)[number];
export type LabelTemplateId = LabelTemplate['id'];

/** One printed label: the barcode is the product's barcode (or SKU), or the unit's serial. */
export interface LabelData {
  key: string;
  name: string;
  code: string;
  price: string | null;
  serial: string | null;
}

/** The @page rule for the chosen template (roll: the label is the page; A4: the sheet). */
export function pageCss(template: LabelTemplate) {
  return 'columns' in template
    ? '@page { size: A4; margin: 0; }'
    : `@page { size: ${template.widthMm}mm ${template.heightMm}mm; margin: 0; }`;
}
