import { describe, expect, it } from "vitest";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { pdfContentText } from "./helpers/pdf-content";
import { renderFixture } from "./helpers/render";

const D6 = "DESIGN_6";

describe("DESIGN_6 Statement", () => {
  it("registers with the expected metadata", () => {
    const { meta } = getInvoiceTemplate(D6);
    expect(meta).toMatchObject({ id: "DESIGN_6", title: "Statement", paperSize: "A4", supportsMultiPage: true, fonts: "unicode" });
    expect(meta.defaultAccent).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("summarises previous balance, payments, credits and the amount due now", async () => {
    const { text } = await renderFixture("statementInvoice", D6);
    for (const word of ["STATEMENT", "AMOUNT DUE NOW", "₹22,380.00", "PREVIOUS BALANCE", "₹3,500.00", "PAYMENTS RECEIVED", "₹3,000.00", "CREDITS APPLIED", "₹500.00", "This invoice", "₹18,880.00"]) {
      expect(text).toContain(word);
    }
  });

  it("lists the open items, the payment and the credit note", async () => {
    const { text } = await renderFixture("statementInvoice", D6);
    for (const word of ["Open items", "INV/26-27/009", "INV/26-27/011", "₹2,000.00", "₹1,500.00", "UTR-4421", "CN/26-27/001", "Payments and credits"]) {
      expect(text).toContain(word);
    }
  });

  it("shows a clean first invoice with no history", async () => {
    const { text } = await renderFixture("statementFirst", D6);
    expect(text).toContain("No previous balance");
    expect(text).not.toContain("Open items");
    expect(text).toContain("₹18,880.00");
  });

  it("caps the open items and says how many are not listed", async () => {
    const { text } = await renderFixture("statementManyOpen", D6);
    expect(text).toContain("And 4 more");
    expect(text).toContain("₹30,880.00");
    expect(text).toContain("INV/26-27/008");
    expect(text).not.toContain("INV/26-27/009");
  });

  it("falls back to a plain invoice when no statement data was supplied", async () => {
    const { text } = await renderFixture("gstIntra", D6);
    expect(text).toContain("No previous balance");
    expect(text).toContain("₹18,880.00");
  });

  it("owes only the previous balance when this invoice is already paid", async () => {
    const { text } = await renderFixture("statementPaid", D6);
    expect(text).toContain("PAID");
    expect(text).toMatch(/30 Apr 2026/);
    expect(text).toMatch(/AMOUNT DUE NOW\s*₹3,500\.00/);
  });

  it("uses the net payable when the invoice has TDS", async () => {
    const { text } = await renderFixture("tdsInvoice", D6);
    expect(text).toContain("Net payable");
    expect(text).toContain("₹17,280.00");
  });

  it("renders edge invoices", async () => {
    expect((await renderFixture("emptyLines", D6)).text).toContain("No items on this invoice");
    expect((await renderFixture("zeroTotal", D6)).text).toContain("₹0.00");
    expect((await renderFixture("devanagariClient", D6)).pages.length).toBeGreaterThanOrEqual(1);
    expect((await renderFixture("taxExemptExport", D6)).text).not.toContain("₹");
    const many = await renderFixture("manyLines", D6);
    expect(many.pages.length).toBeGreaterThan(2);
    many.pages.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${many.pages.length}`));
    expect(many.pages[many.pages.length - 1]).toMatch(/Line item \d+/);
  });

  it("stamps partly paid invoices", async () => {
    const { text } = await renderFixture("partialWithBalance", D6);
    expect(text).toContain("PARTIALLY PAID");
  });

  it("follows the accent colour chain", async () => {
    const [base, invoice, client] = await Promise.all(["gstIntra", "accentInvoice", "accentClient"].map((k) => renderFixture(k, D6)));
    const [a, b, c] = await Promise.all([base, invoice, client].map((r) => pdfContentText(r.bytes)));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
