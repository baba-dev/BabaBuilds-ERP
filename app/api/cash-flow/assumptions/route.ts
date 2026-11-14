import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { loadScenarioAssumptions, sanitizeAssumptions, scenarioKey, SCENARIOS } from "@/lib/cash-flow/assumptions";
import { logActivity } from "@/lib/security/activity-log";
import type { Prisma } from "@prisma/client";

/** The assumptions each scenario actually runs on (defaults overlaid with what was saved). */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ data: await loadScenarioAssumptions(auth.ctx.workspaceId) }, { headers: { "Cache-Control": "no-store" } });
}

const bodySchema = z.object({ scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]), values: z.record(z.string(), z.unknown()) });

/** Save one scenario's assumptions. Values are clamped to sane ranges; the previous values are kept in the activity log. */
export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(400, "INVALID_BODY", "Invalid payload");
  const { workspaceId, userId, email } = auth.ctx;
  const key = scenarioKey(parsed.data.scenarioTag);
  const clean = sanitizeAssumptions(parsed.data.values);
  const existing = await prisma.cashForecastAssumption.findFirst({ where: { workspaceId, key, isActive: true }, select: { id: true, valueJson: true } });
  // One live row per scenario, updated in place (the table allows a single active row per key).
  const row = existing
    ? await prisma.cashForecastAssumption.update({ where: { id: existing.id }, data: { valueJson: clean as Prisma.InputJsonValue, updatedBy: email ?? userId } })
    : await prisma.cashForecastAssumption.create({ data: { workspaceId, key, valueJson: clean as Prisma.InputJsonValue, isActive: true, updatedBy: email ?? userId } });
  void logActivity({ action: "cash_forecast_assumptions_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "cash_forecast_assumption", id: row.id }, metadata: { scenario: parsed.data.scenarioTag, from: existing?.valueJson ?? null, to: clean } });
  return NextResponse.json({ data: await loadScenarioAssumptions(workspaceId) });
}

/** Back to defaults for one scenario, or all of them. */
export async function DELETE(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const tag = new URL(request.url).searchParams.get("scenarioTag");
  const keys = tag && (SCENARIOS as string[]).includes(tag) ? [scenarioKey(tag as (typeof SCENARIOS)[number])] : SCENARIOS.map(scenarioKey);
  await prisma.cashForecastAssumption.deleteMany({ where: { workspaceId: auth.ctx.workspaceId, key: { in: keys } } });
  void logActivity({ action: "cash_forecast_assumptions_reset", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email }, request, metadata: { keys } });
  return NextResponse.json({ data: await loadScenarioAssumptions(auth.ctx.workspaceId) });
}
