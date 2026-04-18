import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";

// v1: alerts are derived from snapshots; this endpoint returns computed alerts
// using the latest snapshot. Persisted alert settings arrive in later iterations.

const querySchema = z.object({
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
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
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const horizonType = parsed.data.horizonType ?? "WEEKLY_13";
  const scenarioTag = parsed.data.scenarioTag ?? "BASE";
  const limit = parsed.data.limit ?? 50;

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
        },
        orderBy: { periodStart: "asc" },
      },
    },
  });

  if (!snapshot) {
    return NextResponse.json({ data: { snapshot: null, alerts: [] } }, { headers: { "Cache-Control": "no-store" } });
  }

  const alerts: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    title: string;
    body: string;
    periodId?: string;
    periodStart?: string;
  }> = [];

  for (const p of snapshot.periods) {
    if (p.riskLevel === "CRITICAL") {
      alerts.push({
        type: "CASH_NEGATIVE",
        severity: "critical",
        title: `Projected cash negative (${p.bucketLabel})`,
        body: `Projected closing cash is ${p.closingCash.toString()} in ${p.bucketLabel}. Review collections and commitments.`,
        periodId: p.id,
        periodStart: p.periodStart.toISOString(),
      });
    } else if (p.riskLevel === "HIGH") {
      alerts.push({
        type: "CASH_LOW",
        severity: "warning",
        title: `Projected cash low (${p.bucketLabel})`,
        body: `Projected closing cash is ${p.closingCash.toString()} in ${p.bucketLabel}. Consider delaying spend or accelerating collections.`,
        periodId: p.id,
        periodStart: p.periodStart.toISOString(),
      });
    }
  }

  return NextResponse.json(
    {
      data: {
        snapshot: { id: snapshot.id, generatedAt: snapshot.generatedAt, horizonType, scenarioTag, startDate: snapshot.startDate, endDate: snapshot.endDate },
        alerts: alerts.slice(0, limit),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

