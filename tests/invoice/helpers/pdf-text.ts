import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Text of each page of a PDF (one string per page), extracted with pdf.js so assertions read what a person would read. */
export const extractPdfText = async (bytes: Uint8Array): Promise<string[]> => {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim());
  }
  await doc.destroy();
  return pages;
};

export type PdfTextItem = { str: string; x: number; y: number; width: number };

/** Positioned text items per page (PDF coordinates, y up), for layout assertions. */
export const extractTextItems = async (bytes: Uint8Array): Promise<PdfTextItem[][]> => {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: PdfTextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items.flatMap((item) =>
        "str" in item && item.str.trim() ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : [],
      ),
    );
  }
  await doc.destroy();
  return pages;
};
