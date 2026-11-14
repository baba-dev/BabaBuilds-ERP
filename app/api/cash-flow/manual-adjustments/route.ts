import { NextResponse } from "next/server";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { normalizeAdjustment } from "@/lib/cash-flow/adjustments";

/** One-off amounts the forecast should include: a loan received, an owner top-up, a planned purchase. */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const rows = await prisma.cashForecastManualAdjustment.findMany({ where: { workspaceId: auth.ctx.workspaceId }, orderBy: { date: "asc" }, take: 500 });
  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const parsed = normalizeAdjustment(await request.json().catch(() => null), { partial: false });
  if (!parsed.ok) return cashFlowError(422, "VALIDATION", "Check the highlighted fields.", { fields: parsed.fields });
  const { workspaceId, userId, email } = auth.ctx;
  const created = await prisma.cashForecastManualAdjustment.create({ data: { workspaceId, ...(parsed.data as Required<typeof parsed.data>), createdBy: email ?? userId } });
  void logActivity({ action: "cash_adjustment_created", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "cash_forecast_adjustment", id: created.id }, metadata: { amount: Number(created.amount), direction: created.direction, date: created.date.toISOString() } });
  return NextResponse.json({ data: created }, { status: 201 });
}
