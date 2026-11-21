import { describe, expect, it } from "vitest";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { pdfContentText } from "./helpers/pdf-content";
import { renderFixture } from "./helpers/render";

const D5 = "DESIGN_5";

describe("DESIGN_5 Itemised Project", () => {
  it("registers with the expected metadata", () => {
    const { meta } = getInvoiceTemplate(D5);
    expect(meta).toMatchObject({ id: "DESIGN_5", title: "Itemised Project", paperSize: "A4", supportsMultiPage: true, fonts: "unicode" });
    expect(meta.defaultAccent).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("groups lines into sections with subtotals that add up to the invoice subtotal", async () => {
    const { text, vm } = await renderFixture("sectionedProject", D5);
    expect(text).toContain("Phase 1: Discovery");
    expect(text).toContain("Phase 2: Build");
    expect(text).toContain("Subtotal: Phase 1: Discovery");
    expect(text).toContain("10,000.00");
    expect(text).toContain("8,000.00");
    expect(10_000 + 8_000).toBe(vm.totals.subtotal);
    expect(text.match(/Subtotal: Phase/g)).toHaveLength(2);
  });

  it("shows per-line notes, quantities and rates", async () => {
    const { text } = await renderFixture("sectionedProject", D5);
    for (const word of ["Two-day on-site session with stakeholders", "Hourly, as per timesheet", "Development", "150.00", "40"]) {
      expect(text).toContain(word);
    }
  });

  it("shows discounts as a column and in the totals, only when there is one", async () => {
    const withDiscount = await renderFixture("sectionedProject", D5);
    expect(withDiscount.text).toContain("Discount");
    expect(withDiscount.text).toContain("-₹500.00");
    expect(withDiscount.text).toContain("₹18,500.00");
    const without = await renderFixture("basic", D5);
    expect(without.text).not.toContain("Discount");
  });

  it("shows the project and the grand total", async () => {
    const { text } = await renderFixture("sectionedProject", D5);
    expect(text).toContain("Customer portal, Q2 2026");
    expect(text).toContain("₹21,240.00");
    expect(text).toContain("CGST");
  });

  it("renders edge invoices", async () => {
    expect((await renderFixture("emptyLines", D5)).text).toContain("No items on this invoice");
    expect((await renderFixture("zeroTotal", D5)).text).toContain("₹0.00");
    expect((await renderFixture("devanagariClient", D5)).pages).toHaveLength(1);
    expect((await renderFixture("taxExemptExport", D5)).text).not.toContain("₹");
    const many = await renderFixture("manyLines", D5);
    expect(many.pages.length).toBeGreaterThan(2);
    many.pages.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${many.pages.length}`));
    expect(many.pages[many.pages.length - 1]).toMatch(/Line item \d+/);
  });

  it("stamps paid and partly paid invoices", async () => {
    const paid = await renderFixture("paidWithLink", D5);
    expect(paid.text).toContain("PAID");
    expect(paid.text).toMatch(/30 Apr 2026/);
    const partial = await renderFixture("partialWithBalance", D5);
    expect(partial.text).toContain("PARTIALLY PAID");
    expect(partial.text).toContain("₹14,880.00");
  });

  it("follows the accent colour chain", async () => {
    const [base, invoice, client] = await Promise.all(["gstIntra", "accentInvoice", "accentClient"].map((k) => renderFixture(k, D5)));
    const [a, b, c] = await Promise.all([base, invoice, client].map((r) => pdfContentText(r.bytes)));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
