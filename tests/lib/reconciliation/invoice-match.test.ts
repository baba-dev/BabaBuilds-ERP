import { describe, expect, it } from "vitest";
import { rankInvoiceMatchesForCredit } from "@/lib/reconciliation/invoice-match";
import type { Invoice } from "@prisma/client";

function inv(partial: Partial<Invoice>): Invoice {
  return {
    id: "inv1",
    workspaceId: "ws",
    invoiceNumber: partial.invoiceNumber ?? "INV-001",
    financialYear: "2024-25",
    billingMonth: "April",
    invoiceDate: partial.invoiceDate ?? new Date("2024-01-01"),
    dueDate: partial.dueDate ?? new Date("2024-01-31"),
    expectedPaymentDate: partial.expectedPaymentDate ?? null,
    collectionRiskScore: null,
    lastReminderSentAt: null,
    followUpStatus: null,
    clientName: partial.clientName ?? "Acme Corp",
    sacCode: null,
    serviceDescription: "Services",
    subtotal: partial.subtotal ?? { toString: () => "1000" } as never,
    taxRate: 0,
    taxAmount: partial.taxAmount ?? { toString: () => "0" } as never,
    grandTotal: partial.grandTotal ?? { toString: () => "1180" } as never,
    taxMode: "exempt",
    totalAmount: partial.totalAmount ?? { toString: () => "1180" } as never,
    pdfPath: "/tmp/x.pdf",
    createdAt: new Date(),
    status: partial.status ?? "PENDING",
    amountReceived: partial.amountReceived ?? null,
    dateReceived: null,
    withholdingRatePercent: null,
    withholdingAmount: null,
    withholdingDeductedAt: null,
    withholdingDepositedAt: null,
    withholdingDepositDueAt: null,
    withholdingReminderSentAt: null,
    providerGateway: null,
    providerPaymentLinkId: null,
    clientId: null,
    sourceProposalId: null,
  } as Invoice;
}

describe("rankInvoiceMatchesForCredit", () => {
  it("prefers invoice number in narration with amount match", () => {
    const invoices = [
      inv({
        invoiceNumber: "INV-42",
        grandTotal: { toString: () => "5000" } as never,
        totalAmount: { toString: () => "5000" } as never,
        amountReceived: null,
      }),
      inv({
        id: "inv2",
        invoiceNumber: "INV-99",
        grandTotal: { toString: () => "5000" } as never,
        totalAmount: { toString: () => "5000" } as never,
        amountReceived: null,
      }),
    ];
    const ranked = rankInvoiceMatchesForCredit({
      invoices,
      amount: 5000,
      bankDate: new Date("2024-01-15"),
      narration: "NEFT PAYMENT INV-42 CLIENT",
    });
    expect(ranked[0]?.invoice.invoiceNumber).toBe("INV-42");
    expect(ranked[0]?.reasons).toContain("invoice_number_in_narration");
  });

  it("filters out PAID invoices", () => {
    const invoices = [
      inv({
        status: "PAID",
        grandTotal: { toString: () => "100" } as never,
        totalAmount: { toString: () => "100" } as never,
        amountReceived: { toString: () => "100" } as never,
      }),
    ];
    const ranked = rankInvoiceMatchesForCredit({
      invoices,
      amount: 100,
      bankDate: new Date(),
      narration: "test",
    });
    expect(ranked.length).toBe(0);
  });
});
