import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { shapeExpense } from "@/lib/expenses/queries";
import { deleteExpenses, removeReceiptFile, serviceError, storeReceipt, updateExpense, type ExpenseExtras } from "@/lib/expenses/service";
import { normalizeExpenseCore } from "@/lib/expenses/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const row = await prisma.expense.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId } });
  return row ? NextResponse.json({ data: shapeExpense(row) }) : expenseError(404, "EXPENSE_NOT_FOUND", "Expense not found.");
}

/** Partial update (JSON, or multipart when a receipt is attached). Only the fields sent change. */
export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const { id } = await props.params;

  let fields: Record<string, unknown> = {};
  let file: File | null = null;
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) { if (v instanceof File) { if (k === "receipt" && v.size > 0) file = v; } else fields[k] = v; }
      if (typeof fields.gst === "string") { try { fields.gst = JSON.parse(fields.gst); } catch { return expenseError(400, "INVALID_GST", "Invalid GST details."); } }
    } else {
      const body = await request.json();
      if (!body || typeof body !== "object") return expenseError(400, "INVALID_BODY", "Send the changes as JSON.");
      fields = body as Record<string, unknown>;
    }
  } catch {
    return expenseError(400, "INVALID_BODY", "Send the changes as JSON or a form.");
  }

  const core = normalizeExpenseCore(fields, { partial: true });
  if (!core.ok) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: core.fields }, { status: 422 });

  let receiptUrl: string | null | undefined;
  let storedNew: string | null = null;
  if (file) {
    const stored = await storeReceipt(ctx.workspaceId, file);
    if (!stored.ok) return stored.response;
    receiptUrl = storedNew = stored.url;
  } else if (fields.removeReceipt === true || fields.removeReceipt === "true") receiptUrl = null;

  try {
    const gst = fields.gst && typeof fields.gst === "object" ? (fields.gst as Record<string, unknown>) : undefined;
    const has = (k: string) => Object.prototype.hasOwnProperty.call(fields, k);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const extra: ExpenseExtras = {};
    if (has("vendorId")) extra.vendorId = str(fields.vendorId);
    if (has("clientId")) extra.clientId = str(fields.clientId);
    if (has("billable")) extra.billable = fields.billable === true || fields.billable === "true";
    if (has("markupPercent")) { const m = str(fields.markupPercent) === null ? null : Number(fields.markupPercent); if (m !== null && (!Number.isFinite(m) || m < 0 || m > 500)) return NextResponse.json({ error: "Check the markup.", code: "VALIDATION", fields: [{ field: "markupPercent", code: "AMOUNT" }] }, { status: 422 }); extra.markupPercent = m; }
    if (has("dueDate")) { const d = str(fields.dueDate) ? new Date(String(fields.dueDate)) : null; if (d && Number.isNaN(d.getTime())) return NextResponse.json({ error: "Check the due date.", code: "VALIDATION", fields: [{ field: "dueDate", code: "DATE" }] }, { status: 422 }); extra.dueDate = d; }
    if (fields.submit === true || fields.submit === "true") extra.submit = true;
    const res = await updateExpense(ctx, id, core.data, { gst, receiptUrl: receiptUrl ?? null, replaceReceipt: receiptUrl !== undefined, extra });
    if (!res.ok) { await removeReceiptFile(storedNew); return serviceError(res); }
    return NextResponse.json({ success: true, expense: shapeExpense(res.expense), changed: res.changed });
  } catch (error) {
    console.error("Expense Update Error:", error);
    await removeReceiptFile(storedNew);
    return expenseError(500, "EXPENSE_UPDATE_FAILED", "Failed to update expense.");
  }
}

export async function DELETE(_request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.delete");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  try {
    const res = await deleteExpenses(auth.ctx, [id]);
    return res.ok ? NextResponse.json({ success: true }) : serviceError(res);
  } catch (error) {
    console.error("Expense Deletion Error:", error);
    return expenseError(500, "EXPENSE_DELETE_FAILED", "Failed to delete expense.");
  }
}
