import QRCode from "qrcode";
import type { Color, PDFPage } from "pdf-lib";

/** QR modules as rows of booleans (true = dark), error correction M. Empty when the text is empty or too long to encode. */
export const qrMatrix = (text: string): boolean[][] => {
  if (!text || !text.trim()) return [];
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    const size = modules.size;
    return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(modules.get(r, c))));
  } catch {
    return [];
  }
};

/**
 * Draws the matrix as vector rectangles inside a `size` x `size` square whose top-left is (x, yFromTop).
 * Horizontal runs of dark modules become one rectangle each, which keeps the PDF small and the edges crisp.
 * The caller supplies the quiet zone.
 */
export const drawQr = (
  page: PDFPage,
  pageHeight: number,
  matrix: boolean[][],
  x: number,
  yFromTop: number,
  size: number,
  color: Color,
): void => {
  const n = matrix.length;
  if (n === 0) return;
  const module = size / n;
  // A hairline overlap hides seams that some viewers show between adjacent rectangles.
  const bleed = module * 0.04;
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!matrix[r][c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < n && matrix[r][c]) c += 1;
      page.drawRectangle({
        x: x + start * module,
        y: pageHeight - yFromTop - (r + 1) * module - bleed,
        width: (c - start) * module,
        height: module + bleed,
        color,
        borderWidth: 0,
      });
    }
  }
};
