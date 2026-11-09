export type BudgetState = "OK" | "NEAR" | "OVER";
export const OVERALL_BUDGET = "*";

export function budgetState(spent: number, limit: number, nearShare = 0.8): BudgetState {
  if (limit <= 0) return "OK";
  if (spent > limit) return "OVER";
  return spent >= limit * nearShare ? "NEAR" : "OK";
}

export type BudgetLine = { category: string; limit: number; spent: number; share: number; state: BudgetState; remaining: number };

/** Joins monthly caps to what was spent this month. A category with no cap is not listed. */
export function budgetLines(budgets: Array<{ category: string; monthlyAmount: number }>, spentByCategory: Record<string, number>, totalSpent: number): BudgetLine[] {
  return budgets
    .map((b) => {
      const spent = b.category === OVERALL_BUDGET ? totalSpent : spentByCategory[b.category] ?? 0;
      const limit = b.monthlyAmount;
      return { category: b.category, limit, spent: Math.round(spent * 100) / 100, share: limit > 0 ? Math.round((spent / limit) * 100) : 0, state: budgetState(spent, limit), remaining: Math.round((limit - spent) * 100) / 100 };
    })
    .sort((a, b) => b.share - a.share);
}

/** Alerts worth telling the person about when this expense pushed a cap over a threshold (crossing, not staying). */
export function budgetCrossings(before: number, after: number, limit: number): Exclude<BudgetState, "OK"> | null {
  const was = budgetState(before, limit);
  const now = budgetState(after, limit);
  return now !== "OK" && now !== was ? now : null;
}
