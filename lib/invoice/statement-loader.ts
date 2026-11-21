import { prisma } from "@/lib/prisma";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { buildStatement, type StatementInput } from "@/lib/invoice/statement";

/** Loads a client's earlier invoices in the same currency and builds the statement for a new invoice dated `currentInvoiceDate`. */
export async function loadClientStatement(workspaceId: string, clientId: string, currentInvoiceDate: Date, currency: string): Promise<StatementInput> {
  const rows = await prisma.invoice.findMany({
    where: { workspaceId, clientId, currency, status: { not: "VOID" }, invoiceDate: { lt: currentInvoiceDate } },
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      grandTotal: true,
      totalAmount: true,
      status: true,
      payments: { select: { amount: true, receivedAt: true, method: true, reference: true, reversedAt: true } },
      creditNotes: { select: { creditNoteNumber: true, amount: true, taxAmount: true, issuedAt: true } },
    },
    orderBy: { invoiceDate: "asc" },
    take: 500,
  });
  return buildStatement({
    currentInvoiceDate,
    invoices: rows.map((r) => ({
      number: r.invoiceNumber,
      date: r.invoiceDate,
      dueDate: r.dueDate,
      total: effectiveTotal(r).toNumber(),
      status: r.status,
      payments: r.payments.map((p) => ({ amount: p.amount.toNumber(), receivedAt: p.receivedAt, method: p.method, reference: p.reference, reversedAt: p.reversedAt })),
      creditNotes: r.creditNotes.map((c) => ({ number: c.creditNoteNumber, amount: c.amount.toNumber(), taxAmount: c.taxAmount.toNumber(), issuedAt: c.issuedAt })),
    })),
  });
}
