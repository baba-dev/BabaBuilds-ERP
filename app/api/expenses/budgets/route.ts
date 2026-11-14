import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { budgetStatus, listBudgets } from "@/lib/expenses/budget-status";
import { MAX_CATEGORY_LENGTH } from "@/lib/expenses/categories";
import { logActivity } from "@/lib/security/activity-log";

export async function GET() {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const [budgets, status] = await Promise.all([listBudgets(auth.ctx.workspaceId), budgetStatus(auth.ctx.workspaceId)]);
  return NextResponse.json({ data: budgets, status });
}

const body = z.object({ category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH), monthlyAmount: z.number().positive().max(100_000_000_000).nullable() });

/** Sets (or, with a null amount, removes) a monthly cap. Category "*" is the overall cap. Changing budgets needs expenses.approve. */
export async function PUT(request: Request) {
  const auth = await requireExpenseAccess("expenses.approve");
  if (!auth.ok) return auth.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return expenseError(400, "INVALID_BODY", "Choose a category and a monthly amount above zero.");
  const { workspaceId } = auth.ctx;
  const { category, monthlyAmount } = parsed.data;
  if (monthlyAmount === null) await prisma.expenseBudget.deleteMany({ where: { workspaceId, category } });
  else await prisma.expenseBudget.upsert({ where: { workspaceId_category: { workspaceId, category } }, create: { workspaceId, category, monthlyAmount }, update: { monthlyAmount } });
  void logActivity({ action: "expense_budget_set", status: "SUCCESS", workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "expense_budget", id: category }, metadata: { category, monthlyAmount } });
  return NextResponse.json({ success: true, data: await listBudgets(workspaceId) });
}
