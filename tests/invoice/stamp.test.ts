import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { embedUnicodeFonts } from "@/lib/invoice-templates/shared/fonts";
import { computeStampLayout, drawPaymentStamp, drawPaymentWatermark } from "@/lib/invoice-templates/shared/stamp";
import { INVOICE_PAPER_SIZES_PT } from "@/lib/invoice-templates/types";
import { extractPdfText } from "./helpers/pdf-text";
import { pdfContentText } from "./helpers/pdf-content";

const [A4_W, A4_H] = INVOICE_PAPER_SIZES_PT.A4;

const render = async (key: string, draw: "stamp" | "watermark" | "both" | "none", anchor = { x: 430, y: 520 }) => {
  const vm = buildInvoiceViewModel(SAMPLE_INVOICES[key]);
  const doc = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(doc);
  const page = doc.addPage([A4_W, A4_H]);
  if (draw === "stamp" || draw === "both") drawPaymentStamp({ page, fonts, vm, anchorX: anchor.x, anchorYFromTop: anchor.y });
  if (draw === "watermark" || draw === "both") drawPaymentWatermark(page, fonts, vm);
  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, text: (await extractPdfText(bytes))[0] };
};

describe("drawPaymentStamp", () => {
  it("stamps PAID with the paid date", async () => {
    const { text } = await render("paidWithLink", "stamp");
    expect(text).toContain("PAID");
    expect(text).toMatch(/30 Apr 2026/);
  });

  it("stamps PARTIALLY PAID with the balance due", async () => {
    const { text } = await render("partialWithBalance", "stamp");
    expect(text).toContain("PARTIALLY PAID");
    expect(text).toContain("₹14,880.00");
  });

  it("omits the balance when the paid amount is unknown", async () => {
    const { text } = await render("partiallyPaid", "stamp");
    expect(text).toContain("PARTIALLY PAID");
    expect(text).not.toMatch(/Balance/);
  });

  it("draws nothing for an invoice that is not paid", async () => {
    const stamped = await render("basic", "stamp");
    const blank = await render("basic", "none");
    expect(await pdfContentText(stamped.bytes)).toBe(await pdfContentText(blank.bytes));
  });
});

describe("computeStampLayout", () => {
  it("keeps the rotated stamp inside the page margins wherever it is anchored", async () => {
    const vm = buildInvoiceViewModel(SAMPLE_INVOICES.partialWithBalance);
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    for (const anchor of [{ x: 590, y: 830 }, { x: 5, y: 5 }, { x: 300, y: 400 }]) {
      const layout = computeStampLayout({ fonts, vm, anchorX: anchor.x, anchorYFromTop: anchor.y, pageWidth: A4_W, pageHeight: A4_H });
      expect(layout).not.toBeNull();
      expect(layout!.bounds.minX).toBeGreaterThanOrEqual(24 - 0.01);
      expect(layout!.bounds.maxX).toBeLessThanOrEqual(A4_W - 24 + 0.01);
      expect(layout!.bounds.minYFromTop).toBeGreaterThanOrEqual(24 - 0.01);
      expect(layout!.bounds.maxYFromTop).toBeLessThanOrEqual(A4_H - 24 + 0.01);
    }
  });

  it("returns null when there is nothing to stamp", async () => {
    const vm = buildInvoiceViewModel(SAMPLE_INVOICES.basic);
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    expect(computeStampLayout({ fonts, vm, anchorX: 300, anchorYFromTop: 300, pageWidth: A4_W, pageHeight: A4_H })).toBeNull();
  });
});

describe("drawPaymentWatermark", () => {
  it("adds the faint PAID watermark on top of the stamp", async () => {
    const both = await render("paidWithLink", "both");
    const stampOnly = await render("paidWithLink", "stamp");
    expect(both.text.split("PAID").length).toBeGreaterThan(stampOnly.text.split("PAID").length);
  });

  it("draws nothing when unpaid", async () => {
    const wm = await render("basic", "watermark");
    const blank = await render("basic", "none");
    expect(await pdfContentText(wm.bytes)).toBe(await pdfContentText(blank.bytes));
  });
});
