import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { embedUnicodeFonts, safeText } from "@/lib/invoice-templates/shared/fonts";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

describe("unicode invoice fonts", () => {
  it("embeds fonts that cover the rupee sign", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    expect(fonts.regular.getCharacterSet()).toContain(0x20b9);
    expect(fonts.bold.getCharacterSet()).toContain(0x20b9);
  });

  it("safeText never throws on text the font cannot encode", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    expect(() => safeText(fonts.regular, "शर्मा Traders")).not.toThrow();
    expect(safeText(fonts.regular, "Plain ₹ 100")).toBe("Plain ₹ 100");
  });

  it("measures and draws Devanagari text (Indic shaping must not crash)", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    expect(fonts.regular.widthOfTextAtSize("शर्मा ट्रेडर्स", 12)).toBeGreaterThan(0);
    const page = doc.addPage([300, 200]);
    page.drawText("शर्मा ट्रेडर्स", { x: 20, y: 100, size: 14, font: fonts.regular });
    expect((await PDFDocument.load(await doc.save())).getPageCount()).toBe(1);
  });

  it("draws the rupee sign and produces a reopenable PDF", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    const page = doc.addPage([300, 200]);
    page.drawText("₹1,23,456.00", { x: 20, y: 100, size: 14, font: fonts.regular });
    const bytes = await doc.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("renderInvoicePdf uses the unicode font set when the template asks for it", async () => {
    registerInvoiceTemplate({
      meta: {
        id: "TEST_UNICODE",
        title: "Test",
        paperSize: "A4",
        supportsSignature: false,
        supportsPaymentLink: false,
        supportsMultiPage: false,
        fonts: "unicode",
      },
      draw({ paginator, fonts }) {
        paginator.currentPage().drawText("₹ 500", { x: 40, y: 700, size: 12, font: fonts.regular });
      },
    });
    const vm = buildInvoiceViewModel({ ...SAMPLE_INVOICES.basic, templateId: "TEST_UNICODE" });
    const bytes = await renderInvoicePdf(vm);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
