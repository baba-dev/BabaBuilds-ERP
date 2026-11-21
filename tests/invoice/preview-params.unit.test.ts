import { describe, expect, it } from "vitest";

import { buildInvoiceViewModel, type PDFParams } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { applyPreviewOverrides, mapInvoiceToParams, type PreviewInvoiceRow } from "@/lib/invoice/preview-params";

const profile = SAMPLE_INVOICES.basic.profile;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const row = (over: Partial<PreviewInvoiceRow> = {}): PreviewInvoiceRow => ({
  id: "inv1",
  invoiceNumber: "INV/26-27/007",
  invoiceDate: d("2026-04-27"),
  dueDate: d("2026-05-04"),
  billingMonth: "April 2026",
  clientName: "Acme Industries",
  sacCode: "998313",
  status: "PENDING",
  currency: "INR",
  subtotal: 16000,
  taxRate: 0.18,
  taxAmount: 2880,
  total: 18880,
  taxMode: "taxable",
  gstPlaceOfSupply: "29",
  gstReverseCharge: false,
  gstSupplyOverride: null,
  irn: null,
  irnAckNo: null,
  irnAckDate: null,
  accentColor: null,
  tdsSection: null,
  tdsRatePercent: null,
  tdsAmount: null,
  items: [
    { description: "ERP implementation", quantity: 2, unitPrice: 2500, taxRate: 0.18, sacCode: "998313", totalAmount: 5000 },
    { description: "Annual support", quantity: 1, unitPrice: 11000, taxRate: 0.18, sacCode: "998313", totalAmount: 11000 },
  ],
  payments: [],
  client: { name: "Acme Industries", address: "12 MG Road, Bengaluru", country: "IN", email: "ap@acme.com", taxId: "27AAAAA0000A1Z5", isExport: false, logoUrl: null, invoiceAccentColor: null, gstStateCode: "29" },
  ...over,
});

const map = (r: PreviewInvoiceRow, extras: Partial<Parameters<typeof mapInvoiceToParams>[1]> = {}) => mapInvoiceToParams(r, { profile, ...extras });

describe("mapInvoiceToParams", () => {
  it("maps identity, dates, totals and lines", () => {
    const p = map(row());
    expect(p).toMatchObject({ invoiceNumber: "INV/26-27/007", billingMonth: "April 2026", baseCurrency: "INR", userLocale: "en-IN" });
    expect(p.totals).toMatchObject({ subtotal: 16000, taxAmount: 2880, total: 18880, taxMode: "taxable" });
    expect(p.formattedTotal).toBe("18,880.00");
    expect(p.lines).toHaveLength(2);
    expect(p.lines?.[0]).toMatchObject({ description: "ERP implementation", quantity: 2, unitPrice: 2500, amount: 5000, taxRate: 0.18, sacCode: "998313" });
    expect(p.services[0]).toMatchObject({ title: "ERP implementation", amount: 5000 });
  });

  it("renders through the real view model with the stored GST treatment", () => {
    const vm = buildInvoiceViewModel(map(row()));
    expect(vm.gst.kind).toBe("INTRA");
    expect(vm.totals.total).toBe(18880);
    expect(vm.lines).toHaveLength(2);
  });

  it("carries the stored accent, TDS, IRN and reverse charge", () => {
    const p = map(row({ accentColor: "#0B5FFF", tdsSection: "194J", tdsRatePercent: 10, tdsAmount: 1600, irn: "abc", irnAckNo: "9", irnAckDate: d("2026-04-27"), gstReverseCharge: true }));
    expect(p.accentColor).toBe("#0B5FFF");
    expect(p.tds).toEqual({ section: "194J", ratePercent: 10, amount: 1600 });
    expect(p.gst).toMatchObject({ placeOfSupply: "29", reverseCharge: true, irn: "abc", irnAckNo: "9" });
    expect(buildInvoiceViewModel(p).netPayable).toBe(17280);
  });

  it("derives paid and partly paid state from live payments", () => {
    const paid = map(row({ status: "PAID", payments: [{ amount: 18880, receivedAt: d("2026-04-30"), reversedAt: null }] }));
    const vmPaid = buildInvoiceViewModel(paid);
    expect(vmPaid.payment).toMatchObject({ kind: "PAID", amountPaid: 18880, balanceDue: 0 });
    expect(vmPaid.payment.paidOn?.toISOString().slice(0, 10)).toBe("2026-04-30");
    const partial = map(row({ status: "PARTIALLY_PAID", payments: [{ amount: 4000, receivedAt: d("2026-04-30"), reversedAt: null }, { amount: 999, receivedAt: d("2026-05-01"), reversedAt: d("2026-05-02") }] }));
    expect(buildInvoiceViewModel(partial).payment).toMatchObject({ kind: "PARTIAL", amountPaid: 4000, balanceDue: 14880 });
  });

  it("treats a percent-style item rate as a percent, and detects mixed rates", () => {
    const p = map(row({ items: [{ description: "A", quantity: 1, unitPrice: 100, taxRate: 18, sacCode: null, totalAmount: 100 }, { description: "B", quantity: 1, unitPrice: 100, taxRate: 5, sacCode: null, totalAmount: 100 }], subtotal: 200, taxAmount: 23, total: 223 }));
    expect(p.lines?.map((l) => l.taxRate)).toEqual([0.18, 0.05]);
    expect(p.totals.taxMode).toBe("mixed");
  });

  it("copes with a deleted client, no items, a foreign currency and a missing due date", () => {
    const noClient = map(row({ client: null }));
    expect(noClient.client.name).toBe("Acme Industries");
    expect(noClient.client.address).toBe("");
    const empty = map(row({ items: [], subtotal: 0, taxAmount: 0, total: 0 }));
    expect(empty.lines).toEqual([]);
    const usd = map(row({ currency: "USD" }));
    expect(usd).toMatchObject({ baseCurrency: "USD", userLocale: "en-US" });
    const noDue = map(row({ dueDate: null }));
    expect(noDue.dueDate.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("never carries a payment link, and passes UPI, QR images and the statement through", () => {
    const p = map(row(), { upi: { vpa: "shop@okhdfc", payeeName: null }, staticQrs: [{ label: "Paytm", imagePath: "/payment-qr/w/p.png" }] });
    expect(p.paymentLink ?? null).toBeNull();
    expect(p.upi).toEqual({ vpa: "shop@okhdfc", payeeName: null });
    expect(p.staticQrs).toHaveLength(1);
  });
});

describe("applyPreviewOverrides", () => {
  const base = (): PDFParams => map(row());

  it("sets the design", () => {
    expect(applyPreviewOverrides(base(), { design: "DESIGN_4" }).templateId).toBe("DESIGN_4");
  });

  it("accepts a valid accent and ignores junk", () => {
    expect(applyPreviewOverrides(base(), { design: "DESIGN_3", accent: "#0b5fff" }).accentColor).toBe("#0B5FFF");
    for (const bad of ["red", "#GGGGGG", "javascript:1", "", null, 5, {}, "x".repeat(500)]) {
      expect(applyPreviewOverrides(map(row({ accentColor: "#111111" })), { design: "DESIGN_3", accent: bad }).accentColor, String(bad)).toBe("#111111");
    }
  });

  it("computes TDS on the pre-GST subtotal and clamps the rate", () => {
    const p = applyPreviewOverrides(base(), { design: "DESIGN_3", tdsRatePercent: "10", tdsSection: "194j" });
    expect(p.tds).toEqual({ section: "194J", ratePercent: 10, amount: 1600 });
    const lower = applyPreviewOverrides(base(), { design: "DESIGN_3", tdsRatePercent: 10, tdsSection: " 194J " });
    expect(lower.tds?.section).toBe("194J");
    expect(applyPreviewOverrides(base(), { design: "DESIGN_3", tdsRatePercent: 500 }).tds?.ratePercent).toBe(100);
  });

  it("turns TDS off for zero, junk or an export, and keeps the stored TDS when not asked", () => {
    const stored = map(row({ tdsSection: "194J", tdsRatePercent: 10, tdsAmount: 1600 }));
    expect(applyPreviewOverrides(stored, { design: "DESIGN_3" }).tds).toEqual({ section: "194J", ratePercent: 10, amount: 1600 });
    for (const off of [0, "0", "", "abc", -5, Number.NaN]) {
      expect(applyPreviewOverrides(stored, { design: "DESIGN_3", tdsRatePercent: off as number }).tds ?? null, String(off)).toBeNull();
    }
    const exportInvoice = map(row({ client: { ...row().client!, isExport: true } }));
    expect(applyPreviewOverrides(exportInvoice, { design: "DESIGN_3", tdsRatePercent: 10 }).tds ?? null).toBeNull();
  });

  it("does not change the input", () => {
    const input = base();
    const copy = JSON.stringify(input);
    applyPreviewOverrides(input, { design: "DESIGN_5", accent: "#0B5FFF", tdsRatePercent: 10 });
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("mapInvoiceToParams with no line items", () => {
  it("shows the total as a single line and a matching subtotal", () => {
    const p = mapInvoiceToParams(row({ items: [], subtotal: 0, taxAmount: 0, total: 15000, taxRate: 0, billingMonth: "November 2026" }), { profile });
    expect(p.lines).toHaveLength(1);
    expect(p.lines?.[0]).toMatchObject({ quantity: 1, unitPrice: 15000, amount: 15000 });
    expect(p.totals.subtotal).toBe(15000);
    expect(p.services[0].title).toContain("November 2026");
  });
});
