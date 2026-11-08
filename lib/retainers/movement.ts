import "server-only";
import { prisma } from "@/lib/prisma";
import type { MrrMovementMonth } from "@/lib/retainers/movement-types";

export type { MrrMovementMonth } from "@/lib/retainers/movement-types";

type Ev = { retainerId: string; type: string; createdAt: Date; metadata: string | null };

const mrrOf = (e: Ev): number | null => {
  if (!e.metadata) return null;
  try {
    const v = (JSON.parse(e.metadata) as { mrr?: unknown }).mrr;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Month-by-month MRR movement from the retainer event log. Every lifecycle event stores the retainer's MRR after it
 * happened; the delta against the previous value is classified as new / expansion / contraction / churn.
 * Retainers created before this log existed start from their current MRR at creation, so history is approximate.
 */
export function computeMovement(
  retainers: Array<{ id: string; createdAt: Date; currentMrr: number }>,
  events: Ev[],
  months: string[],
): MrrMovementMonth[] {
  const byMonth = new Map<string, MrrMovementMonth>(months.map((m) => [m, { month: m, new: 0, expansion: 0, contraction: 0, churn: 0, net: 0, endingMrr: 0 }]));
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = new Map<string, number>();
  const timeline = new Map<string, Array<{ at: Date; mrr: number }>>();

  for (const r of retainers) {
    const evs = events.filter((e) => e.retainerId === r.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const points: Array<{ at: Date; mrr: number }> = [];
    const first = evs.find((e) => e.type === "CREATED");
    if (!first || mrrOf(first) === null) points.push({ at: first?.createdAt ?? r.createdAt, mrr: evs.length ? (mrrOf(evs.find((e) => mrrOf(e) !== null) ?? evs[0]) ?? r.currentMrr) : r.currentMrr });
    for (const e of evs) {
      const m = mrrOf(e);
      if (m !== null) points.push({ at: e.createdAt, mrr: m });
    }
    points.sort((a, b) => a.at.getTime() - b.at.getTime());
    timeline.set(r.id, points);
    last.set(r.id, 0);
    let prev = 0;
    for (const p of points) {
      const row = byMonth.get(key(p.at));
      const delta = Math.round((p.mrr - prev) * 100) / 100;
      if (row && delta !== 0) {
        if (prev === 0 && delta > 0) row.new += delta;
        else if (p.mrr === 0) row.churn += -delta;
        else if (delta > 0) row.expansion += delta;
        else row.contraction += -delta;
      }
      prev = p.mrr;
    }
  }
  for (const m of months) {
    const row = byMonth.get(m)!;
    const [y, mo] = m.split("-").map(Number);
    const end = Date.UTC(y, mo, 1) - 1;
    let total = 0;
    for (const points of timeline.values()) {
      const upTo = points.filter((p) => p.at.getTime() <= end);
      total += upTo.length ? upTo[upTo.length - 1].mrr : 0;
    }
    row.endingMrr = Math.round(total * 100) / 100;
    row.net = Math.round((row.new + row.expansion - row.contraction - row.churn) * 100) / 100;
    for (const k of ["new", "expansion", "contraction", "churn"] as const) row[k] = Math.round(row[k] * 100) / 100;
  }
  return months.map((m) => byMonth.get(m)!);
}

export async function getMrrMovement(workspaceId: string, monthCount = 12, now = new Date()): Promise<MrrMovementMonth[]> {
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const [retainers, events] = await Promise.all([
    prisma.retainer.findMany({ where: { workspaceId }, select: { id: true, createdAt: true, status: true, frequency: true, exchangeRate: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } } }),
    prisma.retainerEvent.findMany({ where: { workspaceId }, select: { retainerId: true, type: true, createdAt: true, metadata: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const { retainerMrr } = await import("@/lib/retainers/mrr");
  return computeMovement(
    retainers.map((r) => ({ id: r.id, createdAt: r.createdAt, currentMrr: retainerMrr({ status: r.status === "ACTIVE" || r.status === "PAUSED" ? "ACTIVE" : r.status, frequency: r.frequency, exchangeRate: r.exchangeRate, items: r.items }) })),
    events,
    months,
  );
}
