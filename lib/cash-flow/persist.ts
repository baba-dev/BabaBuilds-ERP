import "server-only";

import { prisma } from "@/lib/prisma";
import type { CashForecastHorizonType, CashForecastScenarioTag, Prisma } from "@prisma/client";
import { computeAllScenarios, type ForecastSnapshotResult } from "@/lib/cash-flow/forecast-engine";
import { toDecimal } from "@/lib/money";

/** How many saved forecasts to keep per workspace, horizon and scenario. The nightly job adds one a day, so this is about six weeks of history for the accuracy view. */
export const SNAPSHOTS_KEPT = 45;

export type PersistedBy = "SYSTEM" | "USER" | "RULE_CHANGE" | "DATA_IMPORT";

/** Save one computed scenario. Only the base scenario keeps its line items; the others keep the period totals, which is all the comparison needs. */
export async function persistForecastResult(workspaceId: string, result: ForecastSnapshotResult, generatedBy: PersistedBy, now: Date, withLines: boolean) {
  const snapshot = await prisma.cashForecastSnapshot.create({
    data: {
      workspaceId, generatedAt: now, horizonType: result.horizonType, scenarioTag: result.scenarioTag, startDate: result.startDate, endDate: result.endDate,
      openingCash: result.openingCash, closingCash: result.closingCash, totalProjectedInflows: result.totalProjectedInflows, totalProjectedOutflows: result.totalProjectedOutflows,
      confidenceScore: result.confidenceScore ?? undefined, assumptionsJson: result.assumptions as Prisma.InputJsonValue, generatedBy,
      periods: {
        create: result.periods.map((p) => ({
          periodStart: p.periodStart, periodEnd: p.periodEnd, bucketLabel: p.bucketLabel, openingCash: p.openingCash,
          actualInflows: p.actualInflows, projectedInflows: p.projectedInflows, actualOutflows: p.actualOutflows, projectedOutflows: p.projectedOutflows,
          closingCash: p.closingCash, riskLevel: p.riskLevel, notesJson: { lowestCash: p.lowestCash.toFixed(2) },
          ...(withLines ? {
            lineItems: {
              create: p.lineItems.map((l) => ({
                direction: l.direction!, sourceType: l.sourceType, sourceId: l.sourceId ?? undefined, amount: toDecimal(l.amount), expectedDate: l.expectedDate, confidence: l.confidence ?? undefined,
                scenarioTag: result.scenarioTag, classification: l.classification, title: l.title, metadataJson: l.metadataJson as Prisma.InputJsonValue, explanation: l.explanation ?? undefined,
              })),
            },
          } : {}),
        })),
      },
    },
    select: { id: true },
  });
  await pruneSnapshots(workspaceId, result.horizonType, result.scenarioTag);
  return snapshot.id;
}

async function pruneSnapshots(workspaceId: string, horizonType: CashForecastHorizonType, scenarioTag: CashForecastScenarioTag) {
  const old = await prisma.cashForecastSnapshot.findMany({
    where: { workspaceId, horizonType, scenarioTag }, orderBy: { generatedAt: "desc" }, skip: SNAPSHOTS_KEPT, select: { id: true },
  });
  if (old.length) await prisma.cashForecastSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

/** Compute and store a horizon for all three scenarios from a single load of the data. */
export async function saveHorizonSnapshots(args: { workspaceId: string; horizonType: CashForecastHorizonType; generatedBy: PersistedBy; now?: Date }) {
  const now = args.now ?? new Date();
  const { results } = await computeAllScenarios({ workspaceId: args.workspaceId, horizonType: args.horizonType, now });
  const ids: Record<string, string> = {};
  for (const tag of ["BASE", "BEST_CASE", "WORST_CASE"] as const) {
    ids[tag] = await persistForecastResult(args.workspaceId, results[tag], args.generatedBy, now, tag === "BASE");
  }
  return { ids, results };
}

/** The nightly job: weekly (kept for accuracy), daily and monthly. */
export async function refreshCashForecastSnapshotsForWorkspace(args: { workspaceId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const out: Array<{ horizonType: CashForecastHorizonType; snapshotIds: Record<string, string> }> = [];
  for (const horizonType of ["WEEKLY_13", "DAILY_30", "MONTHLY_12"] as const) {
    const { ids } = await saveHorizonSnapshots({ workspaceId: args.workspaceId, horizonType, generatedBy: "SYSTEM", now });
    out.push({ horizonType, snapshotIds: ids });
  }
  return out;
}
