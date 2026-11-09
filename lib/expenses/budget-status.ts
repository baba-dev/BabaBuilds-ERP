import "server-only";
import { prisma } from "@/lib/prisma";
import { budgetCrossings, budgetLines, OVERALL_BUDGET, type BudgetLine, type BudgetState } from "./budgets";

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

export function monthRange(now: Date) {
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

export async function listBudgets(workspaceId: string) {
  const rows = await prisma.expenseBudget.findMany({ where: { workspaceId }, orderBy: { category: "asc" } });
  return rows.map((r) => ({ id: r.id, category: r.category, monthlyAmount: num(r.monthlyAmount) }));
}

/** This month's spend against each cap. Only approved entries count. */
export async function budgetStatus(workspaceId: string, now = new Date()): Promise<BudgetLine[]> {
  const budgets = await listBudgets(workspaceId);
  if (budgets.length === 0) return [];
  const { from, to } = monthRange(now);
  const by = await prisma.expense.groupBy({ by: ["category"], where: { workspaceId, approvalStatus: "APPROVED", date: { gte: from, lt: to } }, _sum: { amount: true } });
  const spent: Record<string, number> = {};
  let total = 0;
  for (const r of by) { spent[r.category] = num(r._sum.amount); total += num(r._sum.amount); }
  return budgetLines(budgets.map((b) => ({ category: b.category, monthlyAmount: b.monthlyAmount })), spent, total);
}

/** After an expense is saved: did it push the category (or the overall) cap into "near" or "over" for the first time this month? */
export async function budgetAlertsFor(workspaceId: string, category: string, amount: number, date: Date, now = new Date()): Promise<Array<{ category: string; state: Exclude<BudgetState, "OK">; limit: number; spent: number }>> {
  const { from, to } = monthRange(now);
  if (date < from || date >= to) return [];
  const lines = await budgetStatus(workspaceId, now);
  const out: Array<{ category: string; state: Exclude<BudgetState, "OK">; limit: number; spent: number }> = [];
  for (const l of lines) {
    if (l.category !== category && l.category !== OVERALL_BUDGET) continue;
    const crossing = budgetCrossings(l.spent - amount, l.spent, l.limit);
    if (crossing) out.push({ category: l.category, state: crossing, limit: l.limit, spent: l.spent });
  }
  return out;
}
