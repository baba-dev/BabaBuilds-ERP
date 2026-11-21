import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

/** URIs of every link annotation in the PDF (all pages). */
export const pdfLinkUrls = async (bytes: Uint8Array): Promise<string[]> => {
  const doc = await PDFDocument.load(bytes);
  const urls: string[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i += 1) {
      const annot = annots.lookup(i, PDFDict);
      const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString);
      if (uri) urls.push(uri.decodeText());
    }
  }
  return urls;
};
