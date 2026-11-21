import { describe, expect, it } from "vitest";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { countRects, pdfContentText } from "./helpers/pdf-content";
import { pdfLinkUrls } from "./helpers/pdf-links";
import { renderFixture } from "./helpers/render";

const D7 = "DESIGN_7";

describe("DESIGN_7 Minimal Pro", () => {
  it("registers with the expected metadata", () => {
    const { meta } = getInvoiceTemplate(D7);
    expect(meta).toMatchObject({ id: "DESIGN_7", title: "Minimal Pro", paperSize: "A4", supportsMultiPage: true, fonts: "unicode" });
    expect(meta.defaultAccent).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("shows the essentials: number, dates, parties, lines, total and amount due", async () => {
    const { text } = await renderFixture("gstIntra", D7);
    for (const word of ["INVOICE", "INV/26-27/001", "27 Apr 2026", "4 May 2026", "Acme Industries", "ERP implementation", "Annual support", "CGST", "SGST", "₹18,880.00", "AMOUNT DUE", "29ABCDE1234F1Z9"]) {
      expect(text).toContain(word);
    }
  });

  it("is genuinely minimal: almost no filled shapes", async () => {
    const minimal = await renderFixture("gstIntra", D7);
    const classic = await renderFixture("gstIntra", "DESIGN_3");
    expect(await countRects(minimal.bytes)).toBeLessThanOrEqual(2);
    expect(await countRects(classic.bytes)).toBeGreaterThan(await countRects(minimal.bytes));
  });

  it("shows TDS rows and the net amount due", async () => {
    const { text } = await renderFixture("tdsInvoice", D7);
    for (const word of ["Less: TDS @ 10% (Sec 194J)", "Net payable", "₹17,280.00", "Our PAN: ABCDE1234F"]) expect(text).toContain(word);
  });

  it("offers a payment link only while there is something to pay", async () => {
    const unpaid = await renderFixture("unpaidWithLink", D7);
    expect(unpaid.text).toContain("Pay online");
    expect(await pdfLinkUrls(unpaid.bytes)).toContain("https://rzp.io/i/unpaid789");
    const paid = await renderFixture("paidWithLink", D7);
    expect(paid.text).not.toContain("Pay online");
    expect(await pdfLinkUrls(paid.bytes)).not.toContain("https://rzp.io/i/paid123");
  });

  it("stamps paid and partly paid invoices", async () => {
    const paid = await renderFixture("paidWithLink", D7);
    expect(paid.text).toContain("PAID");
    expect(paid.text).toMatch(/30 Apr 2026/);
    expect(paid.text).not.toContain("Amount due");
    const partial = await renderFixture("partialWithBalance", D7);
    expect(partial.text).toContain("PARTIALLY PAID");
    expect(partial.text).toContain("₹14,880.00");
  });

  it("renders edge invoices", async () => {
    expect((await renderFixture("emptyLines", D7)).text).toContain("No items on this invoice");
    expect((await renderFixture("zeroTotal", D7)).text).toContain("₹0.00");
    expect((await renderFixture("devanagariClient", D7)).pages).toHaveLength(1);
    expect((await renderFixture("taxExemptExport", D7)).text).not.toContain("₹");
    const many = await renderFixture("manyLines", D7);
    expect(many.pages.length).toBeGreaterThan(2);
    many.pages.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${many.pages.length}`));
    expect(many.pages[many.pages.length - 1]).toMatch(/Line item \d+/);
  });

  it("follows the accent colour chain", async () => {
    const [base, invoice, client] = await Promise.all(["gstIntra", "accentInvoice", "accentClient"].map((k) => renderFixture(k, D7)));
    const [a, b, c] = await Promise.all([base, invoice, client].map((r) => pdfContentText(r.bytes)));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
