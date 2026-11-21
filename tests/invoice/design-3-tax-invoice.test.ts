import { describe, expect, it } from "vitest";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { pdfContentText } from "./helpers/pdf-content";
import { renderFixture } from "./helpers/render";

const D3 = "DESIGN_3";
const squash = (s: string) => s.replace(/\s+/g, "");

describe("DESIGN_3 Tax Invoice", () => {
  it("registers with the expected metadata", () => {
    const { meta } = getInvoiceTemplate(D3);
    expect(meta).toMatchObject({ id: "DESIGN_3", title: "Tax Invoice", paperSize: "A4", supportsMultiPage: true, fonts: "unicode" });
    expect(meta.defaultAccent).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("shows the intra-state GST layout", async () => {
    const { text } = await renderFixture("gstIntra", D3);
    for (const word of ["TAX INVOICE", "INV/26-27/001", "HSN/SAC", "CGST", "SGST", "Karnataka", "Rupees", "29ABCDE1234F1Z9", "Acme Industries", "₹"]) {
      expect(text).toContain(word);
    }
    expect(text).not.toContain("IGST");
  });

  it("shows IGST, place of supply and the IRN details for an inter-state invoice", async () => {
    const { text } = await renderFixture("gstInter", D3);
    expect(text).toContain("IGST");
    expect(text).toContain("Maharashtra");
    expect(text).not.toContain("CGST");
    expect(squash(text)).toContain("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90");
    expect(text).toContain("112610000012345");
  });

  it("summarises tax by rate", async () => {
    const { text } = await renderFixture("mixedRates", D3);
    expect(text).toContain("Tax summary");
    for (const taxable of ["133.34", "50.03", "0.01"]) expect(text).toContain(taxable);
  });

  it("has no GST split and no rupee sign on a foreign export", async () => {
    const { text } = await renderFixture("taxExemptExport", D3);
    expect(text).toContain("EXPORT OF SERVICES");
    expect(text).not.toMatch(/CGST|SGST|IGST/);
    expect(text).not.toContain("₹");
  });

  it("renders an invoice with no lines and a zero total", async () => {
    const empty = await renderFixture("emptyLines", D3);
    expect(empty.text).toContain("No items on this invoice");
    const zero = await renderFixture("zeroTotal", D3);
    expect(zero.text).toContain("₹0.00");
    expect(zero.text).toContain("Rupees Zero Only");
  });

  it("renders Devanagari client names without throwing", async () => {
    const { pages } = await renderFixture("devanagariClient", D3);
    expect(pages).toHaveLength(1);
  });

  it("paginates 200 lines with the invoice number on every page and the totals with a row", async () => {
    const { pages } = await renderFixture("manyLines", D3);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((p, i) => {
      expect(p).toContain("INV/26-27/001");
      expect(p).toContain(`Page ${i + 1} of ${pages.length}`);
    });
    const last = pages[pages.length - 1];
    expect(last).toMatch(/Line item \d+/);
    expect(last).toContain("Total");
  });

  it("stamps PAID with the date, and PARTIALLY PAID with the balance", async () => {
    const paid = await renderFixture("paidWithLink", D3);
    expect(paid.text).toContain("PAID");
    expect(paid.text).toMatch(/30 Apr 2026/);
    const partial = await renderFixture("partialWithBalance", D3);
    expect(partial.text).toContain("PARTIALLY PAID");
    expect(partial.text).toContain("₹14,880.00");
  });

  it("follows the accent colour chain", async () => {
    const base = await renderFixture("gstIntra", D3);
    const invoice = await renderFixture("accentInvoice", D3);
    const client = await renderFixture("accentClient", D3);
    const [a, b, c] = await Promise.all([base, invoice, client].map((r) => pdfContentText(r.bytes)));
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("does not print the declarations Classic uses for unregistered suppliers", async () => {
    const { text } = await renderFixture("gstIntra", D3);
    expect(text).not.toContain("GST Exemption");
  });
});
