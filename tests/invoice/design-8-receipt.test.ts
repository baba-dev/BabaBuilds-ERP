import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { countRects } from "./helpers/pdf-content";
import { pdfLinkUrls } from "./helpers/pdf-links";
import { extractTextItems } from "./helpers/pdf-text";
import { renderFixture } from "./helpers/render";

const D8 = "DESIGN_8";
const sizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getSize());

describe("DESIGN_8 Receipt", () => {
  it("registers as an 80mm thermal design", () => {
    const { meta } = getInvoiceTemplate(D8);
    expect(meta).toMatchObject({ id: "DESIGN_8", title: "Receipt", paperSize: "THERMAL_80MM", supportsMultiPage: true, fonts: "unicode" });
  });

  it("is 80mm wide and cropped to its content", async () => {
    const { bytes } = await renderFixture("gstIntra", D8);
    const [size] = await sizes(bytes);
    expect(size.width).toBeCloseTo(226.77, 1);
    expect(size.height).toBeLessThan(900);
    expect(size.height).toBeGreaterThan(250);
  });

  it("shows the business, the items, the totals and the total", async () => {
    const { text } = await renderFixture("gstIntra", D8);
    for (const word of ["BabaBuilds ERP Services Pvt Ltd", "TAX INVOICE", "INV/26-27/001", "Acme Industries", "ERP implementation", "2 × 2,500.00", "Annual support", "CGST", "SGST", "Total", "₹18,880.00"]) {
      expect(text).toContain(word);
    }
  });

  it("keeps all text inside the page, over many pages, with only the last page cropped", async () => {
    const { bytes } = await renderFixture("manyLines", D8);
    const pageSizes = await sizes(bytes);
    const items = await extractTextItems(bytes);
    expect(pageSizes.length).toBeGreaterThan(2);
    expect(pageSizes[0].height).toBe(1000);
    expect(pageSizes[pageSizes.length - 1].height).toBeLessThanOrEqual(1000);
    items.forEach((pageItems, i) => {
      // A cropped page keeps its drawing coordinates and shows only the top part, so measure from the visible bottom.
      const bottom = 1000 - pageSizes[i].height;
      for (const it of pageItems) {
        expect(it.y - bottom, `page ${i + 1} ${it.str}`).toBeGreaterThanOrEqual(0);
        expect(it.y - bottom, `page ${i + 1} ${it.str}`).toBeLessThanOrEqual(pageSizes[i].height);
        expect(it.x + it.width, `page ${i + 1} ${it.str}`).toBeLessThanOrEqual(pageSizes[i].width);
      }
    });
  }, 60_000);

  it("shows a compact PAID line with the date, and never a QR on a paid receipt", async () => {
    const paid = await renderFixture("paidWithLink", D8);
    expect(paid.text).toContain("PAID");
    expect(paid.text).toMatch(/30 Apr 2026/);
    expect(paid.text).not.toContain("Scan to pay");
    const noLink = await renderFixture("paidWithLink", D8, { paymentLink: null });
    expect(await countRects(paid.bytes)).toBe(await countRects(noLink.bytes));
  });

  it("puts a small QR at the end of an unpaid receipt, with the net amount and a link", async () => {
    const withLink = await renderFixture("tdsInvoiceWithLink", D8);
    expect(withLink.text).toContain("Scan to pay ₹17,280.00");
    expect(await pdfLinkUrls(withLink.bytes)).toContain("https://rzp.io/i/tds123");
    const withoutLink = await renderFixture("tdsInvoiceWithLink", D8, { paymentLink: null });
    expect((await countRects(withLink.bytes)) - (await countRects(withoutLink.bytes))).toBeGreaterThan(20);
    expect(withLink.text.lastIndexOf("Scan to pay")).toBeGreaterThan(withLink.text.indexOf("Net payable"));
  });

  it("has no QR and no crash without a payment link, or for a zero total", async () => {
    expect((await renderFixture("gstIntra", D8)).text).not.toContain("Scan to pay");
    expect((await renderFixture("zeroTotal", D8, { paymentLink: "https://rzp.io/i/zero" })).text).not.toContain("Scan to pay");
  });

  it("shows TDS and the net payable", async () => {
    const { text } = await renderFixture("tdsInvoice", D8);
    for (const word of ["Less: TDS @ 10% (Sec 194J)", "Net payable", "₹17,280.00"]) expect(text).toContain(word);
  });

  it("shows the balance on a partly paid receipt", async () => {
    const { text } = await renderFixture("partialWithBalance", D8);
    expect(text).toContain("PARTIALLY PAID");
    expect(text).toContain("₹14,880.00");
  });

  it("renders edge invoices", async () => {
    expect((await renderFixture("emptyLines", D8)).text).toContain("No items");
    expect((await renderFixture("devanagariClient", D8)).pages.length).toBeGreaterThanOrEqual(1);
    expect((await renderFixture("taxExemptExport", D8)).text).not.toContain("₹");
  });
});
