import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMonthlyPriceForInterval, getPricingRegionFromCountry } from "@/lib/pricing";

const DAY = 86_400_000;

export type PlatformOverview = {
  workspaces: { total: number; demo: number };
  users: number;
  plans: { free: number; trialing: number; pro: number; team: number; suspended: number };
  revenue: { mrr: number; activePaid: number; expiredPaid: number };
  trials: { active: number; endingSoon: number; expired: number };
  growth: { new30: number; prev30: number; signups: Array<{ date: string; count: number }> };
  invoices: { total: number; last30: number; gmv30: number; gmvAll: number };
};

/** Platform numbers from database aggregates. Nothing here loads whole tables into memory, and demo workspaces never count as customers. */
export async function loadPlatformOverview(now = new Date()): Promise<PlatformOverview> {
  const soon = new Date(now.getTime() + 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const d14 = new Date(now.getTime() - 14 * DAY);
  const real = { isDemo: false };

  const [totalWs, demoWs, users, byStatus, paidRows, expiredPaid, trialActive, trialSoon, trialExpired, new30, prev30, recent, invTotal, inv30, gmv] = await Promise.all([
    prisma.workspace.count({ where: real }),
    prisma.workspace.count({ where: { isDemo: true } }),
    prisma.user.count(),
    prisma.workspace.groupBy({ by: ["subscriptionStatus"], where: real, _count: { _all: true } }),
    prisma.workspace.groupBy({ by: ["planInterval", "countryCode"], where: { ...real, subscriptionStatus: { in: ["PRO", "TEAM"] }, subscriptionEndsAt: { gt: now } }, _count: { _all: true } }),
    prisma.workspace.count({ where: { ...real, subscriptionStatus: { in: ["PRO", "TEAM"] }, OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { lte: now } }] } }),
    prisma.workspace.count({ where: { ...real, subscriptionStatus: "TRIALING", subscriptionEndsAt: { gt: now } } }),
    prisma.workspace.count({ where: { ...real, subscriptionStatus: "TRIALING", subscriptionEndsAt: { gt: now, lte: soon } } }),
    prisma.workspace.count({ where: { ...real, subscriptionStatus: "TRIALING", OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { lte: now } }] } }),
    prisma.workspace.count({ where: { ...real, createdAt: { gte: d30 } } }),
    prisma.workspace.count({ where: { ...real, createdAt: { gte: d60, lt: d30 } } }),
    prisma.workspace.findMany({ where: { ...real, createdAt: { gte: d14 } }, select: { createdAt: true } }),
    prisma.invoice.count({ where: { voidedAt: null, workspace: real } }),
    prisma.invoice.count({ where: { voidedAt: null, createdAt: { gte: d30 }, workspace: real } }),
    prisma.$queryRaw<Array<{ allTime: Prisma.Decimal | number | null; last30: Prisma.Decimal | number | null }>>(Prisma.sql`
      SELECT
        SUM(i."grandTotal" * COALESCE(i."exchangeRate", 1)) AS "allTime",
        SUM(CASE WHEN i."createdAt" >= ${d30} THEN i."grandTotal" * COALESCE(i."exchangeRate", 1) ELSE 0 END) AS "last30"
      FROM "Invoice" i JOIN "Workspace" w ON w."id" = i."workspaceId"
      WHERE i."voidedAt" IS NULL AND w."isDemo" = false`),
  ]);

  const count = (s: string) => byStatus.find((r) => r.subscriptionStatus === s)?._count._all ?? 0;
  const mrr = paidRows.reduce((sum, r) => sum + r._count._all * getMonthlyPriceForInterval(r.planInterval, getPricingRegionFromCountry(r.countryCode)), 0);

  const days: Record<string, number> = {};
  for (let i = 13; i >= 0; i -= 1) days[new Date(now.getTime() - i * DAY).toISOString().slice(0, 10)] = 0;
  for (const r of recent) { const k = r.createdAt.toISOString().slice(0, 10); if (k in days) days[k] += 1; }

  return {
    workspaces: { total: totalWs, demo: demoWs },
    users,
    plans: { free: count("FREE"), trialing: count("TRIALING"), pro: count("PRO"), team: count("TEAM"), suspended: count("SUSPENDED") },
    revenue: { mrr: Math.round(mrr), activePaid: paidRows.reduce((s, r) => s + r._count._all, 0), expiredPaid },
    trials: { active: trialActive, endingSoon: trialSoon, expired: trialExpired },
    growth: { new30, prev30, signups: Object.entries(days).map(([date, c]) => ({ date, count: c })) },
    invoices: { total: invTotal, last30: inv30, gmv30: Math.round(Number(gmv[0]?.last30 ?? 0)), gmvAll: Math.round(Number(gmv[0]?.allTime ?? 0)) },
  };
}
