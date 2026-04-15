import { Prisma } from "@prisma/client";
import type {
  CashForecastDirection,
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
import { getScenarioDefaults, applyScenarioToDate, applyScenarioToAmount } from "@/lib/cash-flow/scenario";
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
  if (closingCash.lte(threshold)) return "HIGH";
  // Medium risk if within 2x threshold (simple heuristic for v1)
  if (closingCash.lte(threshold.mul(2))) return "MEDIUM";
  return "LOW";
};

const isActualLine = (line: ForecastLineDraft) => line.classification === "ACTUAL";

const directionOfAmount = (amount: Prisma.Decimal): CashForecastDirection => (amount.gte(0) ? "INFLOW" : "OUTFLOW");

const normalizeLine = (
  line: ForecastLineDraft,
  scenarioTag: CashForecastScenarioTag,
  assumptions: ForecastAssumptions
): ForecastLineDraft => {
  const amount = toDecimal(line.amount);
  const direction: CashForecastDirection = line.direction ?? directionOfAmount(amount);
  const absAmount = amount.abs();
  const expectedDate = applyScenarioToDate(new Date(line.expectedDate), scenarioTag, assumptions);

  // Apply amount modifiers only to non-actual projections.
  const adjustedAmount =
    line.classification === "ACTUAL"
      ? absAmount
      : applyScenarioToAmount(absAmount, scenarioTag, assumptions, direction);

  return {
    ...line,
    direction,
    scenarioTag,
    amount: adjustedAmount,
    expectedDate,
  };
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

export async function computeCashForecastSnapshot(
  input: ForecastEngineInput,
  deps?: { loadSources?: (args: { workspaceId: string; startDate: Date; endDate: Date; now: Date }) => Promise<ForecastSourceData> }
): Promise<ForecastSnapshotResult> {
  const now = input.now ?? new Date();
  const assumptions = getScenarioDefaults(input.scenarioTag);

  const buckets = buildForecastBuckets({
    horizonType: input.horizonType,
    startDate: input.startDate,
  });
  const endDate = buckets.length ? buckets[buckets.length - 1].periodEnd : input.startDate;

  const loadSources = deps?.loadSources ?? (async (args) => loadForecastSourceData(args));
  const sources = await loadSources({ workspaceId: input.workspaceId, startDate: input.startDate, endDate, now });

  const openingCash = toDecimal(sources.openingCash);

  const rawLines = buildForecastLinesFromSources({
    workspaceId: input.workspaceId,
    startDate: input.startDate,
    endDate,
    now,
    sources,
  });

  const lines = rawLines.map((l) => normalizeLine(l, input.scenarioTag, assumptions));

  const bucketLines: Record<string, ForecastLineDraft[]> = {};
  for (const b of buckets) bucketLines[b.bucketLabel] = [];

  for (const line of lines) {
    const b = bucketize(buckets, new Date(line.expectedDate));
    if (!b) continue;
    bucketLines[b.bucketLabel].push(line);
  }

  let running = openingCash;
  const periods: ForecastPeriodResult[] = [];
  let crunchDate: Date | null = null;

  const threshold = toDecimal(assumptions.minimumCashThreshold ?? 0);

  for (const bucket of buckets) {
    const periodLines = bucketLines[bucket.bucketLabel] ?? [];
    const actualInflows = sumBy(periodLines, (l) => isActualLine(l) && l.direction === "INFLOW");
    const actualOutflows = sumBy(periodLines, (l) => isActualLine(l) && l.direction === "OUTFLOW");
    const projectedInflows = sumBy(periodLines, (l) => !isActualLine(l) && l.direction === "INFLOW");
    const projectedOutflows = sumBy(periodLines, (l) => !isActualLine(l) && l.direction === "OUTFLOW");

    const opening = running;
    const net = actualInflows.plus(projectedInflows).minus(actualOutflows.plus(projectedOutflows));
    const closing = opening.plus(net);

    const riskLevel = classifyRisk({ closingCash: closing, threshold });
    if (!crunchDate && (closing.lt(0) || closing.lte(threshold))) {
      crunchDate = bucket.periodStart;
    }

    periods.push({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      bucketLabel: bucket.bucketLabel,
      openingCash: opening,
      actualInflows,
      projectedInflows,
      actualOutflows,
      projectedOutflows,
      closingCash: closing,
      riskLevel,
      lineItems: periodLines,
    });

    running = closing;
  }

  const totalProjectedInflows = sumBy(lines, (l) => !isActualLine(l) && l.direction === "INFLOW");
  const totalProjectedOutflows = sumBy(lines, (l) => !isActualLine(l) && l.direction === "OUTFLOW");

  const closingCash = periods.length ? periods[periods.length - 1].closingCash : openingCash;

  // Driver concentration (top 5) by abs amount, grouped by source key.
  const inflowAgg = new Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>();
  const outflowAgg = new Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>();

  for (const l of lines) {
    const key = makeDriverKey(l);
    const map = l.direction === "INFLOW" ? inflowAgg : outflowAgg;
    const prev = map.get(key);
    map.set(key, {
      sourceType: l.sourceType,
      amount: (prev?.amount ?? new Prisma.Decimal(0)).plus(toDecimal(l.amount)),
    });
  }

  const topN = (m: Map<string, { sourceType: CashForecastSourceType; amount: Prisma.Decimal }>, n = 5) =>
    Array.from(m.entries())
      .map(([key, v]) => ({ key, sourceType: v.sourceType, amount: v.amount }))
      .sort((a, b) => b.amount.abs().cmp(a.amount.abs()))
      .slice(0, n);

  return {
    horizonType: input.horizonType,
    scenarioTag: input.scenarioTag,
    startDate: input.startDate,
    endDate,
    openingCash,
    closingCash,
    totalProjectedInflows,
    totalProjectedOutflows,
    confidenceScore: null,
    assumptions,
    periods,
    lineItems: lines,
    crunchDate,
    drivers: {
      inflows: topN(inflowAgg),
      outflows: topN(outflowAgg),
    },
  };
}

