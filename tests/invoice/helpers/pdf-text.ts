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
