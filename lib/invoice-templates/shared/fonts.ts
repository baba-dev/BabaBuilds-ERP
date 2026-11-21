import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { PdfFonts } from "@/lib/invoice-templates/types";

const FONT_DIR = path.join(process.cwd(), "assets", "invoice-fonts");

type FontBytes = { regular: Uint8Array; bold: Uint8Array };

let cachedBytes: Promise<FontBytes> | null = null;

/** Reads the bundled font files once per process; later renders reuse the bytes. */
export const loadInvoiceFontBytes = (): Promise<FontBytes> => {
  if (!cachedBytes) {
    cachedBytes = Promise.all([
      fs.promises.readFile(path.join(FONT_DIR, "NotoSans-Regular.ttf")),
      fs.promises.readFile(path.join(FONT_DIR, "NotoSans-Bold.ttf")),
    ]).then(([regular, bold]) => ({ regular, bold }));
    cachedBytes.catch(() => {
      cachedBytes = null;
    });
  }
  return cachedBytes;
};

/** Embeds subsetted Noto Sans (rupee sign included). There is no italic file, so `oblique` reuses regular. */
export const embedUnicodeFonts = async (pdfDoc: PDFDocument): Promise<PdfFonts> => {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadInvoiceFontBytes();
  const regular = await pdfDoc.embedFont(bytes.regular, { subset: true });
  const bold = await pdfDoc.embedFont(bytes.bold, { subset: true });
  return { regular, bold, oblique: regular };
};

/** Replaces characters the font cannot encode with "?" so drawing text never throws. */
export const safeText = (font: PDFFont, text: string): string => {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += code === 0x0a || code === 0x09 || supported.has(code) ? char : "?";
  }
  return out;
};
