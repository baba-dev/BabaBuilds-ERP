import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";
import { z } from "zod";

const querySchema = z.object({
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
});

type PeriodLine = {
  id: string;
  direction: "INFLOW" | "OUTFLOW";
  sourceType: string;
  sourceId: string | null;
  title: string;
  amount: string | number;
  classification: "ACTUAL" | "COMMITTED" | "EXPECTED" | "PREDICTED" | "MANUAL";
};

function safeNumber(n: unknown) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function driverKey(l: PeriodLine) {
  return `${l.sourceType}:${l.sourceId ?? l.title}`;
}

function computeTopDeltaDrivers(lines: PeriodLine[], direction: "INFLOW" | "OUTFLOW", take = 5) {
  const actual = new Map<string, { amount: number; sourceType: string; sourceId: string | null; title: string }>();
  const projected = new Map<string, { amount: number; sourceType: string; sourceId: string | null; title: string }>();

  for (const l of lines) {
    if (l.direction !== direction) continue;
    const k = driverKey(l);
    const target = l.classification === "ACTUAL" ? actual : projected;
    const prev = target.get(k);
    target.set(k, {
      amount: (prev?.amount ?? 0) + safeNumber(l.amount),
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      title: prev?.title ?? l.title,
    });
  }

  const keys = new Set<string>([...actual.keys(), ...projected.keys()]);
  const rows = Array.from(keys).map((k) => {
    const a = actual.get(k);
    const p = projected.get(k);
    const actualAmount = a?.amount ?? 0;
    const projectedAmount = p?.amount ?? 0;
    return {
      key: k,
      sourceType: a?.sourceType ?? p?.sourceType ?? "UNKNOWN",
      sourceId: a?.sourceId ?? p?.sourceId ?? null,
      title: a?.title ?? p?.title ?? k,
      actualAmount,
      projectedAmount,
      deltaAmount: actualAmount - projectedAmount,
    };
  });

  return rows
    .filter((r) => Number.isFinite(r.deltaAmount) && Math.abs(r.deltaAmount) > 0.0001)
    .sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount))
    .slice(0, take);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

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
          lineItems: {
            select: {
              id: true,
              direction: true,
              sourceType: true,
              sourceId: true,
              title: true,
              amount: true,
              classification: true,
            },
            orderBy: [{ direction: "asc" }, { classification: "asc" }, { amount: "desc" }],
          },
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
    const inflowsDelta = Number(p.actualInflows) - Number(p.projectedInflows);
    const outflowsDelta = Number(p.actualOutflows) - Number(p.projectedOutflows);
    const topInflowDrivers = computeTopDeltaDrivers(p.lineItems as unknown as PeriodLine[], "INFLOW", 5);
    const topOutflowDrivers = computeTopDeltaDrivers(p.lineItems as unknown as PeriodLine[], "OUTFLOW", 5);
    return {
      id: p.id,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      bucketLabel: p.bucketLabel,
      openingCash: p.openingCash,
      actualInflows: p.actualInflows,
      projectedInflows: p.projectedInflows,
      actualOutflows: p.actualOutflows,
      projectedOutflows: p.projectedOutflows,
      closingCash: p.closingCash,
      riskLevel: p.riskLevel,
      varianceNet: actualNet - projectedNet,
      attribution: {
        inflowsDelta,
        outflowsDelta,
        topInflowDrivers,
        topOutflowDrivers,
      },
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

