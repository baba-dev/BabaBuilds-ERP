import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    horizonType: url.searchParams.get("horizonType") ?? undefined,
    scenarioTag: url.searchParams.get("scenarioTag") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const horizonType = parsed.data.horizonType ?? "WEEKLY_13";
  const scenarioTag = parsed.data.scenarioTag ?? "BASE";

  const snapshot = await prisma.cashForecastSnapshot.findFirst({
    where: { workspaceId, horizonType, scenarioTag },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      generatedAt: true,
      startDate: true,
      endDate: true,
      openingCash: true,
      closingCash: true,
      periods: {
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          bucketLabel: true,
          openingCash: true,
          closingCash: true,
          riskLevel: true,
          projectedInflows: true,
          projectedOutflows: true,
          actualInflows: true,
          actualOutflows: true,
        },
        orderBy: { periodStart: "asc" },
      },
    },
  });

  if (!snapshot) {
    return NextResponse.json(
      { data: { snapshot: null, horizonType, scenarioTag, periods: [] } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const periods = snapshot.periods.map((p) => {
    const projectedNet = Number(p.projectedInflows) - Number(p.projectedOutflows);
    const actualNet = Number(p.actualInflows) - Number(p.actualOutflows);
    return {
      ...p,
      varianceNet: actualNet - projectedNet,
    };
  });

  return NextResponse.json(
    {
      data: {
        horizonType,
        scenarioTag,
        snapshot: {
          id: snapshot.id,
          generatedAt: snapshot.generatedAt,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
          openingCash: snapshot.openingCash,
          closingCash: snapshot.closingCash,
        },
        periods,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

