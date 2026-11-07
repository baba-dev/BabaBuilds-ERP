import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { voidInvoice } from "@/lib/invoices/void";

const bodySchema = z.object({ reason: z.string().trim().min(3).max(300) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.delete");
    if (!auth.ok) return auth.response;
    const { id } = await params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "REASON_REQUIRED", "Please give a reason for voiding this invoice.");

    const result = await voidInvoice({
      workspaceId: auth.access.workspaceId,
      userId: auth.access.userId,
      invoiceId: id,
      reason: parsed.data.reason,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return NextResponse.json({ success: true, creditNoteNumber: result.creditNoteNumber });
  } catch (error) {
    console.error("Invoice void error:", error);
    return apiError(500, "INVOICE_VOID_FAILED", "Failed to void invoice.");
  }
}
