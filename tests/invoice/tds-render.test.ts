import { describe, expect, it } from "vitest";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { renderFixture } from "./helpers/render";

const vmOf = (key: string) => buildInvoiceViewModel(SAMPLE_INVOICES[key]);

describe("view model TDS", () => {
  it("carries the expected TDS and the net payable", () => {
    const vm = vmOf("tdsInvoice");
    expect(vm.tds).toMatchObject({ section: "194J", ratePercent: 10, amount: 1600 });
    expect(vm.totals.total).toBe(18880);
    expect(vm.netPayable).toBe(17280);
    expect(vm.payment).toMatchObject({ kind: "NONE", amountPaid: 0, balanceDue: 17280 });
  });

  it("has no TDS and a net payable equal to the total otherwise", () => {
    const vm = vmOf("basic");
    expect(vm.tds).toBeNull();
    expect(vm.netPayable).toBe(vm.totals.total);
  });

  it("treats a PAID invoice as settled at the net amount", () => {
    const vm = vmOf("tdsPaid");
    expect(vm.payment).toMatchObject({ kind: "PAID", amountPaid: 17280, balanceDue: 0 });
  });

  it("ignores TDS on an export and on a zero amount", () => {
    expect(vmOf("tdsOnExport").tds).toBeNull();
    const zero = buildInvoiceViewModel({ ...SAMPLE_INVOICES.zeroTotal, tds: { ratePercent: 10, amount: 0 } });
    expect(zero.tds).toBeNull();
    expect(zero.netPayable).toBe(0);
  });
});

describe.each(["DESIGN_3", "DESIGN_4", "DESIGN_5"])("%s shows TDS", (design) => {
  it("prints the TDS row, the net payable and the supplier PAN", async () => {
    const { text } = await renderFixture("tdsInvoice", design);
    for (const word of ["Less: TDS @ 10% (Sec 194J)", "-₹1,600.00", "Net payable", "₹17,280.00", "Our PAN: ABCDE1234F"]) expect(text).toContain(word);
  });

  it("leaves invoices without TDS unchanged", async () => {
    const { text } = await renderFixture("basic", design);
    expect(text).not.toContain("Net payable");
    expect(text).not.toContain("TDS");
  });

  it("shows no TDS on an export", async () => {
    const { text } = await renderFixture("tdsOnExport", design);
    expect(text).not.toContain("TDS");
  });
});

describe("Pay-Fast with TDS", () => {
  it("shows the net amount as the amount due and in the QR panel", async () => {
    const { text } = await renderFixture("tdsInvoiceWithLink", "DESIGN_4");
    expect((text.match(/₹17,280\.00/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("SCAN TO PAY");
    expect(text).not.toMatch(/AMOUNT DUE\s*₹18,880\.00/);
  });
});
