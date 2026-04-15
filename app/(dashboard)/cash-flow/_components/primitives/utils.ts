import { differenceInHours } from "date-fns";
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

