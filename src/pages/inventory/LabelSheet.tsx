import type { CSSProperties } from 'react';
import Barcode from '@/components/ui/Barcode';
import { formatMoney } from '@/lib/format';
import { t } from '@/i18n';

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

function Label({ label, template }: { label: LabelData; template: LabelTemplate }) {
  const h = template.heightMm;
  const style: CSSProperties = {
    width: `${template.widthMm}mm`,
    height: `${h}mm`,
    padding: '1.5mm 2mm',
    fontSize: `${Math.max(2.2, h * 0.1)}mm`,
    lineHeight: 1.15,
  };
  return (
    <div
      className="flex flex-col items-center justify-between overflow-hidden bg-white text-black"
      style={{ ...style, breakInside: 'avoid', pageBreakInside: 'avoid' }}
      data-label
    >
      <div className="w-full truncate text-center font-semibold">{label.name}</div>
      {/* Bars take about 45% of the label height. */}
      <div className="w-full" style={{ height: `${h * 0.45}mm` }}>
        <Barcode value={label.code} fallback={t('labels.cannotEncode')} className="h-full w-full" />
      </div>
      <div dir="ltr" className="w-full text-center tracking-wider" style={{ fontSize: '0.85em' }}>
        {label.code}
      </div>
      {label.serial && label.serial !== label.code && (
        <div dir="ltr" className="w-full truncate text-center" style={{ fontSize: '0.85em' }}>
          {label.serial}
        </div>
      )}
      {label.price && (
        <div className="w-full text-center font-bold">{formatMoney(label.price)}</div>
      )}
    </div>
  );
}

/** The labels laid out for the template: a grid on A4, one per page on a roll. */
export default function LabelSheet({
  labels,
  template,
}: {
  labels: LabelData[];
  template: LabelTemplate;
}) {
  if ('columns' in template) {
    return (
      <div
        className="grid bg-white"
        style={{
          gridTemplateColumns: `repeat(${template.columns}, ${template.widthMm}mm)`,
          width: '210mm',
        }}
      >
        {labels.map((l) => (
          <Label key={l.key} label={l} template={template} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-[2mm] print:block print:gap-0">
      {labels.map((l) => (
        <div key={l.key} className="print:break-after-page">
          <Label label={l} template={template} />
        </div>
      ))}
    </div>
  );
}
