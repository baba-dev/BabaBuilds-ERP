import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { embedUnicodeFonts } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { drawPartyBlock } from "@/lib/invoice-templates/shared/party-blocks";
import { drawTotalsBlock, measureTotalsBlock } from "@/lib/invoice-templates/shared/totals";
import { buildAccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { extractPdfText, extractTextItems } from "./helpers/pdf-text";

const tokens = buildAccentTokens("#0B3D91");

const renderTotals = async (key: string, opts: { showGstSplit: boolean; showAmountInWords: boolean }) => {
  const vm = buildInvoiceViewModel(SAMPLE_INVOICES[key]);
  const doc = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(doc);
  const page = doc.addPage([595.28, 841.89]);
  const bottom = drawTotalsBlock({ page, fonts, tokens, vm, x: 330, yFromTop: 300, width: 225, ...opts });
  const bytes = await doc.save();
  return { vm, bottom, measured: measureTotalsBlock(vm, { fonts, width: 225, ...opts }), text: (await extractPdfText(bytes))[0] };
};

describe("drawTotalsBlock", () => {
  it("splits an intra-state invoice into CGST and SGST", async () => {
    const { text } = await renderTotals("gstIntra", { showGstSplit: true, showAmountInWords: false });
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
  });

  it("shows IGST only for an inter-state invoice", async () => {
    const { text } = await renderTotals("gstInter", { showGstSplit: true, showAmountInWords: false });
    expect(text).toContain("IGST");
    expect(text).not.toContain("CGST");
  });

  it("uses the single tax row when the split is off or the invoice has no GST breakdown", async () => {
    const off = await renderTotals("gstIntra", { showGstSplit: false, showAmountInWords: false });
    expect(off.text).not.toContain("CGST");
    expect(off.text).toContain(off.vm.taxRowLabel);
    const none = await renderTotals("basic", { showGstSplit: true, showAmountInWords: false });
    expect(none.text).toContain(none.vm.taxRowLabel);
  });

  it("has no rupee sign and no GST split on a foreign-currency export", async () => {
    const { text, vm } = await renderTotals("taxExemptExport", { showGstSplit: true, showAmountInWords: true });
    expect(text).not.toContain("₹");
    expect(text).not.toContain("GST");
    expect(text).toContain(formatMoney(vm.totals.total, vm.baseCurrency, vm.userLocale));
    expect(text).not.toContain("Rupees");
  });

  it("prints the total exactly as formatted money", async () => {
    const { text, vm } = await renderTotals("gstIntra", { showGstSplit: true, showAmountInWords: false });
    expect(text).toContain(formatMoney(vm.totals.total, vm.baseCurrency, vm.userLocale));
  });

  it("shows discounts and the amount before them", async () => {
    const { text } = await renderTotals("gstIntra", { showGstSplit: true, showAmountInWords: false });
    expect(text).toContain("Discount");
    expect(text).toContain("-₹1,000.00");
    expect(text).toContain("₹17,000.00");
  });

  it("writes the total in words only when asked and possible", async () => {
    expect((await renderTotals("gstIntra", { showGstSplit: true, showAmountInWords: true })).text).toContain("Rupees");
    expect((await renderTotals("gstIntra", { showGstSplit: true, showAmountInWords: false })).text).not.toContain("Rupees");
  });

  it("measures the same height it draws", async () => {
    for (const key of ["gstIntra", "basic", "taxExemptExport", "mixedRates"]) {
      for (const words of [true, false]) {
        const { bottom, measured } = await renderTotals(key, { showGstSplit: true, showAmountInWords: words });
        expect(bottom - 300).toBeCloseTo(measured, 1);
      }
    }
  });

  it("handles a zero-total invoice", async () => {
    const { text } = await renderTotals("zeroTotal", { showGstSplit: true, showAmountInWords: true });
    expect(text).toContain("₹0.00");
  });
});

describe("drawPartyBlock", () => {
  const render = async (name: string, lines: string[], taxId?: { label: string; value: string }) => {
    const doc = await PDFDocument.create();
    const fonts = await embedUnicodeFonts(doc);
    const page = doc.addPage([595.28, 841.89]);
    const bottom = drawPartyBlock({ page, fonts, tokens, title: "Bill to", name, lines, taxId, x: 40, yFromTop: 150, width: 200 });
    const bytes = await doc.save();
    return { bottom, text: (await extractPdfText(bytes))[0], items: (await extractTextItems(bytes))[0] };
  };

  it("prints the title, name, address and tax id", async () => {
    const { text, bottom } = await render("Acme Industries", ["42 Client Park", "Mumbai"], { label: "GSTIN", value: "27AAAAA0000A1Z5" });
    for (const word of ["BILL TO", "Acme Industries", "42 Client Park", "Mumbai", "GSTIN", "27AAAAA0000A1Z5"]) expect(text).toContain(word);
    expect(bottom).toBeGreaterThan(150);
  });

  it("wraps long names inside the block width", async () => {
    const { items, bottom } = await render("Global Conglomerate for Infrastructure Development and Advanced Manufacturing Limited", ["Level 24, Infinity Corporate Centre, Long Avenue Name, Business District, Metropolitan City, Country"]);
    for (const item of items) expect(item.x + item.width).toBeLessThanOrEqual(240 + 0.5);
    expect(bottom).toBeGreaterThan(190);
  });

  it("renders Devanagari names without throwing", async () => {
    const { text } = await render("शर्मा ट्रेडर्स", ["मुंबई"]);
    expect(text).toContain("BILL TO");
  });
});
