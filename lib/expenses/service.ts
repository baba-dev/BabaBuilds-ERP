import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scanBuffer } from "@/lib/security/clamav";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from "@/lib/uploads/private-storage";
import { expenseGstSchema, normalizeExpenseGst } from "@/lib/gst/expense-gst";
import { loadGstProfile } from "@/lib/gst/data";
import { computeWithheldAmount, deriveReturnPeriodKey } from "@/lib/tax/withholding";
import { determineAndPersistTax } from "@/src/server/tax/service";
import { createPrismaTaxPersistence } from "@/lib/tax/prisma-tax-persistence";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { expenseError, type ExpenseCtx } from "./access";
import type { ExpenseCore } from "./validate";
import { approvalForNewExpense } from "./settings";

export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_EXT = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> };
const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) => ({ ok: false as const, status, code, message, extra });
export const serviceError = (e: { status: number; code: string; message: string; extra?: Record<string, unknown> }) => expenseError(e.status, e.code, e.message, e.extra);

function bust(workspaceId: string, action: string) {
  try { invalidateDashboardCacheForWorkspace(workspaceId); } catch (error) { noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "expense", action, error: String(error) }); }
}

/** Type, size, real content and malware checks, then a private file. */
export async function storeReceipt(workspaceId: string, file: File): Promise<{ ok: true; url: string } | { ok: false; response: NextResponse }> {
  const ext = path.extname(file.name).toLowerCase();
  if (!RECEIPT_EXT.includes(ext)) return { ok: false, response: expenseError(400, "INVALID_FILE_TYPE", "Only images and PDFs are allowed.") };
  if (file.size > RECEIPT_MAX_BYTES) return { ok: false, response: expenseError(413, "FILE_TOO_LARGE", "The receipt is too large. The limit is 8 MB.") };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await scanBuffer(buffer))) return { ok: false, response: expenseError(400, "MALWARE_DETECTED", "Malware detected in uploaded file.") };
  const sniffed = sniffAllowedContent(buffer);
  if (!sniffed || !["pdf", "png", "jpeg", "webp", "gif"].includes(sniffed)) return { ok: false, response: expenseError(415, "INVALID_FILE_TYPE", "Unsupported or unsafe receipt content.") };
  if ((sniffed === "pdf") !== (ext === ".pdf")) return { ok: false, response: expenseError(415, "INVALID_FILE_TYPE", "The receipt content does not match its file type.") };
  const dir = buildPrivatePath("receipts", [workspaceId]);
  await ensureDir(dir);
  const stored = uniqueStoredName("receipt", ext);
  await fs.writeFile(path.join(dir, stored), buffer, { mode: 0o600 });
  return { ok: true, url: `/receipts/${workspaceId}/${stored}` };
}

/** Receipts live in private storage (older ones may sit in public/). Removing the expense must remove the file too. */
export async function removeReceiptFile(url: string | null | undefined) {
  if (!url) return;
  const clean = url.replace(/^\/+/, "");
  try {
    if (url.startsWith("/receipts/")) {
      const segments = clean.replace(/^receipts\//, "").split("/").filter(Boolean);
      if (segments.some((s) => s === ".." || s === ".")) return;
      await fs.unlink(buildPrivatePath("receipts", segments));
      return;
    }
  } catch { /* already gone, try the legacy location */ }
  try {
    const legacy = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", clean);
    if (legacy.startsWith(path.join(process.cwd(), "public") + path.sep)) await fs.unlink(legacy);
  } catch { /* nothing to remove */ }
}


type WhExpense = { id: string; vendor: string; amount: Prisma.Decimal; withholdingDeductedAt: Date | null; withholdingAmount: Prisma.Decimal | null; withholdingRatePercent: Prisma.Decimal | null; withholdingDepositedAt: Date | null; withholdingDepositDueAt: Date | null };
/** Tax withheld on a bill is recorded once the bill counts (approved). Safe to call twice. */
async function ensureWithholdingEvent(tx: Prisma.TransactionClient, ctx: ExpenseCtx, e: WhExpense) {
  if (!e.withholdingDeductedAt || !e.withholdingAmount || Number(e.withholdingAmount) <= 0) return;
  const exists = await tx.withholdingEvent.findFirst({ where: { expenseId: e.id }, select: { id: true } });
  if (exists) return;
  await tx.withholdingEvent.create({ data: { workspaceId: ctx.workspaceId, sourceType: "EXPENSE_PAYMENT", sourceId: e.id, expenseId: e.id, counterpartyName: e.vendor, grossAmount: e.amount, withheldAmount: e.withholdingAmount, withholdingRatePercent: e.withholdingRatePercent, deductedAt: e.withholdingDeductedAt, depositedAt: e.withholdingDepositedAt, depositDueAt: e.withholdingDepositDueAt, returnPeriodKey: deriveReturnPeriodKey(e.withholdingDeductedAt, null), createdByUserId: ctx.userId } });
}

type GstInput = Record<string, unknown> | undefined;

/** Merges what was sent over what is stored, validates, and recomputes the tax split for the amount. */
async function resolveGst(ctx: ExpenseCtx, existing: Prisma.ExpenseGetPayload<object>, amount: number, sent: GstInput) {
  const base = {
    itcStatus: existing.itcStatus, vendorGstin: existing.vendorGstin, vendorInvoiceNo: existing.vendorInvoiceNo, vendorStateCode: existing.vendorStateCode, hsnCode: existing.hsnCode,
    gstRate: existing.gstRate, paymentStatus: existing.paymentStatus, vendorMsme: existing.vendorMsme, vendorUdyam: existing.vendorUdyam, vendorAgreedDays: existing.vendorAgreedDays,
  };
  const parsed = expenseGstSchema.safeParse({ ...base, ...(sent ?? {}) });
  if (!parsed.success) return fail(400, "INVALID_GST", "Invalid GST details.");
  const profile = await loadGstProfile(ctx.workspaceId);
  const normalized = normalizeExpenseGst(parsed.data, amount, profile.stateCode);
  if (!normalized.ok) return fail(400, normalized.code, normalized.message);
  const data: Record<string, unknown> = { ...normalized.data };
  if (normalized.data.paymentStatus === "UNPAID") data.paidAt = null;
  else if (existing.paymentStatus === "UNPAID") data.paidAt = new Date();
  return { ok: true as const, data };
}

export type ExpenseExtras = { vendorId?: string | null; dueDate?: Date | null; billable?: boolean; clientId?: string | null; markupPercent?: number | null; submit?: boolean };

export async function updateExpense(ctx: ExpenseCtx, id: string, core: Partial<ExpenseCore>, opts: { gst?: GstInput; receiptUrl?: string | null; replaceReceipt?: boolean; extra?: ExpenseExtras } = {}): Promise<ServiceResult<{ expense: Prisma.ExpenseGetPayload<object>; changed: string[] }>> {
  const existing = await prisma.expense.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) return fail(404, "EXPENSE_NOT_FOUND", "Expense not found.");

  const amount = core.amount ?? Number(existing.amount);
  const amountChanged = core.amount !== undefined && core.amount !== Number(existing.amount);
  const dateChanged = core.date !== undefined && core.date.getTime() !== existing.date.getTime();
  const data: Prisma.ExpenseUpdateInput = {};
  const changed: string[] = [];
  const set = <K extends keyof ExpenseCore>(k: K) => { if (core[k] !== undefined && String(core[k]) !== String(existing[k as keyof typeof existing] ?? "")) { (data as Record<string, unknown>)[k] = core[k]; changed.push(k); } };
  (["date", "category", "vendor", "amount", "description"] as const).forEach(set);

  const needsGst = opts.gst !== undefined || (amountChanged && existing.itcStatus !== "NONE");
  if (needsGst) {
    const g = await resolveGst(ctx, existing, amount, opts.gst);
    if (!g.ok) return g;
    Object.assign(data, g.data);
    changed.push("gst");
  }
  if (opts.replaceReceipt) { data.receiptUrl = opts.receiptUrl ?? null; changed.push("receipt"); }

  // Tax withheld at source follows the bill amount: keep the stored amount and its event in step.
  let newWithheld: Prisma.Decimal | null = null;
  if (amountChanged && existing.withholdingDeductedAt && existing.withholdingRatePercent !== null) {
    newWithheld = computeWithheldAmount({ grossAmount: amount, ratePercent: Number(existing.withholdingRatePercent), explicitWithheldAmount: null, deductedAt: existing.withholdingDeductedAt });
    data.withholdingAmount = newWithheld;
  }
  const x = opts.extra ?? {};
  if (existing.billedInvoiceId && (amountChanged || x.clientId !== undefined || x.billable === false)) return fail(409, "ALREADY_BILLED", "This expense is already on an invoice, so its amount and client cannot change.");
  if (x.vendorId !== undefined) {
    if (x.vendorId === null) data.vendorRecord = { disconnect: true };
    else {
      const v = await prisma.vendor.findFirst({ where: { id: x.vendorId, workspaceId: ctx.workspaceId } });
      if (!v) return fail(404, "VENDOR_NOT_FOUND", "Vendor not found.");
      data.vendorRecord = { connect: { id: v.id } };
      if (core.vendor === undefined && v.name !== existing.vendor) { data.vendor = v.name; changed.push("vendor"); }
    }
    changed.push("vendorId");
  }
  if (x.dueDate !== undefined) { data.dueDate = x.dueDate; changed.push("dueDate"); }
  if (x.clientId !== undefined) {
    if (x.clientId === null) data.client = { disconnect: true };
    else {
      const c = await prisma.client.findFirst({ where: { id: x.clientId, workspaceId: ctx.workspaceId }, select: { id: true } });
      if (!c) return fail(404, "CLIENT_NOT_FOUND", "Client not found.");
      data.client = { connect: { id: c.id } };
    }
    changed.push("clientId");
  }
  if (x.billable !== undefined) { data.billable = x.billable && Boolean(x.clientId ?? existing.clientId); if (!x.billable) data.markupPercent = null; changed.push("billable"); }
  if (x.markupPercent !== undefined && (x.billable ?? existing.billable)) { data.markupPercent = x.markupPercent; changed.push("markupPercent"); }
  // Sending a draft or rejected entry for approval: goes straight in when approval is off or the sender may approve.
  if (x.submit && (existing.approvalStatus === "DRAFT" || existing.approvalStatus === "REJECTED")) {
    if (amount <= 0) return fail(422, "INCOMPLETE", "Add the amount before submitting.");
    const status = await approvalForNewExpense(ctx.workspaceId, ctx.userId, amount);
    data.approvalStatus = status;
    data.submittedByUserId = ctx.userId;
    data.rejectionReason = null;
    if (status === "APPROVED") { data.approvedByUserId = ctx.userId; data.approvedAt = new Date(); }
    changed.push("approvalStatus");
  }
  if (changed.length === 0) return { ok: true, expense: existing, changed };

  const expense = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({ where: { id }, data });
    if (updated.approvalStatus === "APPROVED" && existing.approvalStatus !== "APPROVED") await ensureWithholdingEvent(tx, ctx, updated);
    if (newWithheld) await tx.withholdingEvent.updateMany({ where: { expenseId: id }, data: { grossAmount: amount, withheldAmount: newWithheld } });
    if (amountChanged || dateChanged) {
      const country = ctx.countryCode.trim().toUpperCase() || "IN";
      await determineAndPersistTax(createPrismaTaxPersistence(tx), { source: { kind: "expense", entityId: id, workspaceId: ctx.workspaceId, taxableAmount: amount, originCountryCode: country, destinationCountryCode: country, occurredAt: updated.date }, actorUserId: ctx.userId });
      await appendTaxAuditEvent(tx, { workspaceId: ctx.workspaceId, eventType: "DETERMINATION", correlationId: newTaxCorrelationId(), actorUserId: ctx.userId, entityType: "Expense", entityId: id, payload: { vendor: updated.vendor, category: updated.category, amount, previousAmount: Number(existing.amount) } });
    }
    return updated;
  });
  if (opts.replaceReceipt && existing.receiptUrl && existing.receiptUrl !== expense.receiptUrl) await removeReceiptFile(existing.receiptUrl);
  void logActivity({ action: "expense_updated", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id }, metadata: { changed, from: { amount: Number(existing.amount), vendor: existing.vendor, category: existing.category }, to: { amount: Number(expense.amount), vendor: expense.vendor, category: expense.category } } });
  bust(ctx.workspaceId, "update");
  return { ok: true, expense, changed };
}

export async function deleteExpenses(ctx: ExpenseCtx, ids: string[]): Promise<ServiceResult<{ deleted: number }>> {
  const rows = await prisma.expense.findMany({ where: { id: { in: ids }, workspaceId: ctx.workspaceId }, select: { id: true, receiptUrl: true, vendor: true, amount: true, category: true } });
  if (rows.length === 0) return fail(404, "EXPENSE_NOT_FOUND", "Expense not found.");
  const found = rows.map((r) => r.id);
  await prisma.$transaction([
    prisma.withholdingEvent.updateMany({ where: { expenseId: { in: found } }, data: { expenseId: null } }),
    prisma.expense.deleteMany({ where: { id: { in: found }, workspaceId: ctx.workspaceId } }),
  ]);
  for (const r of rows) await removeReceiptFile(r.receiptUrl);
  void logActivity({ action: "expense_deleted", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: found[0] }, metadata: { count: rows.length, items: rows.slice(0, 20).map((r) => ({ id: r.id, vendor: r.vendor, amount: Number(r.amount), category: r.category })) } });
  bust(ctx.workspaceId, "delete");
  return { ok: true, deleted: rows.length };
}

/** Marks a bill on credit as paid. Rule 37 and 43B(h) read the payment date. */
export async function markPaid(ctx: ExpenseCtx, ids: string[], paidAt: Date): Promise<ServiceResult<{ updated: number }>> {
  const res = await prisma.expense.updateMany({ where: { id: { in: ids }, workspaceId: ctx.workspaceId, paymentStatus: "UNPAID" }, data: { paymentStatus: "PAID", paidAt } });
  if (res.count === 0) return fail(404, "NOTHING_TO_PAY", "None of these bills are waiting for payment.");
  void logActivity({ action: "expense_marked_paid", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: ids[0] }, metadata: { count: res.count, paidAt: paidAt.toISOString() } });
  bust(ctx.workspaceId, "pay");
  return { ok: true, updated: res.count };
}

export async function recategorize(ctx: ExpenseCtx, ids: string[], category: string): Promise<ServiceResult<{ updated: number }>> {
  const res = await prisma.expense.updateMany({ where: { id: { in: ids }, workspaceId: ctx.workspaceId }, data: { category } });
  void logActivity({ action: "expense_recategorized", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: ids[0] }, metadata: { count: res.count, category } });
  bust(ctx.workspaceId, "recategorize");
  return { ok: true, updated: res.count };
}

/** Approver action. Approving makes the entry count everywhere and records the tax withheld, if any; rejecting keeps it out with a reason. */
export async function reviewExpenses(ctx: ExpenseCtx, ids: string[], decision: "APPROVE" | "REJECT", reason?: string): Promise<ServiceResult<{ updated: number; skipped: number }>> {
  const waiting = await prisma.expense.findMany({ where: { id: { in: ids }, workspaceId: ctx.workspaceId, approvalStatus: { in: ["PENDING", "DRAFT"] } } });
  if (waiting.length === 0) return fail(404, "NOTHING_TO_REVIEW", "None of these expenses are waiting for review.");
  // A forwarded bill the scanner could not read has no amount yet: it has to be completed before it can count.
  const rows = decision === "APPROVE" ? waiting.filter((e) => Number(e.amount) > 0) : waiting;
  const skipped = waiting.length - rows.length;
  if (rows.length === 0) return fail(422, "INCOMPLETE", "Add the amount to these expenses before approving them.");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const e of rows) {
      if (decision === "APPROVE") {
        await tx.expense.update({ where: { id: e.id }, data: { approvalStatus: "APPROVED", approvedByUserId: ctx.userId, approvedAt: now, rejectionReason: null } });
        await ensureWithholdingEvent(tx, ctx, e);
      } else {
        await tx.expense.update({ where: { id: e.id }, data: { approvalStatus: "REJECTED", approvedByUserId: ctx.userId, approvedAt: now, rejectionReason: (reason ?? "").slice(0, 300) || null } });
      }
    }
  });
  void logActivity({ action: decision === "APPROVE" ? "expense_approved" : "expense_rejected", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: rows[0].id }, metadata: { count: rows.length, reason: reason ?? null } });
  bust(ctx.workspaceId, decision.toLowerCase());
  return { ok: true, updated: rows.length, skipped };
}
