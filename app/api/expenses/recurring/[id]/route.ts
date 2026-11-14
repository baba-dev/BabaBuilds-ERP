import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { recurringSchema } from "@/lib/expenses/recurring-schema";
import { logActivity } from "@/lib/security/activity-log";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a schedule, or pause/resume it with { status }. Posted entries are never touched. */
export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const existing = await prisma.recurringExpense.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId } });
  if (!existing) return expenseError(404, "RECURRING_NOT_FOUND", "Schedule not found.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return expenseError(400, "INVALID_BODY", "Send the changes as JSON.");
  if (body.status === "ACTIVE" || body.status === "PAUSED") {
    await prisma.recurringExpense.update({ where: { id }, data: { status: body.status } });
    return NextResponse.json({ success: true });
  }
  const parsed = recurringSchema.safeParse({ vendor: existing.vendor, vendorId: existing.vendorId, category: existing.category, amount: Number(existing.amount), description: existing.description, frequency: existing.frequency, nextRunDate: existing.nextRunDate.toISOString(), endDate: existing.endDate?.toISOString() ?? null, autoPost: existing.autoPost, paymentStatus: existing.paymentStatus, dueInDays: existing.dueInDays, itcStatus: existing.itcStatus, gstRate: existing.gstRate, ...body });
  if (!parsed.success) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "vendor"), code: i.message })) }, { status: 422 });
  const d = parsed.data;
  await prisma.recurringExpense.update({ where: { id }, data: { vendor: d.vendor, category: d.category, amount: d.amount, description: d.description || null, frequency: d.frequency, nextRunDate: new Date(d.nextRunDate), endDate: d.endDate ? new Date(d.endDate) : null, autoPost: d.autoPost, paymentStatus: d.paymentStatus, dueInDays: d.dueInDays ?? null, itcStatus: d.itcStatus, gstRate: d.gstRate ?? null, status: existing.status === "ENDED" ? "ACTIVE" : existing.status } });
  void logActivity({ action: "expense_recurring_updated", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "recurring_expense", id } });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.delete");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const res = await prisma.recurringExpense.deleteMany({ where: { id, workspaceId: auth.ctx.workspaceId } });
  return res.count ? NextResponse.json({ success: true }) : expenseError(404, "RECURRING_NOT_FOUND", "Schedule not found.");
}
