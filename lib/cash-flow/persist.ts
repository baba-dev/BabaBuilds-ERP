import "server-only";

import { prisma } from "@/lib/prisma";
import type { CashForecastHorizonType, CashForecastScenarioTag } from "@prisma/client";
import { computeCashForecastSnapshot } from "@/lib/cash-flow/forecast-engine";
import { toDecimal } from "@/lib/money";
import type { Prisma } from "@prisma/client";

export async function computeAndPersistCashForecastSnapshot(args: {
  workspaceId: string;
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  generatedBy: "SYSTEM" | "USER" | "RULE_CHANGE" | "DATA_IMPORT";
  now?: Date;
}) {
  const { workspaceId, horizonType, scenarioTag, startDate, generatedBy } = args;
  const now = args.now ?? new Date();

  const computed = await computeCashForecastSnapshot({
    workspaceId,
    horizonType,
    scenarioTag,
    startDate,
    now,
  });

  // Replace existing snapshot for the same horizon/scenario/start/end (idempotent-ish for refresh).
  await prisma.cashForecastSnapshot.deleteMany({
    where: { workspaceId, horizonType, scenarioTag, startDate: computed.startDate, endDate: computed.endDate },
  });

  const snapshot = await prisma.cashForecastSnapshot.create({
    data: {
      workspaceId,
      generatedAt: now,
      horizonType,
      scenarioTag,
      startDate: computed.startDate,
      endDate: computed.endDate,
      openingCash: computed.openingCash,
      closingCash: computed.closingCash,
      totalProjectedInflows: computed.totalProjectedInflows,
      totalProjectedOutflows: computed.totalProjectedOutflows,
      confidenceScore: computed.confidenceScore ?? undefined,
      assumptionsJson: computed.assumptions as Prisma.InputJsonValue,
      generatedBy,
      periods: {
        create: computed.periods.map((p) => ({
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
          lineItems: {
            create: p.lineItems.map((l) => ({
              direction: l.direction!,
              sourceType: l.sourceType,
              sourceId: l.sourceId ?? undefined,
              amount: toDecimal(l.amount),
              expectedDate: l.expectedDate,
              confidence: l.confidence ?? undefined,
              scenarioTag,
              classification: l.classification,
              title: l.title,
              metadataJson: l.metadataJson as Prisma.InputJsonValue,
              explanation: l.explanation ?? undefined,
            })),
          },
        })),
      },
    },
    include: { periods: { include: { lineItems: true } } },
  });

  return { computed, snapshot };
}

export async function refreshCashForecastSnapshotsForWorkspace(args: {
  workspaceId: string;
  now?: Date;
  replaceLatest?: boolean;
}) {
  const now = args.now ?? new Date();
  const startDate = new Date(now);

  const horizons: CashForecastHorizonType[] = ["DAILY_30", "WEEKLY_13", "MONTHLY_12"];
  const scenarios: CashForecastScenarioTag[] = ["BASE", "BEST_CASE", "WORST_CASE"];

  const results: Array<{ horizonType: CashForecastHorizonType; scenarioTag: CashForecastScenarioTag; snapshotId: string }> = [];

  for (const horizonType of horizons) {
    for (const scenarioTag of scenarios) {
      const { snapshot } = await computeAndPersistCashForecastSnapshot({
        workspaceId: args.workspaceId,
        horizonType,
        scenarioTag,
        startDate,
        generatedBy: "SYSTEM",
        now,
      });
      results.push({ horizonType, scenarioTag, snapshotId: snapshot.id });
    }
  }

  return results;
}

// Back-compat name used by APIs
export async function persistCashForecastSnapshot(args: {
  workspaceId: string;
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  now?: Date;
}) {
  const { snapshot } = await computeAndPersistCashForecastSnapshot({
    ...args,
    generatedBy: "USER",
  });
  return { snapshotId: snapshot.id };
}

