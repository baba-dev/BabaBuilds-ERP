import fs from "fs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { toDetail } from "@/lib/invoices/serialize";
import { serializeMoney, toDecimal } from "@/lib/money";
import { restoreInvoiceStock } from "@/lib/invoices/stock";
import { invalidateInvoiceCaches } from "@/lib/invoices/payments";
import { resolveInvoicePdfStoragePath } from "@/lib/invoice/pdf-storage";
import { logActivity } from "@/lib/security/activity-log";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const auth = await requireInvoiceAccess("invoices.view");
    if (!auth.ok) return auth.response;
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId: auth.access.workspaceId },
      include: {
        items: true,
        payments: { orderBy: { receivedAt: "desc" } },
        events: { orderBy: { createdAt: "desc" }, take: 100 },
        creditNotes: { orderBy: { issuedAt: "desc" } },
      },
    });
    if (!invoice) return apiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");

    const detail = toDetail(invoice);
    // Money recorded directly on the invoice (webhooks, reconciliation, POS) that has no ledger row yet.
    const activeSum = invoice.payments.filter((p) => !p.reversedAt).reduce((sum, p) => sum.plus(toDecimal(p.amount)), toDecimal(0));
    const unattributed = toDecimal(invoice.amountReceived ?? 0).minus(activeSum);
    if (unattributed.gt(0.005)) {
      detail.payments.unshift({
        id: "unattributed",
        amount: serializeMoney(unattributed),
        receivedAt: (invoice.dateReceived ?? invoice.createdAt).toISOString(),
        method: "OTHER",
        reference: null,
        notes: "Received outside this ledger (payment link, bank match or import)",
        createdAt: invoice.createdAt.toISOString(),
        reversedAt: null,
        reversalReason: null,
      });
    }
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Invoice fetch error:", error);
    return apiError(500, "INVOICE_FETCH_FAILED", "Failed to fetch invoice.");
  }
}

/**
 * Hard delete is only for an invoice that never left the building: still pending, never emailed,
 * no payment history, no credit note. Anything else must be voided (credit note), which keeps the
 * number and audit trail intact for GST.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const auth = await requireInvoiceAccess("invoices.delete");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId, email } = auth.access;
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: {
        payments: { select: { id: true } },
        creditNotes: { select: { id: true } },
      },
    });
    if (!invoice) return apiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");

    const deletable =
      invoice.status === "PENDING" &&
      !invoice.sentAt &&
      !invoice.lastReminderSentAt &&
      invoice.payments.length === 0 &&
      invoice.creditNotes.length === 0 &&
      toDecimal(invoice.amountReceived ?? 0).lte(0);
    if (!deletable) {
      return apiError(409, "INVOICE_NOT_DELETABLE", "Sent, paid or partly paid invoices cannot be deleted. Void the invoice instead; it keeps the invoice number and issues a credit note.");
    }

    const pdfPath = invoice.pdfPath ? resolveInvoicePdfStoragePath(invoice) : null;

    await prisma.$transaction(async (tx) => {
      await restoreInvoiceStock(tx, { workspaceId, invoiceId: invoice.id, actorUserId: userId });
      const deleted = await tx.invoice.deleteMany({ where: { id: invoice.id, workspaceId, status: "PENDING" } });
      if (deleted.count === 0) throw new Error("INVOICE_CHANGED");
    });

    if (pdfPath) {
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch {
        console.error("Failed to delete invoice PDF file");
      }
    }
    invalidateInvoiceCaches(workspaceId, "delete");
    logActivity({
      action: "invoice_deleted",
      status: "SUCCESS",
      workspaceId,
      actor: { userId, email },
      entity: { type: "invoice", id },
      request,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_CHANGED") {
      return apiError(409, "INVOICE_CHANGED", "The invoice changed while deleting. Refresh and try again.");
    }
    console.error("Invoice deletion error:", error);
    return apiError(500, "INVOICE_DELETE_FAILED", "Failed to delete invoice.");
  }
}
