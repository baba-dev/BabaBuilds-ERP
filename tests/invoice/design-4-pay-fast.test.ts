import { describe, expect, it } from "vitest";

import { getInvoiceTemplate } from "@/lib/invoice-templates";
import { countRects, pdfContentText } from "./helpers/pdf-content";
import { pdfLinkUrls } from "./helpers/pdf-links";
import { renderFixture } from "./helpers/render";

const D4 = "DESIGN_4";
const squash = (s: string) => s.replace(/\s+/g, "");

describe("DESIGN_4 Pay-Fast", () => {
  it("registers with the expected metadata", () => {
    const { meta } = getInvoiceTemplate(D4);
    expect(meta).toMatchObject({ id: "DESIGN_4", title: "Pay-Fast", paperSize: "A4", supportsPaymentLink: true, supportsMultiPage: true, fonts: "unicode" });
  });

  it("shows the amount due, a QR and a clickable link for an unpaid invoice with a payment link", async () => {
    const withLink = await renderFixture("unpaidWithLink", D4);
    expect(withLink.text).toContain("SCAN TO PAY");
    expect(withLink.text).toContain("AMOUNT DUE");
    expect(withLink.text).toContain("₹18,880.00");
    expect(squash(withLink.text)).toContain("https://rzp.io/i/unpaid789");
    expect(await pdfLinkUrls(withLink.bytes)).toContain("https://rzp.io/i/unpaid789");

    const withoutLink = await renderFixture("unpaidWithLink", D4, { paymentLink: null });
    expect((await countRects(withLink.bytes)) - (await countRects(withoutLink.bytes))).toBeGreaterThan(20);
  });

  it("falls back to bank details, with no QR, when there is no payment link", async () => {
    const { text } = await renderFixture("gstIntra", D4);
    expect(text).not.toContain("SCAN TO PAY");
    expect(text).toContain("PAY BY BANK TRANSFER");
    expect(text).toContain("HDFC0001234");
  });

  it("does not repeat the bank details when the panel already shows them", async () => {
    const noLink = await renderFixture("gstIntra", D4);
    expect(noLink.text.match(/HDFC0001234/g)).toHaveLength(1);
    const withLink = await renderFixture("unpaidWithLink", D4);
    expect(withLink.text.match(/HDFC0001234/g)).toHaveLength(1);
    expect(withLink.text).toContain("BANK TRANSFER");
  });

  it("never shows a pay-now QR on a paid invoice", async () => {
    const paid = await renderFixture("paidWithLink", D4);
    expect(paid.text).toContain("Paid in full");
    expect(paid.text).toContain("PAID IN FULL");
    expect(paid.text).not.toContain("SCAN TO PAY");
    expect(await pdfLinkUrls(paid.bytes)).not.toContain("https://rzp.io/i/paid123");
    const paidNoLink = await renderFixture("paidWithLink", D4, { paymentLink: null });
    expect(await countRects(paid.bytes)).toBe(await countRects(paidNoLink.bytes));
  });

  it("shows the balance and the QR for a partly paid invoice", async () => {
    const { text } = await renderFixture("partialWithBalance", D4);
    expect(text).toContain("PARTIALLY PAID");
    expect(text).toContain("BALANCE DUE");
    expect(text).toContain("₹14,880.00");
    expect(text).toContain("SCAN TO PAY");
  });

  it("draws no QR for a zero-total invoice, even with a link", async () => {
    const { text } = await renderFixture("zeroTotal", D4, { paymentLink: "https://rzp.io/i/zero" });
    expect(text).not.toContain("SCAN TO PAY");
    expect(text).toContain("₹0.00");
    expect(text).toContain("No payment required");
    expect(text).not.toMatch(/Due 4 May 2026/);
  });

  it("keeps the QR and drops the rupee sign on a USD export with a link", async () => {
    const { text } = await renderFixture("taxExemptExport", D4);
    expect(text).toContain("SCAN TO PAY");
    expect(text).toContain("$10,100.00");
    expect(text).not.toContain("₹");
  });

  it("states the due date and terms", async () => {
    const { text } = await renderFixture("gstIntra", D4);
    expect(text).toMatch(/4 May 2026/);
    expect(text).toMatch(/net 7 days/i);
  });

  it("renders edge invoices", async () => {
    expect((await renderFixture("emptyLines", D4)).text).toContain("No items on this invoice");
    expect((await renderFixture("devanagariClient", D4)).pages).toHaveLength(1);
    const many = await renderFixture("manyLines", D4);
    expect(many.pages.length).toBeGreaterThan(2);
    many.pages.forEach((p, i) => {
      expect(p).toContain("INV/26-27/001");
      expect(p).toContain(`Page ${i + 1} of ${many.pages.length}`);
    });
    expect(many.pages[many.pages.length - 1]).toMatch(/Line item \d+/);
  });

  it("follows the accent colour chain", async () => {
    const [base, invoice, client] = await Promise.all(["gstIntra", "accentInvoice", "accentClient"].map((k) => renderFixture(k, D4)));
    const [a, b, c] = await Promise.all([base, invoice, client].map((r) => pdfContentText(r.bytes)));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
