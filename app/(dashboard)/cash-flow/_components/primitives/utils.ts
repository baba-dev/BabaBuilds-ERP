import { differenceInDays, differenceInHours } from "date-fns";
import type { SnapshotDetail, SnapshotLineItem, SnapshotPeriod } from "../types";

export type CashFlowTone = "default" | "positive" | "warning" | "danger";

export function toneForRiskLevel(riskLevel: SnapshotPeriod["riskLevel"]): CashFlowTone {
  switch (riskLevel) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "warning";
    case "LOW":
    default:
      return "default";
  }
}

export function toneForVariance(value: number): CashFlowTone {
  if (!Number.isFinite(value)) return "default";
  if (value >= 0) return "positive";
  if (value < 0) return "danger";
  return "default";
}

export function labelForScenarioTag(tag: string) {
  if (tag === "BASE") return "Base";
  if (tag === "BEST_CASE") return "Best case";
  if (tag === "WORST_CASE") return "Worst case";
  return tag;
}

export function labelForHorizonType(horizon: string) {
  if (horizon === "DAILY_30") return "30 days";
  if (horizon === "WEEKLY_13") return "13 weeks";
  if (horizon === "MONTHLY_12") return "12 months";
  return horizon;
}

export function labelForClassification(cls: SnapshotLineItem["classification"]) {
  switch (cls) {
    case "ACTUAL":
      return "Actual";
    case "COMMITTED":
      return "Committed";
    case "EXPECTED":
      return "Expected";
    case "PREDICTED":
      return "Predicted";
    case "MANUAL":
      return "Manual";
    default:
      return cls;
  }
}

export function labelForDirection(dir: SnapshotLineItem["direction"]) {
  return dir === "INFLOW" ? "Inflow" : "Outflow";
}

export function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function getStaleStatus(generatedAtIso?: string | null, staleAfterHours = 24) {
  if (!generatedAtIso) return { isStale: false, hours: null as number | null };
  const hours = differenceInHours(new Date(), new Date(generatedAtIso));
  return { isStale: hours >= staleAfterHours, hours };
}

export function sumLineItems(items: SnapshotLineItem[]) {
  return items.reduce((acc, i) => acc + Number(i.amount ?? 0), 0);
}

export function topDrivers(items: SnapshotLineItem[], take = 5) {
  return [...items].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0)).slice(0, take);
}

export function isConfidenceLow(item: SnapshotLineItem, threshold = 0.55) {
  const c = item.confidence;
  if (c == null) return false;
  return c < threshold;
}

export function groupByClassification(items: SnapshotLineItem[]) {
  const map = new Map<SnapshotLineItem["classification"], SnapshotLineItem[]>();
  for (const it of items) {
    const key = it.classification;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

export function groupBySourceType(items: SnapshotLineItem[]) {
  const map = new Map<string, SnapshotLineItem[]>();
  for (const it of items) {
    const key = it.sourceType ?? "Unknown";
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

export function sourceRecordHref(item: SnapshotLineItem): string | null {
  if (!item.sourceId) return null;
  // Source types are emitted by the forecast engine (see `lib/cash-flow/sources.ts`)
  switch (item.sourceType) {
    case "INVOICE":
      // Canonical invoice list + generator live under Income/Invoice.
      // We deep-link to invoice detail API-backed view when available; fallback to Income list for now.
      return `/income?invoiceId=${encodeURIComponent(item.sourceId)}`;
    case "RETAINER":
      return `/retainers?retainerId=${encodeURIComponent(item.sourceId)}`;
    case "PURCHASE_ORDER":
      return `/inventory/purchase-orders?poId=${encodeURIComponent(item.sourceId)}`;
    case "BANK_TRANSACTION":
      return `/reconciliation?txId=${encodeURIComponent(item.sourceId)}`;
    case "MANUAL":
      return `/cash-flow/manual-adjustments?adjustmentId=${encodeURIComponent(item.sourceId)}`;
    default:
      return null;
  }
}

export type CrunchSignal = {
  periodId: string;
  bucketLabel: string;
  riskLevel: SnapshotPeriod["riskLevel"];
  closingCash: number;
  tone: CashFlowTone;
};

export function deriveCrunchSignal(snapshot: SnapshotDetail | null): CrunchSignal | null {
  if (!snapshot?.periods?.length) return null;
  const worst = snapshot.periods.reduce((acc, p) => {
    const closing = Number(p.closingCash ?? 0);
    if (!acc) return { p, closing };
    return closing < acc.closing ? { p, closing } : acc;
  }, null as null | { p: SnapshotPeriod; closing: number });
  if (!worst) return null;
  return {
    periodId: worst.p.id,
    bucketLabel: worst.p.bucketLabel,
    riskLevel: worst.p.riskLevel,
    closingCash: worst.closing,
    tone: toneForRiskLevel(worst.p.riskLevel),
  };
}

export type SnapshotAssumptions = {
  minimumCashThreshold?: number;
  collectionsDelayDays?: number;
  inflowHaircutPercent?: number;
  outflowIncreasePercent?: number;
  movePOEarlierLaterDays?: number;
  defaultInvoicePaymentTermsDays?: number;
};

export function getSnapshotAssumptions(snapshot: SnapshotDetail | null): SnapshotAssumptions | null {
  const raw = snapshot?.assumptionsJson;
  if (!raw || typeof raw !== "object") return null;
  return raw as SnapshotAssumptions;
}

export type RunwayResult = {
  kind: "none" | "threshold" | "negative";
  periodId: string;
  bucketLabel: string;
  daysUntil: number | null;
  closingCash: number;
};

export function computeRunway(snapshot: SnapshotDetail | null): RunwayResult | null {
  if (!snapshot?.periods?.length) return null;
  const assumptions = getSnapshotAssumptions(snapshot);
  const threshold = Number(assumptions?.minimumCashThreshold ?? 0);
  const thresholdOk = Number.isFinite(threshold) ? threshold : 0;

  for (const p of snapshot.periods) {
    const closing = Number(p.closingCash ?? 0);
    const start = new Date(p.periodStart);
    const daysUntil = Number.isFinite(start.getTime()) ? Math.max(0, differenceInDays(start, new Date())) : null;
    if (closing < 0) {
      return { kind: "negative", periodId: p.id, bucketLabel: p.bucketLabel, daysUntil, closingCash: closing };
    }
    if (closing <= thresholdOk) {
      return { kind: "threshold", periodId: p.id, bucketLabel: p.bucketLabel, daysUntil, closingCash: closing };
    }
  }
  const last = snapshot.periods[snapshot.periods.length - 1]!;
  return { kind: "none", periodId: last.id, bucketLabel: last.bucketLabel, daysUntil: null, closingCash: Number(last.closingCash ?? 0) };
}

export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

export function confidenceBand(conf: number | null | undefined): ConfidenceBand {
  if (conf == null || !Number.isFinite(conf)) return "unknown";
  if (conf >= 0.8) return "high";
  if (conf >= 0.6) return "medium";
  return "low";
}

export function rollupByConfidence(items: SnapshotLineItem[]) {
  const out = {
    high: { count: 0, amount: 0 },
    medium: { count: 0, amount: 0 },
    low: { count: 0, amount: 0 },
    unknown: { count: 0, amount: 0 },
  } as const;
  for (const it of items) {
    const b = confidenceBand(it.confidence);
    (out as any)[b].count += 1;
    (out as any)[b].amount += Number(it.amount ?? 0);
  }
  return out;
}

export function invoiceBehaviorDelayDays(item: SnapshotLineItem): number | null {
  const raw = item.metadataJson;
  if (!raw || typeof raw !== "object") return null;
  const val = (raw as any).behaviorDelayDays;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function isLatePayerRisk(item: SnapshotLineItem, thresholdDays = 7): boolean {
  const d = invoiceBehaviorDelayDays(item);
  if (d == null) return false;
  return d >= thresholdDays;
}

