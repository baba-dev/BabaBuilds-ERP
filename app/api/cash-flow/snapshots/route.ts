import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";
import { z } from "zod";

const QuerySchema = z.object({
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    horizonType: url.searchParams.get("horizonType") ?? undefined,
    scenarioTag: url.searchParams.get("scenarioTag") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const { horizonType, scenarioTag, limit } = parsed.data;

  const snapshots = await prisma.cashForecastSnapshot.findMany({
    where: {
      workspaceId,
      ...(horizonType ? { horizonType } : {}),
      ...(scenarioTag ? { scenarioTag } : {}),
    },
    orderBy: { generatedAt: "desc" },
    take: limit ?? 10,
    select: {
      id: true,
      generatedAt: true,
      horizonType: true,
      scenarioTag: true,
      startDate: true,
      endDate: true,
      openingCash: true,
      closingCash: true,
      totalProjectedInflows: true,
      totalProjectedOutflows: true,
      confidenceScore: true,
      assumptionsJson: true,
      generatedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: snapshots }, { headers: { "Cache-Control": "no-store" } });
}

