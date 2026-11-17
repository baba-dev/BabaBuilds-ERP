import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { addInvoiceEvent } from "@/lib/invoices/events";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { restoreInvoiceStock } from "@/lib/invoices/stock";
import { invalidateInvoiceCaches, type PaymentFailure } from "@/lib/invoices/payments";
import { fyLabelFor } from "@/lib/invoices/period";

const SEQUENCE_WIDTH = 3;

export async function getNextCreditNoteNumber(tx: Prisma.TransactionClient, workspaceId: string, at = new Date()) {
  const prefix = `CN/${fyLabelFor(at)}/`;
  const recent = await tx.creditNote.findMany({
    where: { workspaceId, creditNoteNumber: { startsWith: prefix } },
    select: { creditNoteNumber: true },
    orderBy: { issuedAt: "desc" },
    take: 200,
  });
  const max = recent.reduce((acc, row) => {
    const seq = parseInt(row.creditNoteNumber.split("/").pop() ?? "", 10);
    return Number.isNaN(seq) ? acc : Math.max(acc, seq);
  }, 0);
  return `${prefix}${String(max + 1).padStart(SEQUENCE_WIDTH, "0")}`;
}

/**
 * Cancels an invoice the GST-compliant way: the invoice and its number stay on record, a credit note for
 * the full amount is issued, stock is restored and the invoice is excluded from revenue/tax/AR totals.
 * Recorded payments must be reversed first (money movement is never hidden by a void).
 */
export async function voidInvoice(input: {
  workspaceId: string;
  userId: string;
  invoiceId: string;
  reason: string;
}): Promise<{ ok: true; creditNoteNumber: string } | PaymentFailure> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return { ok: false, status: 400, code: "REASON_REQUIRED", message: "Please give a reason for voiding this invoice." };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: input.workspaceId } });
        if (!invoice) return { ok: false, status: 404, code: "INVOICE_NOT_FOUND", message: "Invoice not found." } as PaymentFailure;
        if (invoice.status === "VOID") return { ok: false, status: 409, code: "ALREADY_VOID", message: "This invoice is already void." } as PaymentFailure;

        const active = await tx.invoicePayment.aggregate({
          where: { invoiceId: invoice.id, reversedAt: null },
          _sum: { amount: true },
        });
        if (toDecimal(active._sum.amount ?? 0).gt(0)) {
          return {
            ok: false,
            status: 409,
            code: "PAYMENTS_EXIST",
            message: "Reverse the recorded payments before voiding this invoice.",
          } as PaymentFailure;
        }

        const creditNoteNumber = await getNextCreditNoteNumber(tx, input.workspaceId);
        await tx.creditNote.create({
          data: {
            workspaceId: input.workspaceId,
            invoiceId: invoice.id,
            creditNoteNumber,
            amount: effectiveTotal(invoice),
            taxAmount: invoice.taxAmount,
            reason,
            createdByUserId: input.userId,
          },
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
        });
        await restoreInvoiceStock(tx, { workspaceId: input.workspaceId, invoiceId: invoice.id, actorUserId: input.userId });
        await appendTaxAuditEvent(tx, {
          workspaceId: input.workspaceId,
          eventType: "INVOICE_VOIDED",
          correlationId: newTaxCorrelationId(),
          actorUserId: input.userId,
          entityType: "Invoice",
          entityId: invoice.id,
          payload: { invoiceNumber: invoice.invoiceNumber, creditNoteNumber, reason },
        });
        await addInvoiceEvent(tx, {
          workspaceId: input.workspaceId,
          invoiceId: invoice.id,
          type: "VOIDED",
          message: `Voided with credit note ${creditNoteNumber}: ${reason}`,
          metadata: { creditNoteNumber },
          actorUserId: input.userId,
        });
        return { ok: true, creditNoteNumber } as const;
      });
      if (outcome.ok) await invalidateInvoiceCaches(input.workspaceId, "void");
      return outcome;
    } catch (error) {
      // Credit-note number collision with a concurrent void: retry with a fresh number.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) continue;
      throw error;
    }
  }
  return { ok: false, status: 409, code: "WRITE_CONFLICT_RETRY", message: "Could not allocate a credit note number. Please retry." };
}
