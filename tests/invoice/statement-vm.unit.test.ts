import { describe, expect, it } from "vitest";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import type { StatementInput } from "@/lib/invoice/statement";

const statement: StatementInput = {
  previousBalance: 2500,
  openItems: [{ number: "INV-1", date: new Date("2026-03-10"), dueDate: null, balance: 2500 }],
  hiddenOpenItems: 0,
  payments: [{ date: new Date("2026-04-10"), amount: 300, method: "UPI", reference: "UTR9" }],
  credits: [],
  sinceDate: new Date("2026-04-01"),
};

describe("view model statement", () => {
  it("is null when no statement is given", () => {
    expect(buildInvoiceViewModel(SAMPLE_INVOICES.basic).statement).toBeNull();
  });

  it("adds the previous balance to what this invoice asks for", () => {
    const vm = buildInvoiceViewModel({ ...SAMPLE_INVOICES.basic, statement });
    expect(vm.statement?.amountDueNow).toBeCloseTo(2500 + vm.netPayable, 2);
    expect(vm.statement?.previousBalance).toBe(2500);
  });

  it("uses the net payable when the invoice has TDS", () => {
    const vm = buildInvoiceViewModel({ ...SAMPLE_INVOICES.tdsInvoice, statement });
    expect(vm.statement?.amountDueNow).toBe(2500 + 17280);
  });

  it("owes nothing now for a paid invoice with no previous balance", () => {
    const vm = buildInvoiceViewModel({ ...SAMPLE_INVOICES.paid, statement: { ...statement, previousBalance: 0, openItems: [] } });
    expect(vm.statement?.amountDueNow).toBe(0);
  });
});
