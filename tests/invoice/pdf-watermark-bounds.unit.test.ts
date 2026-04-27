import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { computeWatermarkPlacement } from "@/lib/pdf/generator";

describe("computeWatermarkPlacement", () => {
  it("keeps PARTIAL watermark text within page bounds", async () => {
    const doc = await PDFDocument.create();
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const result = computeWatermarkPlacement(fontBold, pageWidth, "PARTIAL");

    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x + result.renderedWidth).toBeLessThanOrEqual(pageWidth);
  });

  it("keeps PAID watermark text within page bounds", async () => {
    const doc = await PDFDocument.create();
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const result = computeWatermarkPlacement(fontBold, pageWidth, "PAID");

    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x + result.renderedWidth).toBeLessThanOrEqual(pageWidth);
  });
});
