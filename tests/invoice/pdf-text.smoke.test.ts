import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { embedUnicodeFonts } from "@/lib/invoice-templates/shared/fonts";
import { extractPdfText } from "./helpers/pdf-text";

describe("extractPdfText", () => {
  it("reads back text drawn with the embedded unicode font, rupee sign included", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    const page = doc.addPage([300, 200]);
    page.drawText("Total ₹1,23,456.00 PAID", { x: 20, y: 100, size: 14, font: fonts.bold });
    const [text] = await extractPdfText(await doc.save());
    expect(text).toContain("₹1,23,456.00");
    expect(text).toContain("PAID");
  });
});
