import type { Prisma } from "@prisma/client";

export type CashFlowHorizonType = "DAILY_30" | "WEEKLY_13" | "MONTHLY_12";
export type CashFlowScenarioTag = "BASE" | "BEST_CASE" | "WORST_CASE";

export type SnapshotListItem = {
  id: string;
  generatedAt: string;
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
  startDate: string;
  endDate: string;
  openingCash: Prisma.Decimal | string | number;
  closingCash: Prisma.Decimal | string | number;
  totalProjectedInflows: Prisma.Decimal | string | number;
  totalProjectedOutflows: Prisma.Decimal | string | number;
  confidenceScore: number | null;
  generatedBy: string;
};

export type SnapshotPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  bucketLabel: string;
  openingCash: Prisma.Decimal | string | number;
  actualInflows: Prisma.Decimal | string | number;
  projectedInflows: Prisma.Decimal | string | number;
  actualOutflows: Prisma.Decimal | string | number;
  projectedOutflows: Prisma.Decimal | string | number;
  closingCash: Prisma.Decimal | string | number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type SnapshotLineItem = {
  id: string;
  direction: "INFLOW" | "OUTFLOW";
  sourceType: string;
  sourceId: string | null;
  amount: Prisma.Decimal | string | number;
  expectedDate: string;
  confidence: number | null;
  scenarioTag: CashFlowScenarioTag;
  classification: "ACTUAL" | "COMMITTED" | "EXPECTED" | "PREDICTED" | "MANUAL";
  title: string;
  explanation: string | null;
};

export type SnapshotDetail = SnapshotListItem & {
  periods: SnapshotPeriod[];
  lineItems: SnapshotLineItem[];
};

export type AlertsResponse = {
  snapshot: { id: string; generatedAt: string; horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag; startDate: string; endDate: string } | null;
  alerts: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    title: string;
    body: string;
    periodId?: string;
    periodStart?: string;
  }>;
};

export type VarianceResponse = {
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
  snapshot: {
    id: string;
    generatedAt: string;
    startDate: string;
    endDate: string;
    openingCash: Prisma.Decimal | string | number;
    closingCash: Prisma.Decimal | string | number;
  } | null;
  periods: Array<
    SnapshotPeriod & {
      varianceNet: number;
    }
  >;
};

export type CashFlowAlertDto = AlertsResponse["alerts"][number];

