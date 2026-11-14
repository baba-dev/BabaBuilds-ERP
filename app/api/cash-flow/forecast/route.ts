import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { computeAllScenarios, runForecast, type ForecastSnapshotResult } from "@/lib/cash-flow/forecast-engine";
import { loadForecastSourceData } from "@/lib/cash-flow/sources";
import { buildForecastBuckets } from "@/lib/cash-flow/date-buckets";
import { buildActions, buildKpis, hrefFor } from "@/lib/cash-flow/insights";
import { loadScenarioAssumptions, sanitizeAssumptions } from "@/lib/cash-flow/assumptions";
import { startOfDay } from "date-fns";
import type { ForecastSourceData } from "@/lib/cash-flow/types";
import { Prisma } from "@prisma/client";
import { checkPermissionSilent } from "@/lib/rbac";

const horizonSchema = z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]);
const scenarioSchema = z.enum(["BASE", "BEST_CASE", "WORST_CASE"]);
const MAX_LINES = 1500;

const n = (v: unknown) => { const x = Number(v?.toString?.() ?? v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0; };

function shapeScenario(r: ForecastSnapshotResult) {
  return {
    tag: r.scenarioTag, openingCash: n(r.openingCash), closingCash: n(r.closingCash), lowestCash: n(r.lowestCash), lowestCashDate: r.lowestCashDate?.toISOString() ?? null, crunchDate: r.crunchDate?.toISOString() ?? null,
    inflows: n(r.totalProjectedInflows), outflows: n(r.totalProjectedOutflows), confidence: r.confidenceScore, assumptions: r.assumptions,
    periods: r.periods.map((p) => ({ label: p.bucketLabel, start: p.periodStart.toISOString(), end: p.periodEnd.toISOString(), opening: n(p.openingCash), closing: n(p.closingCash), lowest: n(p.lowestCash), actualIn: n(p.actualInflows), actualOut: n(p.actualOutflows), projectedIn: n(p.projectedInflows), projectedOut: n(p.projectedOutflows), risk: p.riskLevel })),
  };
}

const lineKey = (l: { sourceType: string; sourceId?: string | null; title: string }) => `${l.sourceType}:${l.sourceId ?? l.title}`;

function shapeLines(r: ForecastSnapshotResult, plans: Map<string, { status: string; note: string | null }>) {
  return r.periods.flatMap((p) => p.lineItems.map((l) => {
    const meta = (l.metadataJson ?? {}) as Record<string, unknown>;
    const key = lineKey(l);
    const plan = plans.get(key);
    return {
      key, direction: l.direction, sourceType: l.sourceType, sourceId: l.sourceId ?? null, title: l.title, amount: n(l.amount), date: new Date(l.expectedDate).toISOString(), period: p.bucketLabel,
      classification: l.classification, confidence: l.confidence ?? null, explanation: l.explanation ?? null, href: hrefFor(l.sourceType),
      overdueDays: Number(meta.overdueDays ?? 0) || 0, planStatus: plan?.status ?? "open", planNote: plan?.note ?? null,
    };
  })).sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_LINES);
}

function alertsFor(r: ForecastSnapshotResult) {
  return r.periods.filter((p) => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH").map((p) => ({ severity: p.riskLevel === "CRITICAL" ? "critical" : "warning", period: p.bucketLabel, start: p.periodStart.toISOString(), lowest: n(p.lowestCash), closing: n(p.closingCash) }));
}

/** The live forecast: all three scenarios computed from today's data in one pass, plus what to do about it. Nothing here goes stale. */
export async function GET(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const limit = enforceRouteRateLimit({ request, route: "/api/cash-flow/forecast", scope: "forecast", max: 120, windowMs: 60_000 });
  if (!limit.ok) return limit.response;
  const sp = new URL(request.url).searchParams;
  const horizon = horizonSchema.safeParse(sp.get("horizonType") ?? "WEEKLY_13");
  const scenario = scenarioSchema.safeParse(sp.get("scenarioTag") ?? "BASE");
  if (!horizon.success || !scenario.success) return cashFlowError(400, "INVALID_QUERY", "Unknown horizon or scenario.");
  try {
    const now = new Date();
    const { workspaceId } = auth.ctx;
    const { sources, results, startDate, endDate } = await computeAllScenarios({ workspaceId, horizonType: horizon.data, now });
    const planRows = await prisma.cashForecastLineItemPlan.findMany({ where: { workspaceId }, orderBy: { updatedAt: "asc" }, select: { planKey: true, status: true, note: true } });
    const plans = new Map(planRows.map((p) => [p.planKey, { status: p.status, note: p.note }]));
    const selected = results[scenario.data];
    const canManage = await checkPermissionSilent(auth.ctx.userId, workspaceId, "cash_flow.manage_assumptions");
    return NextResponse.json({
      data: {
        canManage, generatedAt: now.toISOString(), horizonType: horizon.data, scenarioTag: scenario.data, startDate: startDate.toISOString(), endDate: endDate.toISOString(),
        accounts: (sources.accounts ?? []).map((a) => ({ id: a.id, name: a.name, balance: n(a.balance), currency: a.currency })),
        kpis: buildKpis(results.BASE, sources, now),
        actions: buildActions(results.BASE, results.WORST_CASE, sources),
        scenarios: [shapeScenario(results.BASE), shapeScenario(results.BEST_CASE), shapeScenario(results.WORST_CASE)],
        lines: shapeLines(selected, plans),
        alerts: alertsFor(selected),
        sourceCounts: sources.debug?.telemetry.counts ?? null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CASH_FLOW_FORECAST]", error);
    return cashFlowError(500, "FORECAST_FAILED", "Could not build the forecast.");
  }
}

const whatIfSchema = z.object({
  horizonType: horizonSchema.default("WEEKLY_13"),
  assumptions: z.record(z.string(), z.unknown()).default({}),
  adjustments: z.array(z.object({ date: z.string().min(1), amount: z.number().finite().positive().max(1e12), direction: z.enum(["INFLOW", "OUTFLOW"]), reason: z.string().max(120).default("What-if") })).max(10).default([]),
});

/** A what-if: the base scenario with different assumptions and/or extra one-off amounts, computed live and never saved. */
export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const limit = enforceRouteRateLimit({ request, route: "/api/cash-flow/forecast", scope: "what-if", max: 60, windowMs: 60_000 });
  if (!limit.ok) return limit.response;
  const parsed = whatIfSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(400, "INVALID_BODY", "Check the what-if values.");
  try {
    const now = new Date();
    const start = startOfDay(now);
    const buckets = buildForecastBuckets({ horizonType: parsed.data.horizonType, startDate: start });
    const endDate = buckets[buckets.length - 1]!.periodEnd;
    const [sources, stored] = await Promise.all([loadForecastSourceData({ workspaceId: auth.ctx.workspaceId, startDate: start, endDate, now }), loadScenarioAssumptions(auth.ctx.workspaceId)]);
    const extra: ForecastSourceData["manualAdjustments"] = parsed.data.adjustments.map((a, i) => ({ id: `whatif-${i}`, date: new Date(a.date), amount: new Prisma.Decimal(a.amount), direction: a.direction, reason: a.reason, category: "What-if" })).filter((a) => !Number.isNaN(a.date.getTime()));
    const withExtras = { ...sources, manualAdjustments: [...sources.manualAdjustments, ...extra] };
    const assumptions = { ...stored.BASE, ...sanitizeAssumptions(parsed.data.assumptions) };
    const base = runForecast({ sources, horizonType: parsed.data.horizonType, scenarioTag: "BASE", startDate: start, assumptions: stored.BASE, now });
    const custom = runForecast({ sources: withExtras, horizonType: parsed.data.horizonType, scenarioTag: "BASE", startDate: start, assumptions, now });
    return NextResponse.json({ data: { base: shapeScenario(base), custom: shapeScenario(custom) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CASH_FLOW_WHATIF]", error);
    return cashFlowError(500, "WHATIF_FAILED", "Could not run the what-if.");
  }
}
