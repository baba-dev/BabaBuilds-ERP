import { Prisma } from "@prisma/client";
import type {
  CashForecastHorizonType,
  CashForecastRiskLevel,
  CashForecastScenarioTag,
  CashForecastSourceType,
  ForecastAssumptions,
  ForecastBucket,
  ForecastLineDraft,
  ForecastSourceData,
} from "@/lib/cash-flow/types";
import { buildForecastBuckets } from "@/lib/cash-flow/date-buckets";
import { applyScenarioToLine } from "@/lib/cash-flow/scenario";
import { loadScenarioAssumptions, SCENARIOS } from "@/lib/cash-flow/assumptions";
import { startOfDay } from "date-fns";
import { loadForecastSourceData, buildForecastLinesFromSources } from "@/lib/cash-flow/sources";
import { sumMoney, toDecimal } from "@/lib/money";

export type ForecastEngineInput = {
  workspaceId: string;
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  now?: Date;
};

export type ForecastPeriodResult = {
  periodStart: Date;
  periodEnd: Date;
  bucketLabel: string;
  openingCash: Prisma.Decimal;
  actualInflows: Prisma.Decimal;
  projectedInflows: Prisma.Decimal;
  actualOutflows: Prisma.Decimal;
  projectedOutflows: Prisma.Decimal;
  closingCash: Prisma.Decimal;
  /** The lowest the balance gets inside the period (a weekly closing balance can hide a mid-week dip). */
  lowestCash: Prisma.Decimal;
  riskLevel: CashForecastRiskLevel;
  lineItems: ForecastLineDraft[]; // scenario-adjusted lines belonging to this bucket
};

export type ForecastSnapshotResult = {
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  endDate: Date;
  openingCash: Prisma.Decimal;
  closingCash: Prisma.Decimal;
  totalProjectedInflows: Prisma.Decimal;
  totalProjectedOutflows: Prisma.Decimal;
  confidenceScore: number | null;
  assumptions: ForecastAssumptions;
  periods: ForecastPeriodResult[];
  lineItems: ForecastLineDraft[];
  crunchDate: Date | null;
  lowestCash: Prisma.Decimal;
  lowestCashDate: Date | null;
  drivers: {
    inflows: Array<{ key: string; sourceType: CashForecastSourceType; amount: Prisma.Decimal }>;
    outflows: Array<{ key: string; sourceType: CashForecastSourceType; amount: Prisma.Decimal }>;
  };
};

const classifyRisk = ({
  closingCash,
  threshold,
}: {
  closingCash: Prisma.Decimal;
  threshold: Prisma.Decimal;
}): CashForecastRiskLevel => {
  if (closingCash.lt(0)) return "CRITICAL";
  if (closingCash.lt(threshold)) return "HIGH";
  // Within twice the cushion is worth watching.
  if (threshold.gt(0) && closingCash.lte(threshold.mul(2))) return "MEDIUM";
  return "LOW";
};

const isActualLine = (line: ForecastLineDraft) => line.classification === "ACTUAL";

const normalizeLine = (line: ForecastLineDraft, scenarioTag: CashForecastScenarioTag, assumptions: ForecastAssumptions, start: Date): ForecastLineDraft => {
  const adjusted = applyScenarioToLine(line, scenarioTag, assumptions);
  // A scenario that pulls a payment earlier than today means "now", not "in the past".
  if (adjusted.classification !== "ACTUAL" && adjusted.expectedDate < start) adjusted.expectedDate = start;
  return adjusted;
};

const bucketize = (buckets: ForecastBucket[], date: Date): ForecastBucket | null => {
  const t = date.getTime();
  for (const b of buckets) {
    if (t >= b.periodStart.getTime() && t < b.periodEnd.getTime()) return b;
  }
  return null;
};

const sumBy = (lines: ForecastLineDraft[], predicate: (l: ForecastLineDraft) => boolean) =>
  sumMoney(lines.filter(predicate).map((l) => l.amount));

const makeDriverKey = (line: ForecastLineDraft) => `${line.sourceType}:${line.sourceId ?? line.title}`;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function computeConfidenceScore(lines: ForecastLineDraft[]): number | null {
  const projected = lines.filter((l) => !isActualLine(l));
  if (projected.length === 0) return null;

  // Weight by absolute amount so large items drive the signal.
  let weightedSum = 0;
  let weightTotal = 0;
  let knownWeight = 0;

  for (const l of projected) {
    const w = Number(toDecimal(l.amount).abs().toString());
    if (!Number.isFinite(w) || w <= 0) continue;
    weightTotal += w;

    const c = l.confidence;
    if (c == null || !Number.isFinite(c)) continue;
    const cc = clamp01(Number(c));
    weightedSum += cc * w;
    knownWeight += w;
  }

  if (!Number.isFinite(weightTotal) || weightTotal <= 0) return null;
  if (knownWeight <= 0) return null;

  const base = weightedSum / knownWeight; // average over known confidences
  const coverage = clamp01(knownWeight / weightTotal);

  // Mild penalty for unknown confidence coverage so "unknown-heavy" snapshots read less certain.
  // Keeps the score stable and interpretable without needing a full probabilistic model (v1).
  const penalty = (1 - coverage) * 0.12;
  return clamp01(base - penalty);
}

export type ForecastRunInput = {
  sources: ForecastSourceData;
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  assumptions: ForecastAssumptions;
  now?: Date;
};

/** The pure forecast: no database, same inputs give the same numbers. */
export function runForecast(input: ForecastRunInput): ForecastSnapshotResult {
  const now = input.now ?? new Date();
  const { sources, assumptions, scenarioTag } = input;
  const start = startOfDay(input.startDate);
  const buckets = buildForecastBuckets({ horizonType: input.horizonType, startDate: start });
  const endDate = buckets.length ? buckets[buckets.length - 1].periodEnd : start;
  const openingCash = toDecimal(sources.openingCash);

  const rawLines = buildForecastLinesFromSources({ workspaceId: "", startDate: start, endDate, now, scenarioTag, sources, assumptions });
  const lines = rawLines.map((l) => normalizeLine(l, scenarioTag, assumptions, start)).filter((l) => new Date(l.expectedDate) < endDate);

  const bucketLines = new Map<string, ForecastLineDraft[]>();
  for (const b of buckets) bucketLines.set(b.bucketLabel, []);
  for (const line of lines) {
    const b = bucketize(buckets, new Date(line.expectedDate));
    if (b) bucketLines.get(b.bucketLabel)!.push(line);
  }

  const threshold = toDecimal(assumptions.minimumCashThreshold ?? 0);
  const periods: ForecastPeriodResult[] = [];
  let running = openingCash;
  let crunchDate: Date | null = null;
  let lowestCash = openingCash;
  let lowestCashDate: Date | null = null;

  for (const bucket of buckets) {
    const periodLines = (bucketLines.get(bucket.bucketLabel) ?? []).sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());
    const actualInflows = sumBy(periodLines, (l) => isActualLine(l) && l.direction === "INFLOW");
    const actualOutflows = sumBy(periodLines, (l) => isActualLine(l) && l.direction === "OUTFLOW");
    const projectedInflows = sumBy(periodLines, (l) => !isActualLine(l) && l.direction === "INFLOW");
    const projectedOutflows = sumBy(periodLines, (l) => !isActualLine(l) && l.direction === "OUTFLOW");
    const opening = running;

    // Walk the period day by day: money out on a day lands before money in, so the dip is not understated.
    let walk = opening;
    let periodLow = opening;
    let periodLowDate = bucket.periodStart;
    const byDay = new Map<string, { date: Date; net: Prisma.Decimal; out: Prisma.Decimal }>();
    for (const l of periodLines) {
      const key = new Date(l.expectedDate).toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { date: new Date(l.expectedDate), net: new Prisma.Decimal(0), out: new Prisma.Decimal(0) };
      const amt = toDecimal(l.amount);
      cur.net = l.direction === "INFLOW" ? cur.net.plus(amt) : cur.net.minus(amt);
      if (l.direction === "OUTFLOW") cur.out = cur.out.plus(amt);
      byDay.set(key, cur);
    }
    for (const day of byDay.values()) {
      const afterOut = walk.minus(day.out);
      if (afterOut.lt(periodLow)) { periodLow = afterOut; periodLowDate = day.date; }
      walk = walk.plus(day.net);
      if (walk.lt(periodLow)) { periodLow = walk; periodLowDate = day.date; }
    }
    const closing = walk;
    if (periodLow.lt(lowestCash)) { lowestCash = periodLow; lowestCashDate = periodLowDate; }

    const riskLevel = classifyRisk({ closingCash: periodLow, threshold });
    if (!crunchDate && (periodLow.lt(0) || periodLow.lt(threshold))) crunchDate = periodLowDate;

    periods.push({ periodStart: bucket.periodStart, periodEnd: bucket.periodEnd, bucketLabel: bucket.bucketLabel, openingCash: opening, actualInflows, projectedInflows, actualOutflows, projectedOutflows, closingCash: closing, lowestCash: periodLow, riskLevel, lineItems: periodLines });
    running = closing;
  }

  const totalProjectedInflows = sumBy(lines, (l) => !isActualLine(l) && l.direction === "INFLOW");
  const totalProjectedOutflows = sumBy(lines, (l) => !isActualLine(l) && l.direction === "OUTFLOW");
  const closingCash = periods.length ? periods[periods.length - 1].closingCash : openingCash;

  const inflowAgg = new Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>();
  const outflowAgg = new Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>();
  for (const l of lines) {
    const key = makeDriverKey(l);
    const map = l.direction === "INFLOW" ? inflowAgg : outflowAgg;
    const prev = map.get(key);
    map.set(key, { sourceType: l.sourceType, amount: (prev?.amount ?? new Prisma.Decimal(0)).plus(toDecimal(l.amount)) });
  }
  const topN = (m: Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>, n = 5) =>
    Array.from(m.entries()).map(([key, v]) => ({ key, sourceType: v.sourceType, amount: v.amount })).sort((a, b) => b.amount.abs().cmp(a.amount.abs())).slice(0, n);

  return {
    horizonType: input.horizonType, scenarioTag, startDate: start, endDate, openingCash, closingCash, totalProjectedInflows, totalProjectedOutflows,
    confidenceScore: computeConfidenceScore(lines), assumptions, periods, lineItems: lines, crunchDate, lowestCash, lowestCashDate,
    drivers: { inflows: topN(inflowAgg), outflows: topN(outflowAgg) },
  };
}

/** Loads the workspace's data and runs one scenario. `deps` lets tests and callers supply sources and assumptions. */
export async function computeCashForecastSnapshot(
  input: ForecastEngineInput,
  deps?: {
    loadSources?: (args: { workspaceId: string; startDate: Date; endDate: Date; now: Date }) => Promise<ForecastSourceData>;
    assumptions?: ForecastAssumptions;
  },
): Promise<ForecastSnapshotResult> {
  const now = input.now ?? new Date();
  const start = startOfDay(input.startDate);
  const buckets = buildForecastBuckets({ horizonType: input.horizonType, startDate: start });
  const endDate = buckets.length ? buckets[buckets.length - 1].periodEnd : start;
  const loadSources = deps?.loadSources ?? ((args) => loadForecastSourceData(args));
  const [sources, stored] = await Promise.all([
    loadSources({ workspaceId: input.workspaceId, startDate: start, endDate, now }),
    deps?.assumptions ? Promise.resolve(null) : loadScenarioAssumptions(input.workspaceId).catch(() => null),
  ]);
  const assumptions = deps?.assumptions ?? stored?.[input.scenarioTag] ?? (await import("@/lib/cash-flow/scenario")).getScenarioDefaults(input.scenarioTag);
  return runForecast({ sources, horizonType: input.horizonType, scenarioTag: input.scenarioTag, startDate: start, assumptions, now });
}

/** All three scenarios from one load of the data: what the workspace sees and what the nightly job stores. */
export async function computeAllScenarios(args: { workspaceId: string; horizonType: CashForecastHorizonType; startDate?: Date; now?: Date; overrides?: Partial<Record<CashForecastScenarioTag, ForecastAssumptions>> }) {
  const now = args.now ?? new Date();
  const start = startOfDay(args.startDate ?? now);
  const buckets = buildForecastBuckets({ horizonType: args.horizonType, startDate: start });
  const endDate = buckets.length ? buckets[buckets.length - 1].periodEnd : start;
  const [sources, assumptions] = await Promise.all([loadForecastSourceData({ workspaceId: args.workspaceId, startDate: start, endDate, now }), loadScenarioAssumptions(args.workspaceId)]);
  const results = {} as Record<CashForecastScenarioTag, ForecastSnapshotResult>;
  for (const tag of SCENARIOS) results[tag] = runForecast({ sources, horizonType: args.horizonType, scenarioTag: tag, startDate: start, assumptions: args.overrides?.[tag] ?? assumptions[tag], now });
  return { sources, assumptions, results, startDate: start, endDate };
}
