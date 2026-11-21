import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

/** All decoded stream contents of a PDF (page content, forms) joined as latin1 text, for operator-level assertions. */
export const pdfContentText = async (bytes: Uint8Array): Promise<string> => {
  const doc = await PDFDocument.load(bytes);
  const parts: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.get(PDFName.of("Subtype"));
    if (subtype && String(subtype) === "/Image") continue;
    try {
      parts.push(Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1"));
    } catch {
      // Non-content streams (fonts, ICC) may not decode as plain text; skip them.
    }
  }
  return parts.join("\n");
};

/** Number of filled rectangles pdf-lib drew (it emits them as closed paths: `... h` then `f`). */
export const countRects = async (bytes: Uint8Array): Promise<number> => ((await pdfContentText(bytes)).match(/\nh\nf\n/g) ?? []).length;

/** True when the PDF embeds a raster image. */
export const hasImage = async (bytes: Uint8Array): Promise<boolean> => {
  const doc = await PDFDocument.load(bytes);
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of("Subtype"))) === "/Image") return true;
  }
  return false;
};
