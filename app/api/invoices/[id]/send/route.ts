import { NextResponse } from "next/server";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { sendInvoiceEmail } from "@/lib/invoices/send";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.send");
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const result = await sendInvoiceEmail({ workspaceId: auth.access.workspaceId, userId: auth.access.userId, invoiceId: id });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return NextResponse.json({ success: true, message: "Invoice emailed." });
  } catch (error) {
    console.error("Invoice send error:", error);
    return apiError(500, "INVOICE_SEND_FAILED", "Failed to send the invoice email.");
  }
}
