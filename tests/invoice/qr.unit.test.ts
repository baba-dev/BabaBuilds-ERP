import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";

import { drawQr, qrMatrix } from "@/lib/invoice-templates/shared/qr";
import { countRects, hasImage } from "./helpers/pdf-content";

const render = async (draw: (page: ReturnType<PDFDocument["addPage"]>) => void) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  draw(page);
  const bytes = await doc.save({ useObjectStreams: false });
  return { rects: await countRects(bytes), image: await hasImage(bytes) };
};

describe("qrMatrix", () => {
  it("is square and starts with the finder pattern", () => {
    const m = qrMatrix("https://rzp.io/i/abc123");
    expect(m.length).toBeGreaterThanOrEqual(21);
    for (const row of m) expect(row).toHaveLength(m.length);
    const finder = [
      "1111111",
      "1000001",
      "1011101",
      "1011101",
      "1011101",
      "1000001",
      "1111111",
    ];
    finder.forEach((expected, r) => {
      expect(m[r].slice(0, 7).map((b) => (b ? "1" : "0")).join("")).toBe(expected);
    });
  });

  it("grows for longer input", () => {
    expect(qrMatrix("https://rzp.io/i/very-long-payment-link-for-visual-wrapping-validation-example-1234567890").length).toBeGreaterThan(
      qrMatrix("https://rzp.io/i/a").length,
    );
  });

  it("returns an empty matrix instead of throwing for empty or impossible input", () => {
    expect(qrMatrix("")).toEqual([]);
    expect(qrMatrix("   ")).toEqual([]);
    expect(qrMatrix("x".repeat(10_000))).toEqual([]);
  });
});

describe("drawQr", () => {
  it("draws vector squares, not an image", async () => {
    const matrix = qrMatrix("https://rzp.io/i/abc123");
    const { rects, image } = await render((page) => drawQr(page, 300, matrix, 20, 20, 120, rgb(0, 0, 0)));
    expect(rects).toBeGreaterThan(20);
    expect(image).toBe(false);
  });

  it("merges dark runs so the PDF stays small", async () => {
    const matrix = qrMatrix("https://rzp.io/i/abc123");
    const darkModules = matrix.flat().filter(Boolean).length;
    const { rects } = await render((page) => drawQr(page, 300, matrix, 20, 20, 120, rgb(0, 0, 0)));
    expect(rects).toBeLessThan(darkModules);
  });

  it("draws nothing for an empty matrix", async () => {
    const { rects } = await render((page) => drawQr(page, 300, [], 20, 20, 120, rgb(0, 0, 0)));
    expect(rects).toBe(0);
  });
});
