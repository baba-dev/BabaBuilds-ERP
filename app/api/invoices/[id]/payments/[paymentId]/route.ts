import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { reverseInvoicePayment } from "@/lib/invoices/payments";

const bodySchema = z.object({ reason: z.string().trim().min(3).max(300) });

/** Reverses (does not delete) a payment: the row stays for the audit trail and the invoice is recalculated. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.edit");
    if (!auth.ok) return auth.response;
    const { id, paymentId } = await params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "REASON_REQUIRED", "Please give a short reason for reversing this payment.");

    const result = await reverseInvoicePayment({
      workspaceId: auth.access.workspaceId,
      userId: auth.access.userId,
      invoiceId: id,
      paymentId,
      reason: parsed.data.reason,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return NextResponse.json({ success: true, status: result.status });
  } catch (error) {
    console.error("Payment reversal error:", error);
    return apiError(500, "PAYMENT_REVERSAL_FAILED", "Failed to reverse payment.");
  }
}
