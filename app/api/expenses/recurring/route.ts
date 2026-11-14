import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireExpenseAccess } from "@/lib/expenses/access";
import { recurringSchema } from "@/lib/expenses/recurring-schema";
import { resolveVendor } from "@/lib/expenses/vendors";
import { logActivity } from "@/lib/security/activity-log";

const shape = (r: Awaited<ReturnType<typeof prisma.recurringExpense.findFirstOrThrow>>) => ({ ...r, amount: Number(r.amount), nextRunDate: r.nextRunDate.toISOString(), endDate: r.endDate ? r.endDate.toISOString() : null, lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null });

export async function GET() {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const rows = await prisma.recurringExpense.findMany({ where: { workspaceId: auth.ctx.workspaceId }, orderBy: [{ status: "asc" }, { nextRunDate: "asc" }], take: 200 });
  return NextResponse.json({ data: rows.map(shape) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const parsed = recurringSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "vendor"), code: i.message })) }, { status: 422 });
  const d = parsed.data;
  const vendor = d.vendorId ? await prisma.vendor.findFirst({ where: { id: d.vendorId, workspaceId: auth.ctx.workspaceId } }) : await resolveVendor(prisma, auth.ctx.workspaceId, d.vendor, { category: d.category });
  const row = await prisma.recurringExpense.create({ data: {
    workspaceId: auth.ctx.workspaceId, vendorId: vendor?.id ?? null, vendor: vendor?.name ?? d.vendor, category: d.category, amount: d.amount, description: d.description || null, frequency: d.frequency,
    nextRunDate: new Date(d.nextRunDate), endDate: d.endDate ? new Date(d.endDate) : null, autoPost: d.autoPost, paymentStatus: d.paymentStatus, dueInDays: d.dueInDays ?? null, itcStatus: d.itcStatus, gstRate: d.gstRate ?? null, createdByUserId: auth.ctx.userId,
  } });
  void logActivity({ action: "expense_recurring_created", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "recurring_expense", id: row.id } });
  return NextResponse.json({ success: true, recurring: shape(row) }, { status: 201 });
}
