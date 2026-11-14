import { NextResponse } from "next/server";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { normalizeAdjustment } from "@/lib/cash-flow/adjustments";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const parsed = normalizeAdjustment(await request.json().catch(() => null), { partial: true });
  if (!parsed.ok) return cashFlowError(422, "VALIDATION", "Check the highlighted fields.", { fields: parsed.fields });
  const { workspaceId, userId, email } = auth.ctx;
  const found = await prisma.cashForecastManualAdjustment.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!found) return cashFlowError(404, "NOT_FOUND", "Adjustment not found.");
  const updated = await prisma.cashForecastManualAdjustment.update({ where: { id }, data: parsed.data });
  void logActivity({ action: "cash_adjustment_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "cash_forecast_adjustment", id }, metadata: { changed: Object.keys(parsed.data) } });
  return NextResponse.json({ data: updated });
}

export async function DELETE(request: Request, props: Ctx) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const { workspaceId, userId, email } = auth.ctx;
  const res = await prisma.cashForecastManualAdjustment.deleteMany({ where: { id, workspaceId } });
  if (!res.count) return cashFlowError(404, "NOT_FOUND", "Adjustment not found.");
  void logActivity({ action: "cash_adjustment_deleted", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "cash_forecast_adjustment", id } });
  return NextResponse.json({ success: true });
}
