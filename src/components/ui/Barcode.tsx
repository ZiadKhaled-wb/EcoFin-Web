import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { encodeBarcode, totalModules } from '@/lib/barcode';

type Props = {
  value: string;
  /** Shown instead of the bars when the value can't be encoded (e.g. non-ASCII text). */
  fallback: string;
  className?: string;
};

/**
 * A 1-D barcode as SVG (EAN-13 or Code 128, see lib/barcode). The SVG stretches to its box:
 * every module scales by the same factor, so the code stays readable at any label width.
 * Quiet zones are part of the drawing; bars are always black on white for scanners.
 */
export default function Barcode({ value, fallback, className }: Props) {
  const encoded = useMemo(() => {
    try {
      return encodeBarcode(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!encoded) return <span className="type-caption">{fallback}</span>;

  const width = totalModules(encoded);
  const bars: { x: number; w: number }[] = [];
  let x = encoded.quiet.left;
  encoded.widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
      data-symbology={encoded.symbology}
      className={cn('block bg-white', className)}
    >
      <rect x={0} y={0} width={width} height={100} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={100} fill="#000" />
      ))}
    </svg>
  );
}
