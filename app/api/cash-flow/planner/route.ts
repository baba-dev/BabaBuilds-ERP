import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";

const upsertSchema = z.object({
  planKey: z.string().min(1).max(240),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).default("BASE"),
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).default("WEEKLY_13"),
  status: z.enum(["open", "deferred", "resolved"]),
  note: z.string().max(600).optional().nullable(),
});

/** Mark a forecast item as open, deferred or handled, with a note. The forecast route returns these with each line. */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const rows = await prisma.cashForecastLineItemPlan.findMany({ where: { workspaceId: auth.ctx.workspaceId }, orderBy: { updatedAt: "desc" }, take: 500 });
  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(400, "INVALID_BODY", "Invalid payload");
  const input = parsed.data;
  const { workspaceId } = auth.ctx;
  // The same item can be planned under any horizon or scenario view, so a status is kept once per item.
  await prisma.cashForecastLineItemPlan.deleteMany({ where: { workspaceId, planKey: input.planKey, NOT: { horizonType: input.horizonType, scenarioTag: input.scenarioTag } } });
  const row = await prisma.cashForecastLineItemPlan.upsert({
    where: { workspaceId_horizonType_scenarioTag_planKey: { workspaceId, horizonType: input.horizonType, scenarioTag: input.scenarioTag, planKey: input.planKey } },
    update: { status: input.status, note: input.note ?? null },
    create: { workspaceId, planKey: input.planKey, scenarioTag: input.scenarioTag, horizonType: input.horizonType, status: input.status, note: input.note ?? null },
  });
  return NextResponse.json({ data: row }, { headers: { "Cache-Control": "no-store" } });
}
