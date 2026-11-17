import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { containsInsensitive } from "@/lib/prisma-filters";
import { effectiveAccess } from "./plans";

export const ACCESS_FILTERS = ["TRIAL", "PAID", "EXPIRED_PAID", "EXPIRED_TRIAL", "FREE", "SUSPENDED"] as const;
export type AccessFilter = (typeof ACCESS_FILTERS)[number];
export const PAGE_SIZE = 25;

export type AccountQuery = { q?: string; access?: AccessFilter; demo?: "only" | "hide" | "all"; page?: number; sort?: "newest" | "oldest" | "name" | "ending" };

/** The filter an access state means in the database, matching effectiveAccess() so the list and the badge never disagree. */
export function accessWhere(access: AccessFilter, now: Date): Prisma.WorkspaceWhereInput {
  const live = { subscriptionEndsAt: { gt: now } };
  const dead = { OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { lte: now } }] };
  switch (access) {
    case "TRIAL": return { subscriptionStatus: "TRIALING", ...live };
    case "PAID": return { subscriptionStatus: { in: ["PRO", "TEAM"] }, ...live };
    case "EXPIRED_PAID": return { subscriptionStatus: { in: ["PRO", "TEAM"] }, ...dead };
    case "EXPIRED_TRIAL": return { subscriptionStatus: "TRIALING", ...dead };
    case "SUSPENDED": return { subscriptionStatus: "SUSPENDED" };
    case "FREE": return { subscriptionStatus: { notIn: ["TRIALING", "PRO", "TEAM", "SUSPENDED"] } };
  }
}

export async function listAccounts(query: AccountQuery, now = new Date()) {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const q = query.q?.trim();
  const and: Prisma.WorkspaceWhereInput[] = [];
  if (query.access) and.push(accessWhere(query.access, now));
  if (query.demo === "only") and.push({ isDemo: true });
  else if (query.demo !== "all") and.push({ isDemo: false });
  if (q) and.push({ OR: [{ name: containsInsensitive(q) }, { id: { equals: q } }, { users: { some: { user: { email: containsInsensitive(q) } } } }] });
  const where: Prisma.WorkspaceWhereInput = and.length ? { AND: and } : {};
  const orderBy: Prisma.WorkspaceOrderByWithRelationInput = query.sort === "oldest" ? { createdAt: "asc" } : query.sort === "name" ? { name: "asc" } : query.sort === "ending" ? { subscriptionEndsAt: "asc" } : { createdAt: "desc" };

  const [total, rows] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, createdAt: true, isDemo: true, countryCode: true, subscriptionStatus: true, planTier: true, planInterval: true, subscriptionEndsAt: true,
        _count: { select: { users: true, invoices: true } },
        users: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, name: true } } } },
      },
    }),
  ]);

  return {
    total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    accounts: rows.map((w) => ({
      id: w.id, name: w.name, createdAt: w.createdAt.toISOString(), isDemo: w.isDemo, country: w.countryCode,
      status: w.subscriptionStatus, tier: w.planTier, interval: w.planInterval, endsAt: w.subscriptionEndsAt?.toISOString() ?? null,
      access: effectiveAccess({ subscriptionStatus: w.subscriptionStatus, planTier: w.planTier, subscriptionEndsAt: w.subscriptionEndsAt, planInterval: w.planInterval }, now),
      members: w._count.users, invoices: w._count.invoices,
      owner: w.users[0]?.user.email ?? null, ownerName: w.users[0]?.user.name ?? null,
    })),
  };
}

export async function loadAccountDetail(id: string, now = new Date()) {
  const w = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true, name: true, createdAt: true, isDemo: true, countryCode: true, baseCurrency: true, subscriptionStatus: true, planTier: true, planInterval: true, subscriptionEndsAt: true,
      billingProvider: true, subscriptionCancelAtPeriodEnd: true, isSetupComplete: true,
      users: { orderBy: { joinedAt: "asc" }, take: 50, select: { role: true, businessRole: true, isActive: true, joinedAt: true, lastActiveAt: true, user: { select: { id: true, email: true, name: true } } } },
      workspaceModules: { where: { isEnabled: true }, select: { moduleKey: true } },
      _count: { select: { invoices: true, clients: true } },
    },
  });
  if (!w) return null;
  const [expenses, recent] = await Promise.all([
    prisma.expense.count({ where: { workspaceId: id } }),
    prisma.appActivityLog.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, status: true, actorEmail: true, createdAt: true } }),
  ]);
  return {
    id: w.id, name: w.name, createdAt: w.createdAt.toISOString(), isDemo: w.isDemo, country: w.countryCode, currency: w.baseCurrency, setupComplete: w.isSetupComplete,
    plan: { status: w.subscriptionStatus, tier: w.planTier, interval: w.planInterval, endsAt: w.subscriptionEndsAt?.toISOString() ?? null, provider: w.billingProvider, cancelAtPeriodEnd: w.subscriptionCancelAtPeriodEnd, access: effectiveAccess({ subscriptionStatus: w.subscriptionStatus, planTier: w.planTier, subscriptionEndsAt: w.subscriptionEndsAt, planInterval: w.planInterval }, now) },
    usage: { invoices: w._count.invoices, clients: w._count.clients, expenses, modules: w.workspaceModules.map((m) => m.moduleKey) },
    members: w.users.map((m) => ({ userId: m.user.id, email: m.user.email, name: m.user.name, role: m.businessRole ?? m.role, active: m.isActive, joinedAt: m.joinedAt.toISOString(), lastActiveAt: m.lastActiveAt?.toISOString() ?? null })),
    recentActivity: recent.map((r) => ({ id: r.id, action: r.action, status: r.status, actor: r.actorEmail, at: r.createdAt.toISOString() })),
  };
}
