import 'server-only';

import { prisma } from '@/lib/prisma';
import { getGroupReportScope } from '@/lib/company-groups/reports';
import { setupHealth, type SetupIssue } from './health';

export type CompanyCard = {
  workspaceId: string; name: string; countryCode: string; baseCurrency: string; relationType: string;
  isPrimary: boolean; isArchived: boolean; isCurrent: boolean;
  members: number; modules: string[]; setup: { score: number; issues: SetupIssue[] };
  /** Figures are in the company's own base currency. */
  revenue30d: number; outstanding: number; overdueCount: number; overdueAmount: number; expenses30d: number; invoices30d: number;
};
export type CurrencyTotal = { currency: string; revenue30d: number; outstanding: number; overdueAmount: number; expenses30d: number; companies: number };
export type CompaniesOverview = { groupId: string; name: string; companies: CompanyCard[]; totals: CurrencyTotal[]; needsAttention: { workspaceId: string; name: string; reason: 'SETUP' | 'OVERDUE' }[] };

const num = (v: unknown) => (v == null ? 0 : Number(v));
const DAY = 86_400_000;

/** One card per company the member can see, with last-30-day money figures and setup health. Totals are per currency, never mixed. */
export async function buildCompaniesOverview(userId: string, groupId: string, currentWorkspaceId: string, now = new Date()): Promise<CompaniesOverview> {
  const scope = await getGroupReportScope(userId, groupId, { includeArchivedCompanies: true });
  const ids = scope.workspaceIds;
  const since = new Date(now.getTime() - 30 * DAY);

  const [group, links, workspaces, members, mods, paid, open, expenses] = await Promise.all([
    prisma.companyGroup.findUnique({ where: { id: groupId }, select: { name: true } }),
    prisma.companyGroupWorkspace.findMany({ where: { companyGroupId: groupId, workspaceId: { in: ids } }, select: { workspaceId: true, relationType: true, isPrimary: true, isActive: true } }),
    prisma.workspace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, countryCode: true, baseCurrency: true, isSetupComplete: true, businessProfile: { select: { address: true, email: true, panNumber: true, gstin: true, accountNumber: true, ifscCode: true } } } }),
    prisma.workspaceUser.groupBy({ by: ['workspaceId'], where: { workspaceId: { in: ids }, isActive: true }, _count: { _all: true } }),
    prisma.workspaceModule.findMany({ where: { workspaceId: { in: ids }, isEnabled: true }, select: { workspaceId: true, moduleKey: true } }),
    prisma.invoice.groupBy({ by: ['workspaceId'], where: { workspaceId: { in: ids }, voidedAt: null, status: { not: 'VOID' }, invoiceDate: { gte: since } }, _sum: { baseGrandTotal: true, grandTotal: true }, _count: { _all: true } }),
    prisma.invoice.findMany({ where: { workspaceId: { in: ids }, voidedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] } }, select: { workspaceId: true, grandTotal: true, amountReceived: true, exchangeRate: true, dueDate: true } }),
    prisma.expense.groupBy({ by: ['workspaceId'], where: { workspaceId: { in: ids }, date: { gte: since } }, _sum: { amount: true } }),
  ]);

  const memberCount = new Map(members.map((m) => [m.workspaceId, m._count._all]));
  const moduleMap = new Map<string, string[]>();
  for (const m of mods) moduleMap.set(m.workspaceId, [...(moduleMap.get(m.workspaceId) ?? []), m.moduleKey]);
  const paidMap = new Map(paid.map((p) => [p.workspaceId, p]));
  const expMap = new Map(expenses.map((e) => [e.workspaceId, num(e._sum.amount)]));
  const openAgg = new Map<string, { outstanding: number; overdueCount: number; overdueAmount: number }>();
  for (const inv of open) {
    const rate = num(inv.exchangeRate) || 1;
    const due = Math.max(0, (num(inv.grandTotal) - num(inv.amountReceived)) * rate);
    const a = openAgg.get(inv.workspaceId) ?? { outstanding: 0, overdueCount: 0, overdueAmount: 0 };
    a.outstanding += due;
    if (inv.dueDate && inv.dueDate < now) { a.overdueCount += 1; a.overdueAmount += due; }
    openAgg.set(inv.workspaceId, a);
  }
  const linkMap = new Map(links.map((l) => [l.workspaceId, l]));

  const companies: CompanyCard[] = workspaces.map((w) => {
    const l = linkMap.get(w.id);
    const p = paidMap.get(w.id);
    const o = openAgg.get(w.id) ?? { outstanding: 0, overdueCount: 0, overdueAmount: 0 };
    return {
      workspaceId: w.id, name: w.name, countryCode: w.countryCode, baseCurrency: w.baseCurrency, relationType: l?.relationType ?? 'MEMBER',
      isPrimary: !!l?.isPrimary, isArchived: l ? !l.isActive : false, isCurrent: w.id === currentWorkspaceId,
      members: memberCount.get(w.id) ?? 0, modules: moduleMap.get(w.id) ?? [], setup: setupHealth({ countryCode: w.countryCode, isSetupComplete: w.isSetupComplete, profile: w.businessProfile }),
      revenue30d: num(p?._sum.baseGrandTotal ?? p?._sum.grandTotal), invoices30d: p?._count._all ?? 0,
      outstanding: o.outstanding, overdueCount: o.overdueCount, overdueAmount: o.overdueAmount, expenses30d: expMap.get(w.id) ?? 0,
    };
  }).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(a.isArchived) - Number(b.isArchived) || a.name.localeCompare(b.name));

  const byCur = new Map<string, CurrencyTotal>();
  for (const c of companies.filter((x) => !x.isArchived)) {
    const t = byCur.get(c.baseCurrency) ?? { currency: c.baseCurrency, revenue30d: 0, outstanding: 0, overdueAmount: 0, expenses30d: 0, companies: 0 };
    t.revenue30d += c.revenue30d; t.outstanding += c.outstanding; t.overdueAmount += c.overdueAmount; t.expenses30d += c.expenses30d; t.companies += 1;
    byCur.set(c.baseCurrency, t);
  }
  const needsAttention = companies.filter((c) => !c.isArchived).flatMap((c) => [
    ...(c.setup.score < 70 ? [{ workspaceId: c.workspaceId, name: c.name, reason: 'SETUP' as const }] : []),
    ...(c.overdueCount > 0 ? [{ workspaceId: c.workspaceId, name: c.name, reason: 'OVERDUE' as const }] : []),
  ]);
  return { groupId, name: group?.name ?? '', companies, totals: [...byCur.values()], needsAttention };
}
