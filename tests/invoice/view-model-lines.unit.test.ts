import { describe, expect, it } from "vitest";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

const vmOf = (key: string) => buildInvoiceViewModel(SAMPLE_INVOICES[key]);

describe("view model lines", () => {
  it("derives lines from services when none are given", () => {
    const vm = vmOf("basic");
    expect(vm.lines).toHaveLength(2);
    expect(vm.lines[0]).toMatchObject({
      description: "Engineering Service #1",
      note: "Monthly scope",
      quantity: 1,
      unitPrice: 5000,
      amount: 5000,
      amountFormatted: "5,000.00",
      taxRatePercent: 18,
      discountAmount: 0,
      section: null,
    });
  });

  it("passes explicit lines through with formatted quantity and price", () => {
    const vm = vmOf("gstIntra");
    expect(vm.lines[0]).toMatchObject({ quantity: 2, quantityFormatted: "2", unitPriceFormatted: "2,500.00", sacCode: "998313", taxRatePercent: 18 });
    expect(vm.lines[1].discountAmount).toBe(1000);
  });

  it("has no lines for an empty invoice", () => {
    expect(vmOf("emptyLines").lines).toEqual([]);
  });
});

describe("view model GST", () => {
  it("classifies each fixture", () => {
    expect(vmOf("gstIntra").gst.kind).toBe("INTRA");
    expect(vmOf("gstInter").gst.kind).toBe("INTER");
    expect(vmOf("taxExemptExport").gst.kind).toBe("EXPORT");
    expect(vmOf("basic").gst.kind).toBe("NONE");
  });

  it("keeps the rate rows equal to the invoice tax", () => {
    const vm = vmOf("mixedRates");
    expect(vm.gst.rows.length).toBe(3);
    expect(Math.round(vm.gst.rows.reduce((s, r) => s + r.total, 0) * 100)).toBe(Math.round(vm.totals.taxAmount * 100));
  });
});

describe("view model accent candidates", () => {
  it("normalises invoice, client and workspace colours and nulls junk", () => {
    expect(vmOf("accentInvoice").accentCandidates).toEqual({ invoice: "#0B5FFF", client: null, workspace: null });
    expect(vmOf("accentClient").accentCandidates).toEqual({ invoice: null, client: "#B45309", workspace: null });
    expect(vmOf("basic").accentCandidates).toEqual({ invoice: null, client: null, workspace: null });
    const junk = buildInvoiceViewModel({ ...SAMPLE_INVOICES.basic, accentColor: "red" });
    expect(junk.accentCandidates.invoice).toBeNull();
  });
});

describe("view model payment state", () => {
  it("is NONE for a pending invoice with the whole total outstanding", () => {
    const vm = vmOf("basic");
    expect(vm.payment).toEqual({ kind: "NONE", paidOn: null, amountPaid: 0, balanceDue: vm.totals.total });
  });

  it("is PAID with nothing outstanding", () => {
    const vm = vmOf("paidWithLink");
    expect(vm.payment.kind).toBe("PAID");
    expect(vm.payment.amountPaid).toBe(vm.totals.total);
    expect(vm.payment.balanceDue).toBe(0);
    expect(vm.payment.paidOn?.toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("is PARTIAL with the balance due", () => {
    const vm = vmOf("partialWithBalance");
    expect(vm.payment.kind).toBe("PARTIAL");
    expect(vm.payment.amountPaid).toBe(4000);
    expect(vm.payment.balanceDue).toBeCloseTo(vm.totals.total - 4000, 2);
  });

  it("treats an unknown partial amount as nothing paid yet", () => {
    const vm = vmOf("partiallyPaid");
    expect(vm.payment.kind).toBe("PARTIAL");
    expect(vm.payment.amountPaid).toBe(0);
  });
});

describe("view model words and QR sources", () => {
  it("writes INR totals in words and skips other currencies", () => {
    expect(vmOf("basic").amountInWords).toMatch(/^Rupees .* Only$/);
    expect(vmOf("taxExemptExport").amountInWords).toBeNull();
  });

  it("lists the payment link as a QR source only when present", () => {
    expect(vmOf("basic").paymentQrs).toEqual([]);
    expect(vmOf("paidWithLink").paymentQrs).toEqual([{ kind: "PAYMENT_LINK", url: "https://rzp.io/i/paid123", label: "Pay online" }]);
  });
});
