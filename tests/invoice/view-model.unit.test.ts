import { describe, expect, it } from "vitest";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

describe("buildInvoiceViewModel", () => {
  it("keeps totals as the source of truth", () => {
    const vm = buildInvoiceViewModel(SAMPLE_INVOICES.basic);
    expect(vm.totals.total).toBe(SAMPLE_INVOICES.basic.totals.total);
    expect(vm.formattedTotal).toBe(SAMPLE_INVOICES.basic.formattedTotal);
  });

  it("marks bank details as missing when remittance is empty", () => {
    const vm = buildInvoiceViewModel(SAMPLE_INVOICES.missingBankDetails);
    expect(vm.flags.hasBankDetails).toBe(false);
    expect(vm.remittanceDisplay.bankName).toBe("Not configured");
  });

  it("normalizes status to watermark flags", () => {
    const paidVm = buildInvoiceViewModel(SAMPLE_INVOICES.paid);
    const partialVm = buildInvoiceViewModel(SAMPLE_INVOICES.partiallyPaid);
    const pendingVm = buildInvoiceViewModel(SAMPLE_INVOICES.basic);

    expect(paidVm.watermarkKind).toBe("PAID");
    expect(partialVm.watermarkKind).toBe("PARTIAL");
    expect(pendingVm.watermarkKind).toBe("NONE");
  });

  it("clamps service title display length", () => {
    const vm = buildInvoiceViewModel(SAMPLE_INVOICES.longStrings);
    expect(vm.services[0].titleClamped.length).toBeLessThanOrEqual(200);
  });
});
