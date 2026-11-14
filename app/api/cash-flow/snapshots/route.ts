import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";

const QuerySchema = z.object({
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

/** Saved forecasts (the history the accuracy view compares against). */
export async function GET(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries([...url.searchParams.entries()]));
  if (!parsed.success) return cashFlowError(400, "INVALID_QUERY", "Invalid query");
  const { horizonType, scenarioTag, limit } = parsed.data;
  const snapshots = await prisma.cashForecastSnapshot.findMany({
    where: { workspaceId: auth.ctx.workspaceId, ...(horizonType ? { horizonType } : {}), ...(scenarioTag ? { scenarioTag } : {}) },
    orderBy: { generatedAt: "desc" }, take: limit ?? 10,
    select: { id: true, generatedAt: true, horizonType: true, scenarioTag: true, startDate: true, endDate: true, openingCash: true, closingCash: true, totalProjectedInflows: true, totalProjectedOutflows: true, confidenceScore: true, generatedBy: true },
  });
  return NextResponse.json({ data: snapshots }, { headers: { "Cache-Control": "no-store" } });
}
