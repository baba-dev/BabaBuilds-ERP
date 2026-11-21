import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildInvoiceViewModel, type InvoiceLineView } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { embedUnicodeFonts } from "@/lib/invoice-templates/shared/fonts";
import { createPaginator } from "@/lib/invoice-templates/shared/paginator";
import { drawLineTable, measureLineRow, type TableColumn } from "@/lib/invoice-templates/shared/table";
import { buildAccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { extractPdfText, extractTextItems } from "./helpers/pdf-text";

const tokens = buildAccentTokens("#0B3D91");
const COLUMNS: TableColumn[] = [
  { key: "description", header: "Description", width: 240, align: "left" },
  { key: "sac", header: "HSN/SAC", width: 60, align: "left" },
  { key: "qty", header: "Qty", width: 40, align: "right" },
  { key: "rate", header: "Rate", width: 70, align: "right" },
  { key: "taxRate", header: "Tax", width: 45, align: "right" },
  { key: "amount", header: "Amount", width: 60, align: "right" },
];
const X = 40;
const DESC_RIGHT = X + 240;

const run = async (lines: InvoiceLineView[], opts: { reserveBottom?: number; startYFromTop?: number; sectionSubtotals?: boolean } = {}) => {
  const doc = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(doc);
  const paginator = createPaginator(doc, { paperSize: "A4" });
  const result = drawLineTable({
    paginator,
    fonts,
    tokens,
    lines,
    columns: COLUMNS,
    x: X,
    startYFromTop: opts.startYFromTop ?? 200,
    locale: "en-IN",
    emptyLabel: "No items on this invoice",
    continuationTopY: 60,
    reserveBottom: opts.reserveBottom,
    sectionSubtotals: opts.sectionSubtotals,
  });
  const bytes = await doc.save();
  return { doc, fonts, paginator, result, bytes, pages: await extractPdfText(bytes) };
};

const linesOf = (key: string) => buildInvoiceViewModel(SAMPLE_INVOICES[key]).lines;

const line = (over: Partial<InvoiceLineView>): InvoiceLineView => ({
  description: "Item", note: null, quantity: 1, quantityFormatted: "1", unitPrice: 100, unitPriceFormatted: "100.00", discountAmount: 0,
  taxRatePercent: 18, sacCode: null, amount: 100, amountFormatted: "100.00", section: null, ...over,
});

describe("drawLineTable", () => {
  it("draws the header and every row on one page and returns where it ended", async () => {
    const { pages, result, paginator } = await run(linesOf("mixedRates"));
    expect(paginator.pageCount()).toBe(1);
    expect(result.yFromTop).toBeGreaterThan(200);
    for (const word of ["Description", "HSN/SAC", "Amount", "Consulting", "Printed manuals", "Courier", "Workshop", "100.01"]) {
      expect(pages[0]).toContain(word);
    }
  });

  it("paginates 200 lines and repeats the header on every page", async () => {
    const { pages, paginator } = await run(linesOf("manyLines"));
    expect(paginator.pageCount()).toBeGreaterThan(2);
    for (const text of pages) {
      expect(text).toContain("Description");
      expect(text).toMatch(/Line item \d+/);
    }
    expect(pages.join(" ")).toContain("Line item 200");
  });

  it("keeps an unbreakable URL inside the description column", async () => {
    const { bytes } = await run(linesOf("manyLines").slice(0, 6));
    const [items] = await extractTextItems(bytes);
    const urlParts = items.filter((i) => /example\.com|segments|naturally|0123456789/.test(i.str));
    expect(urlParts.length).toBeGreaterThan(0);
    for (const part of urlParts) expect(part.x + part.width).toBeLessThanOrEqual(DESC_RIGHT + 0.5);
  });

  it("measures a wrapped long description as taller than a short one, and always finite", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    const short = measureLineRow(fonts, COLUMNS, line({ description: "Short" }));
    const long = measureLineRow(fonts, COLUMNS, line({ description: "word ".repeat(120) }));
    const noSpaces = measureLineRow(fonts, COLUMNS, line({ description: "x".repeat(400) }));
    expect(long).toBeGreaterThan(short);
    expect(Number.isFinite(noSpaces)).toBe(true);
    expect(noSpaces).toBeGreaterThan(short);
  });

  it("never leaves the totals area alone on a page: the last row moves with the reserved space", async () => {
    const lines = linesOf("gstIntra");
    const { pages, paginator } = await run(lines, { startYFromTop: 500, reserveBottom: 400 });
    expect(paginator.pageCount()).toBe(2);
    expect(pages[0]).toContain(lines[0].description);
    expect(pages[0]).not.toContain(lines[1].description);
    expect(pages[1]).toContain(lines[1].description);
  });

  it("shows the empty label for an invoice with no lines", async () => {
    const { pages, result } = await run([]);
    expect(pages[0]).toContain("No items on this invoice");
    expect(pages[0]).toContain("Description");
    expect(result.yFromTop).toBeGreaterThan(200);
  });

  it("shows section headings and subtotals", async () => {
    const lines = [
      line({ description: "Design", section: "Phase 1", amount: 100, amountFormatted: "100.00" }),
      line({ description: "Build", section: "Phase 1", amount: 250.5, amountFormatted: "250.50" }),
      line({ description: "Launch", section: "Phase 2", amount: 75, amountFormatted: "75.00" }),
    ];
    const { pages } = await run(lines, { sectionSubtotals: true });
    expect(pages[0]).toContain("Phase 1");
    expect(pages[0]).toContain("Phase 2");
    expect(pages[0]).toContain("350.50");
    expect(pages[0]).toContain("Subtotal");
  });

  it("includes line notes under the description", async () => {
    const { pages } = await run(linesOf("gstIntra"));
    expect(pages[0]).toContain("Discovery, configuration and training");
  });
});
