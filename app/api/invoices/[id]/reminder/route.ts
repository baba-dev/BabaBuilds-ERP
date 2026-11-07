import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { sendArReminderEmailForInvoice } from "@/lib/ar-collections";

const REMINDER_COOLDOWN_MS = 60_000;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.send");
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.access;
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId },
      select: { status: true, lastReminderSentAt: true },
    });
    if (!invoice) return apiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
    if (invoice.status === "PAID" || invoice.status === "VOID") {
      return apiError(409, "NOTHING_DUE", "There is no balance to remind about.");
    }
    if (invoice.lastReminderSentAt && Date.now() - invoice.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS) {
      return apiError(429, "TOO_SOON", "A reminder was just sent. Please wait a minute before sending another.");
    }

    const result = await sendArReminderEmailForInvoice(workspaceId, id);
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, "Invoice not found."],
        NO_CLIENT_EMAIL: [400, "This client has no email address on file."],
        SMTP_NOT_CONFIGURED: [400, "Email (SMTP) is not configured in Business Settings."],
        SEND_FAILED: [502, result.message || "Failed to send the reminder."],
      } as const;
      const [status, message] = map[result.code];
      return apiError(status, result.code, message);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice reminder error:", error);
    return apiError(500, "REMINDER_FAILED", "Failed to send the reminder.");
  }
}
