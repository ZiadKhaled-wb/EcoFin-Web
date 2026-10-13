import qrcode from 'qrcode-generator';

/** Modules of white around the code; scanners need at least 4. */
export const QR_QUIET_ZONE = 4;

/** The QR matrix of `value` (error correction M, the smallest version that fits); null if it can't be encoded. */
export function qrMatrix(value: string): boolean[][] | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, row) =>
      Array.from({ length: n }, (_, col) => qr.isDark(row, col)),
    );
  } catch {
    return null;
  }
}
