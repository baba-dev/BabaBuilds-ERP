import "server-only";
import { prisma } from "@/lib/prisma";
import { scanBuffer } from "@/lib/security/clamav";
import { sniffAllowedContent } from "@/lib/uploads/private-storage";
import { logActivity } from "@/lib/security/activity-log";
import { createExpenseWithSideEffects } from "./create-expense-with-side-effects";
import { scanReceipt, workspaceGroqKey } from "./scan";
import { RECEIPT_MAX_BYTES, storeReceipt } from "./service";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

export type InboundAttachment = { name: string; contentType?: string; buffer: Buffer };
export const MAX_ATTACHMENTS = 5;

/** Accepts the two shapes mail providers send: Postmark-style JSON (Attachments[{Name, Content(base64)}]) or generic lower-case JSON. */
export function attachmentsFromJson(body: Record<string, unknown>): { from: string; subject: string; attachments: InboundAttachment[] } {
  const list = (Array.isArray(body.Attachments) ? body.Attachments : Array.isArray(body.attachments) ? body.attachments : []) as Array<Record<string, unknown>>;
  const attachments: InboundAttachment[] = [];
  for (const a of list.slice(0, MAX_ATTACHMENTS)) {
    const content = typeof a.Content === "string" ? a.Content : typeof a.content === "string" ? a.content : "";
    const name = String(a.Name ?? a.name ?? "receipt");
    if (!content) continue;
    const buffer = Buffer.from(content, "base64");
    if (buffer.length > 0) attachments.push({ name, contentType: String(a.ContentType ?? a.contentType ?? ""), buffer });
  }
  return { from: String(body.From ?? body.from ?? "").slice(0, 200), subject: String(body.Subject ?? body.subject ?? "").slice(0, 200), attachments };
}

/** Creates one draft expense per good attachment. Drafts never count until someone reviews them. */
export async function createDraftsFromInbound(workspaceId: string, input: { from: string; subject: string; attachments: InboundAttachment[] }) {
  const apiKey = await workspaceGroqKey(workspaceId);
  const created: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const att of input.attachments.slice(0, MAX_ATTACHMENTS)) {
    if (att.buffer.length > RECEIPT_MAX_BYTES) { skipped.push({ name: att.name, reason: "too large" }); continue; }
    if (!(await scanBuffer(att.buffer))) { skipped.push({ name: att.name, reason: "malware" }); continue; }
    const kind = sniffAllowedContent(att.buffer);
    if (kind !== "png" && kind !== "jpeg" && kind !== "webp" && kind !== "pdf") { skipped.push({ name: att.name, reason: "not a bill" }); continue; }
    const ext = kind === "pdf" ? ".pdf" : kind === "jpeg" ? ".jpg" : `.${kind}`;
    const stored = await storeReceipt(workspaceId, new File([new Uint8Array(att.buffer)], `receipt${ext}`));
    if (!stored.ok) { skipped.push({ name: att.name, reason: "rejected" }); continue; }
    const scanned = apiKey ? await scanReceipt({ apiKey, buffer: att.buffer, kind }) : null;
    const d = scanned && scanned.ok ? scanned.data : null;
    const expense = await createExpenseWithSideEffects({
      workspaceId, userId: "system-inbox", date: d ? new Date(d.date) : new Date(), category: d?.category ?? "Other", vendor: d?.vendor || (input.from ? `From ${input.from}`.slice(0, 120) : "Unknown vendor"),
      amount: d && d.amount !== "" ? Number(d.amount) : 0, description: d?.description || input.subject || "Forwarded bill", receiptUrl: stored.url, source: "EMAIL", approvalStatus: "DRAFT",
      gst: d?.gst ? { itcStatus: d.gst.itcStatus, vendorGstin: d.gst.vendorGstin || null, vendorInvoiceNo: d.gst.vendorInvoiceNo || null, hsnCode: d.gst.hsnCode || null, gstRate: d.gst.gstRate, paymentStatus: "PAID" } : null,
    });
    created.push(expense.id);
  }
  if (created.length) {
    void logActivity({ action: "expense_inbox_received", status: "SUCCESS", workspaceId, metadata: { count: created.length, from: input.from, skipped: skipped.length } });
    void dispatchNotification({ event: "GST_REMINDER", workspaceId, data: { title: "New bills in your expense inbox", body: `${created.length} forwarded bill${created.length === 1 ? "" : "s"} ready to review.`, actionUrl: "/expenses?view=review" } });
  }
  return { created, skipped };
}

export async function workspaceForInboxToken(token: string): Promise<string | null> {
  if (!token || token.length < 16 || token.length > 64) return null;
  const row = await prisma.expenseSettings.findUnique({ where: { inboxToken: token }, select: { workspaceId: true, inboxEnabled: true } });
  return row?.inboxEnabled ? row.workspaceId : null;
}
