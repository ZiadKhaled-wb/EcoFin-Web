import { useMemo } from 'react';
import { QR_QUIET_ZONE, qrMatrix } from './qr';

/**
 * S04 (D68): a QR code as SVG, black on white with its quiet zone, drawn in the browser so the
 * text never leaves it. The text is printed exactly as given (the ETA payload is never edited).
 */
export default function QrCode({
  value,
  label,
  sizeMm,
}: {
  value: string;
  label: string;
  sizeMm: number;
}) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  if (!matrix) return null;
  const size = matrix.length + QR_QUIET_ZONE * 2;
  const path = matrix
    .flatMap((row, r) =>
      row.map((dark, c) => (dark ? `M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z` : '')),
    )
    .join('');
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-qr={value}
      data-modules={matrix.length}
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm`, display: 'block' }}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
