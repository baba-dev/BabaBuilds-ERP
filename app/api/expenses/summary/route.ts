import { NextResponse } from "next/server";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { asPeriodKey, resolvePeriod } from "@/lib/expenses/period";
import { expenseSummary } from "@/lib/expenses/queries";

export async function GET(request: Request) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  try {
    const range = resolvePeriod(asPeriodKey(sp.get("period")), auth.ctx.countryCode, new Date(), { from: sp.get("from"), to: sp.get("to") });
    return NextResponse.json({ data: await expenseSummary(auth.ctx.workspaceId, range) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Expense summary failed:", error);
    return expenseError(500, "EXPENSE_SUMMARY_FAILED", "Failed to load the expense summary");
  }
}
