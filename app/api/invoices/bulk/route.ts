import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { sendInvoiceEmail } from "@/lib/invoices/send";
import { sendArReminderEmailForInvoice } from "@/lib/ar-collections";

const MAX_BULK = 25;
const bodySchema = z.object({
  action: z.enum(["send", "remind"]),
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_BULK),
});

/** Sequential on purpose: SMTP providers rate-limit, and a partial failure must be reported per invoice. */
export async function POST(request: Request) {
  try {
    const auth = await requireInvoiceAccess("invoices.send");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.access;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "INVALID_PAYLOAD", `Select between 1 and ${MAX_BULK} invoices.`);
    const ids = [...new Set(parsed.data.ids)];

    const owned = await prisma.invoice.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, invoiceNumber: true, status: true },
    });
    const byId = new Map(owned.map((i) => [i.id, i]));

    const results: Array<{ id: string; invoiceNumber: string | null; ok: boolean; code?: string; message?: string }> = [];
    for (const id of ids) {
      const invoice = byId.get(id);
      if (!invoice) {
        results.push({ id, invoiceNumber: null, ok: false, code: "INVOICE_NOT_FOUND", message: "Invoice not found." });
        continue;
      }
      if (parsed.data.action === "send") {
        const r = await sendInvoiceEmail({ workspaceId, userId, invoiceId: id });
        results.push(r.ok ? { id, invoiceNumber: invoice.invoiceNumber, ok: true } : { id, invoiceNumber: invoice.invoiceNumber, ok: false, code: r.code, message: r.message });
      } else if (invoice.status === "PAID" || invoice.status === "VOID") {
        results.push({ id, invoiceNumber: invoice.invoiceNumber, ok: false, code: "NOTHING_DUE", message: "No balance is due." });
      } else {
        const r = await sendArReminderEmailForInvoice(workspaceId, id);
        results.push(r.ok ? { id, invoiceNumber: invoice.invoiceNumber, ok: true } : { id, invoiceNumber: invoice.invoiceNumber, ok: false, code: r.code, message: r.code === "SEND_FAILED" ? r.message : r.code });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return NextResponse.json({ success: succeeded === results.length, succeeded, failed: results.length - succeeded, results });
  } catch (error) {
    console.error("Invoice bulk action error:", error);
    return apiError(500, "BULK_FAILED", "Bulk action failed.");
  }
}
