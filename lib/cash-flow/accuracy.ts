import "server-only";
import { prisma } from "@/lib/prisma";

const n = (v: unknown) => { const x = Number(v?.toString?.() ?? v); return Number.isFinite(x) ? x : 0; };

export type AccuracyPeriod = { label: string; start: string; end: string; forecastNet: number; actualNet: number; error: number; forecastClosing: number; actualClosing: number };
export type AccuracyReport = {
  snapshot: { id: string; generatedAt: string; weeksAgo: number } | null;
  periods: AccuracyPeriod[];
  /** 0 to 100: how much of the cash movement the older forecast got right. */
  score: number | null;
  /** Positive when the forecast was too optimistic about net cash. */
  bias: number | null;
  reason?: "NO_HISTORY" | "NOT_ELAPSED" | "NO_BANK_DATA";
};

/** Compare an older weekly forecast with what the bank actually did in the weeks that have since passed. */
export async function forecastAccuracy(workspaceId: string, now = new Date()): Promise<AccuracyReport> {
  const snaps = await prisma.cashForecastSnapshot.findMany({
    where: { workspaceId, horizonType: "WEEKLY_13", scenarioTag: "BASE", generatedAt: { gte: new Date(now.getTime() - 60 * 86_400_000), lte: new Date(now.getTime() - 6 * 86_400_000) } },
    orderBy: { generatedAt: "asc" }, take: 1,
    select: { id: true, generatedAt: true, openingCash: true, periods: { orderBy: { periodStart: "asc" }, select: { bucketLabel: true, periodStart: true, periodEnd: true, closingCash: true, openingCash: true, actualInflows: true, projectedInflows: true, actualOutflows: true, projectedOutflows: true } } },
  });
  const snap = snaps[0];
  if (!snap) return { snapshot: null, periods: [], score: null, bias: null, reason: "NO_HISTORY" };
  const elapsed = snap.periods.filter((p) => p.periodEnd <= now && p.periodStart >= new Date(snap.generatedAt.getTime() - 7 * 86_400_000));
  const snapshot = { id: snap.id, generatedAt: snap.generatedAt.toISOString(), weeksAgo: Math.max(1, Math.round((now.getTime() - snap.generatedAt.getTime()) / (7 * 86_400_000))) };
  if (!elapsed.length) return { snapshot, periods: [], score: null, bias: null, reason: "NOT_ELAPSED" };

  const txs = await prisma.bankTransaction.findMany({
    where: { workspaceId, isInternalTransfer: false, date: { gte: elapsed[0]!.periodStart, lt: elapsed[elapsed.length - 1]!.periodEnd } },
    select: { date: true, amount: true },
  });
  if (!txs.length) return { snapshot, periods: [], score: null, bias: null, reason: "NO_BANK_DATA" };

  let actualClosing = n(elapsed[0]!.openingCash);
  const periods: AccuracyPeriod[] = elapsed.map((p) => {
    const actualNet = txs.filter((t) => t.date >= p.periodStart && t.date < p.periodEnd).reduce((s, t) => s + n(t.amount), 0);
    actualClosing += actualNet;
    const forecastNet = n(p.actualInflows) + n(p.projectedInflows) - n(p.actualOutflows) - n(p.projectedOutflows);
    return { label: p.bucketLabel, start: p.periodStart.toISOString(), end: p.periodEnd.toISOString(), forecastNet, actualNet, error: forecastNet - actualNet, forecastClosing: n(p.closingCash), actualClosing };
  });
  const absErr = periods.reduce((s, p) => s + Math.abs(p.error), 0);
  const scale = Math.max(periods.reduce((s, p) => s + Math.abs(p.actualNet), 0), periods.reduce((s, p) => s + Math.abs(p.forecastNet), 0), 1);
  return { snapshot, periods, score: Math.round(Math.max(0, 1 - absErr / scale) * 100), bias: periods.reduce((s, p) => s + p.error, 0) / periods.length };
}
